import { randomUUID } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import {
  article,
  cashMovement,
  event,
  file,
  inventoryCount,
  member,
  memberToken,
  payment,
  purchase,
  purchaseLine,
  sale,
  settings,
} from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { planReset } from "@/domain/reset";
import { exportBackup, importBackup, parseBackup } from "./backup";
import { createPurchase } from "./purchases";
import { endTestPhase, isTestPhase, resetData } from "./reset";
import { getStockOverview, recordInventory } from "./stock";
import { applyOps } from "./theke/apply-ops";

const at = "2026-10-15T19:00:00.000Z";
const ctx = { deviceId: "t", cutoffHour: 6, now: new Date(at) };

/** Testphase wie im echten Leben: Anfangsbestand, Inventur, ein Einkauf mit Beleg, Buchungen, Kasse. */
async function testInstallation(): Promise<{ db: Db; klaus: string; pils: string }> {
  const db = await createTestDb();
  const [{ id: klaus }] = await db.insert(member).values({ name: "Klaus Müller" }).returning();
  await db.insert(memberToken).values({ memberId: klaus, token: "geheimer-link-von-klaus-1234567890123456" });
  const [{ id: pils }] = await db.insert(article).values({ name: "Pils", categoryId: "getraenke", priceCents: 200 }).returning();
  await createPurchase(
    db,
    { purchasedOn: "2026-10-01", source: "opening", note: null, lines: [{ articleId: pils, description: "Pils", quantity: 24, totalCents: 1200 }] },
    null,
  );
  await recordInventory(db, { note: null, lines: [{ articleId: pils, countedQty: 20 }] }, new Date("2026-10-02T10:00:00Z"));
  await createPurchase(
    db,
    { purchasedOn: "2026-10-10", source: "cash", note: null, lines: [{ articleId: pils, description: "Pils", quantity: 24, totalCents: 1500 }] },
    { mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) },
  );
  await applyOps(
    db,
    [
      {
        type: "sale",
        id: randomUUID(),
        memberId: klaus,
        createdAt: at,
        lines: [{ id: randomUUID(), articleId: pils, articleName: "Pils", quantity: 3, unitPriceCents: 200, isGuest: false }],
      },
      { type: "payment", id: randomUUID(), memberId: klaus, createdAt: at, methodId: "cash", amountCents: 600, tipCents: 0, cashGivenCents: null, saleId: null },
    ],
    ctx,
  );
  await db.insert(cashMovement).values({ potId: "cash", type: "deposit", amountCents: 5000, note: "Wechselgeld" });
  return { db, klaus, pils };
}

const n = async (db: Db, table: PgTable) => (await db.select({ n: count() }).from(table))[0].n;

// Mehrere Datenbanken je Test – unter Last im vollen Testlauf braucht das etwas länger.
describe("Daten zurücksetzen (Testphase)", { timeout: 30_000 }, () => {
  it("Mitglieder löschen: Buchungen gehen mit, Inventur, Anfangsbestand, Einkäufe und Kasse bleiben", async () => {
    const { db, pils } = await testInstallation();
    const before = (await getStockOverview(db)).rows.find((r) => r.articleId === pils)!;

    const result = await resetData(db, planReset(["mitglieder"], true));
    expect(result).toEqual({ ok: true, deleted: { buchungen: 2, mitglieder: 1 } });

    expect(await n(db, member)).toBe(0);
    expect(await n(db, memberToken)).toBe(0);
    expect(await n(db, sale)).toBe(0);
    expect(await n(db, payment)).toBe(0);
    expect(await n(db, event)).toBe(0);
    expect(await n(db, inventoryCount)).toBe(1);
    expect(await n(db, purchase)).toBe(2);
    expect(await n(db, cashMovement)).toBe(1);
    // Ohne die Verkäufe sind die 3 Pils wieder im Lager
    const after = (await getStockOverview(db)).rows.find((r) => r.articleId === pils)!;
    expect(after.stock).toBe(before.stock + 3);
  });

  it("Einkäufe löschen, Anfangsbestand behalten: Beleg-Foto geht mit, der Anfangsbestand bleibt", async () => {
    const { db } = await testInstallation();
    const result = await resetData(db, planReset(["einkaeufe"], true));
    expect(result).toEqual({ ok: true, deleted: { einkaeufe: 1 } });
    const rest = await db.select({ source: purchase.source }).from(purchase);
    expect(rest).toEqual([{ source: "opening" }]);
    expect(await n(db, purchaseLine)).toBe(1);
    expect(await n(db, file)).toBe(0);
  });

  it("Artikel löschen räumt alles ab, was darauf verweist – auch den Anfangsbestand", async () => {
    const { db } = await testInstallation();
    const result = await resetData(db, planReset(["artikel"], true));
    expect(result).toMatchObject({ ok: true, deleted: { buchungen: 2, einkaeufe: 2, inventuren: 1, artikel: 1 } });
    expect(await n(db, article)).toBe(0);
    expect(await n(db, purchase)).toBe(0);
    expect(await n(db, member)).toBe(1); // nicht ausgewählt
  });

  it("nach dem Beenden der Testphase: kein Zurücksetzen mehr – und die Testphase lässt sich nicht wieder öffnen", async () => {
    const { db } = await testInstallation();
    expect(await isTestPhase(db)).toBe(true);
    await endTestPhase(db);
    expect(await isTestPhase(db)).toBe(false);

    expect(await resetData(db, planReset(["buchungen"], false))).toMatchObject({ ok: false });
    expect(await n(db, sale)).toBe(1);

    // Auch an der App vorbei: Die Datenbank selbst verweigert das Löschen …
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.reset', 'on', true)`);
        await tx.delete(payment);
      }),
    ).rejects.toThrow();
    // … und das Zurücknehmen der Sperre
    await expect(db.update(settings).set({ testPhaseEndedAt: null }).where(eq(settings.id, 1))).rejects.toThrow();
    expect(await isTestPhase(db)).toBe(false);
  });

  it("ohne ausdrückliche Erlaubnis bleibt es auch in der Testphase bei „nur anhängen“", async () => {
    const { db } = await testInstallation();
    await expect(db.delete(payment)).rejects.toThrow();
    await expect(db.execute(sql`truncate ${sale} cascade`)).rejects.toThrow();
  });

  it("alles oder nichts: Scheitert ein Schritt, bleibt alles wie vorher", async () => {
    const { db } = await testInstallation();
    // Ein Bon verweist auf ein Mitglied, das nicht zum Löschen ausgewählt ist – Mitglieder ohne Buchungen geht nicht
    await expect(resetData(db, { areas: ["mitglieder"], keepOpening: true })).rejects.toThrow();
    expect(await n(db, member)).toBe(1);
    expect(await n(db, memberToken)).toBe(1);
    expect(await n(db, sale)).toBe(1);
  });

  it("Theke: Vorgänge von vor dem Zurücksetzen werden verworfen, neue angenommen", async () => {
    const { db, klaus, pils } = await testInstallation();
    await resetData(db, planReset(["buchungen"], false));
    const line = { id: randomUUID(), articleId: pils, articleName: "Pils", quantity: 1, unitPriceCents: 200, isGuest: false };
    const alt = { type: "sale" as const, id: randomUUID(), memberId: klaus, createdAt: "2026-01-01T19:00:00.000Z", lines: [line] };
    const neu = { type: "sale" as const, id: randomUUID(), memberId: klaus, createdAt: new Date().toISOString(), lines: [{ ...line, id: randomUUID() }] };
    const results = await applyOps(db, [alt, neu], { deviceId: "t", cutoffHour: 6 });
    expect(results.map((r) => r.status)).toEqual(["rejected", "ok"]);
    expect(await n(db, sale)).toBe(1);
  });

  it("Umzug per Sicherung: Eine beendete Testphase bleibt beendet", async () => {
    const { db } = await testInstallation();
    await endTestPhase(db);
    const backup = parseBackup(JSON.stringify(await exportBackup(db)));
    if (typeof backup === "string") throw new Error(backup);
    const neu = await createTestDb();
    expect(await importBackup(neu, backup, "alles", "2026-10-17")).toMatchObject({ ok: true });
    expect(await isTestPhase(neu)).toBe(false);
  });
});
