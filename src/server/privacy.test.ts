import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { article, foodOrder, foodOrderLine, member, memberToken, sale } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { anonymizeMember, exportMemberData, memberBookingRows } from "./privacy";
import { applyOps } from "./theke/apply-ops";

let db: Db;
let klaus: string;
let peter: string;
let pils: string;
const at = "2026-10-15T19:00:00.000Z";
const ctx = { deviceId: "t", cutoffHour: 6, now: new Date(at) };

beforeEach(async () => {
  db = await createTestDb();
  [{ id: klaus }, { id: peter }] = await db.insert(member).values([{ name: "Klaus Müller" }, { name: "Peter Weiß" }]).returning();
  await db.insert(member).values({ name: "Peter Weißmann" });
  await db.insert(memberToken).values({ memberId: peter, token: "geheimer-link-von-peter-123456789012345" });
  [{ id: pils }] = await db.insert(article).values({ name: "Pils", categoryId: "getraenke", priceCents: 200, trackStock: false }).returning();
});

const saleOp = (memberId: string, quantity: number) => ({
  type: "sale" as const,
  id: randomUUID(),
  memberId,
  createdAt: at,
  lines: [{ id: randomUUID(), articleId: pils, articleName: "Pils", quantity, unitPriceCents: 200, isGuest: false }],
});
const pay = (memberId: string, amountCents: number, tipCents = 0) => ({
  type: "payment" as const,
  id: randomUUID(),
  memberId,
  createdAt: at,
  methodId: "cash",
  amountCents,
  tipCents,
  cashGivenCents: null,
  saleId: null,
});

describe("Datenexport", () => {
  it("enthält alle Daten des Mitglieds, aber nicht den geheimen Link", async () => {
    await applyOps(db, [saleOp(peter, 3), pay(peter, 400, 50)], ctx);
    const [o] = await db.insert(foodOrder).values({ memberId: peter, eventId: (await db.select().from(sale))[0].eventId, note: "mit Senf" }).returning();
    await db.insert(foodOrderLine).values({ foodOrderId: o.id, articleId: pils, quantity: 1 });

    const data = (await exportMemberData(db, peter))!;
    expect(data.mitglied).toMatchObject({ name: "Peter Weiß", aktiv: true });
    expect(data.offenerBetrag).toBe(2);
    expect(data.abende).toHaveLength(1);
    expect(data.abende[0]).toMatchObject({ datum: "2026-10-15", summe: 6, bezahlt: 4, offenDanach: 2 });
    expect(data.abende[0].zahlungen[0]).toMatchObject({ art: "bar", betrag: 4, trinkgeld: 0.5 });
    expect(data.bestellungen[0]).toMatchObject({ wunsch: "mit Senf", positionen: [{ artikel: "Pils", menge: 1 }] });
    expect(data.persoenlicheLinks).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain("geheimer-link");

    expect(await memberBookingRows(db, peter)).toEqual([
      ["Abend", "Art", "Artikel / Zahlungsart", "Menge", "Betrag", "Trinkgeld", "Gast", "Storno", "Grund"],
      ["15.10.2026", "Verzehr", "Pils", 3, "6,00", "", "", "", ""],
      ["15.10.2026", "Zahlung", "bar", "", "4,00", "0,50", "", "", ""],
    ]);
  });
});

describe("Anonymisieren", () => {
  it("nur ohne offenen Betrag", async () => {
    await applyOps(db, [saleOp(peter, 1)], ctx);
    expect(await anonymizeMember(db, peter)).toEqual({ ok: false, error: expect.stringContaining("offenen Betrag") });
  });

  it("Umbuchung trifft auch einen früheren Namen, aber nie ein ähnlich heißendes Mitglied", async () => {
    const [{ id: senior }] = await db.insert(member).values({ name: "Peter Weiß (sen.)" }).returning();
    const move = (saleId: string, lineId: string, toMemberId: string) => ({
      type: "move" as const, id: randomUUID(), newSaleId: randomUUID(), saleId, toMemberId, createdAt: at, lines: [{ lineId, quantity: 1 }],
    });
    const a = saleOp(klaus, 1);
    const b = saleOp(klaus, 1);
    await applyOps(db, [a, b, move(a.id, a.lines[0].id, peter), move(b.id, b.lines[0].id, senior), pay(peter, 200)], ctx);
    // Peter wird umbenannt – der Grund nennt noch den alten Namen
    await db.update(member).set({ name: "Peter W." }).where(eq(member.id, peter));

    expect(await anonymizeMember(db, peter, new Date(at))).toMatchObject({ ok: true });
    const reasons = (await db.select({ reason: sale.reason }).from(sale)).map((r) => r.reason).filter(Boolean).sort();
    expect(reasons).toEqual(["Umgebucht auf Ehemaliges Mitglied #1", "Umgebucht auf Peter Weiß (sen.)"]);
  });

  it("gleichzeitig gebucht: entweder abgelehnt oder nicht anonymisiert – nie eine verlorene Schuld", async () => {
    const [anon, [booked]] = await Promise.all([anonymizeMember(db, peter, new Date(at)), applyOps(db, [saleOp(peter, 1)], ctx)]);
    const [p] = await db.select().from(member).where(eq(member.id, peter));
    if (anon.ok) {
      expect(booked).toMatchObject({ status: "rejected", message: "Mitglied nicht gefunden" });
      expect(await db.select().from(sale).where(eq(sale.memberId, peter))).toHaveLength(0);
    } else {
      expect(booked.status).toBe("ok");
      expect(p.anonymizedAt).toBeNull();
    }
  });

  it("ersetzt den Namen überall, sperrt Links, löscht Bestellungen – Buchungen bleiben", async () => {
    // Bon von Klaus wird auf Peter umgebucht → Grund „Umgebucht auf Peter Weiß“
    const first = saleOp(klaus, 2);
    await applyOps(db, [first], ctx);
    await applyOps(
      db,
      [{ type: "move", id: randomUUID(), newSaleId: randomUUID(), saleId: first.id, toMemberId: peter, createdAt: at, lines: [{ lineId: first.lines[0].id, quantity: 2 }] }],
      ctx,
    );
    await applyOps(db, [pay(peter, 400)], ctx);

    expect(await anonymizeMember(db, peter, new Date(at))).toEqual({ ok: true, newName: "Ehemaliges Mitglied #1" });
    const [p] = await db.select().from(member).where(eq(member.id, peter));
    expect(p).toMatchObject({ name: "Ehemaliges Mitglied #1", active: false, anonymizedAt: new Date(at) });
    expect((await db.select().from(memberToken).where(eq(memberToken.memberId, peter)))[0].revokedAt).not.toBeNull();
    const reasons = (await db.select({ reason: sale.reason }).from(sale)).map((r) => r.reason).filter(Boolean);
    expect(reasons).toEqual(["Umgebucht auf Ehemaliges Mitglied #1"]);
    // Peter Weißmann bleibt unberührt, Buchungen sind noch da
    expect((await db.select().from(member)).map((x) => x.name).sort()).toEqual(["Ehemaliges Mitglied #1", "Klaus Müller", "Peter Weißmann"]);
    expect(await db.select().from(sale)).toHaveLength(3);
    expect(await exportMemberData(db, peter)).toBeNull();
  });

  it("die Ausnahme erlaubt nur den Grundtext – sonst bleibt alles unveränderlich", async () => {
    await applyOps(db, [saleOp(klaus, 1)], ctx);
    const change = (set: ReturnType<typeof sql>, flag: boolean) =>
      db.transaction(async (tx) => {
        if (flag) await tx.execute(sql`select set_config('app.anonymize', 'on', true)`);
        await tx.execute(sql`update ${sale} set ${set}`);
      });
    await expect(change(sql`reason = 'x'`, false)).rejects.toThrow();
    await expect(change(sql`member_id = ${peter}`, true)).rejects.toThrow();
    await expect(db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.anonymize', 'on', true)`);
      await tx.execute(sql`delete from ${sale}`);
    })).rejects.toThrow();
    await change(sql`reason = 'x'`, true);
  });
});
