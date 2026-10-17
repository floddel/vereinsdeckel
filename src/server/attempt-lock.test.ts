import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { clearAttempts, failedAttemptText, reserveAttempt } from "./attempt-lock";

let db: Db;
const now = Date.parse("2026-10-16T19:00:00.000Z");

beforeEach(async () => {
  db = await createTestDb();
});

const row = async () => (await db.select().from(settings).where(eq(settings.id, 1)))[0];

describe("Sperre nach Fehlversuchen", () => {
  it("zählt die Versuche und sperrt beim fünften", async () => {
    for (let i = 1; i <= 4; i++) {
      expect(await reserveAttempt(db, "pin", now)).toMatchObject({ ok: true, attempt: i });
      expect((await row()).pinLockedUntil).toBeNull();
    }
    expect(await reserveAttempt(db, "pin", now)).toMatchObject({ ok: true, attempt: 5 });
    expect((await row()).pinLockedUntil?.getTime()).toBe(now + 5 * 60_000);

    const locked = await reserveAttempt(db, "pin", now + 60_000);
    expect(locked).toEqual({ ok: false, lockedUntil: new Date(now + 5 * 60_000) });
  });

  it("nach Ablauf der Sperre geht es wieder bei Versuch 1 los", async () => {
    for (let i = 0; i < 5; i++) await reserveAttempt(db, "pin", now);
    expect(await reserveAttempt(db, "pin", now + 5 * 60_000)).toMatchObject({ ok: true, attempt: 1 });
    expect((await row()).pinLockedUntil).toBeNull();
  });

  it("richtige Eingabe setzt alles zurück, auch die beim letzten Versuch gesetzte Sperre", async () => {
    for (let i = 0; i < 5; i++) await reserveAttempt(db, "pin", now);
    await clearAttempts(db, "pin");
    expect(await row()).toMatchObject({ pinFailedAttempts: 0, pinLockedUntil: null });
    expect(await reserveAttempt(db, "pin", now)).toMatchObject({ ok: true, attempt: 1 });
  });

  it("20 gleichzeitige Versuche: nur 5 werden geprüft, der Rest ist gesperrt", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveAttempt(db, "pin", now)));
    const allowed = results.filter((r) => r.ok);
    expect(allowed).toHaveLength(5);
    expect(allowed.map((r) => r.ok && r.attempt).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(results.filter((r) => !r.ok)).toHaveLength(15);
  });

  it("Anmeldung und PIN zählen getrennt; die Anmeldung sperrt 15 Minuten", async () => {
    for (let i = 0; i < 5; i++) await reserveAttempt(db, "login", now);
    expect(await row()).toMatchObject({ loginFailedAttempts: 5, pinFailedAttempts: 0, pinLockedUntil: null });
    expect((await row()).loginLockedUntil?.getTime()).toBe(now + 15 * 60_000);
    expect(await reserveAttempt(db, "pin", now)).toMatchObject({ ok: true, attempt: 1 });
    expect(await reserveAttempt(db, "login", now + 14 * 60_000)).toMatchObject({ ok: false });
  });

  it("Meldungstext", () => {
    const slot = (attempt: number) => ({ ok: true as const, attempt, max: 5, lockMinutes: 5 });
    expect(failedAttemptText("PIN falsch", slot(1))).toBe("PIN falsch (noch 4 Versuche)");
    expect(failedAttemptText("PIN falsch", slot(4))).toBe("PIN falsch (noch 1 Versuch)");
    expect(failedAttemptText("PIN falsch", slot(5))).toBe("PIN falsch – für 5 Minuten gesperrt");
  });
});
