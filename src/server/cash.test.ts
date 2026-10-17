import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { cashCount, event, member, payment } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { buildCashBook } from "@/domain/cash-book";
import { addMovement, getCashBookEntries, getPotOverview, listMovements, recordCount, reverseMovement } from "./cash";
import { createPurchase } from "./purchases";

let db: Db;

beforeEach(async () => {
  db = await createTestDb();
  const [{ id: memberId }] = await db.insert(member).values({ name: "Klaus" }).returning();
  const [{ id: eventId }] = await db.insert(event).values({ businessDate: "2026-10-14" }).returning();
  // 20 € bar (davon 1 € Trinkgeld), 10 € PayPal
  await db.insert(payment).values([
    { id: randomUUID(), memberId, eventId, methodId: "cash", amountCents: 1900, tipCents: 100, createdAt: new Date() },
    { id: randomUUID(), memberId, eventId, methodId: "paypal", amountCents: 1000, tipCents: 0, createdAt: new Date() },
  ]);
});

const balance = async (potId: string) => (await getPotOverview(db)).pots.find((p) => p.id === potId)!.balanceCents;
const mv = (over: Partial<Parameters<typeof addMovement>[1]>) =>
  addMovement(db, { type: "deposit", potId: "cash", toPotId: null, amountCents: 5000, note: "Wechselgeld", ...over });

describe("Kasse", () => {
  it("Soll aus Zahlungen (inkl. Trinkgeld), Einkäufen und Bewegungen", async () => {
    expect(await balance("cash")).toBe(2000);
    expect(await balance("paypal")).toBe(1000);
    await createPurchase(db, { purchasedOn: "2026-10-15", source: "cash", note: null, lines: [{ articleId: null, description: "Kohle", quantity: 1, totalCents: 500 }] }, null);
    await mv({}); // Einlage 50 €
    await mv({ type: "transfer", potId: "paypal", toPotId: "cash", amountCents: 400, note: "PayPal abgehoben" });
    await mv({ type: "paypal_fee", potId: "paypal", amountCents: 35, note: "Gebühr Oktober" });
    expect(await balance("cash")).toBe(2000 - 500 + 5000 + 400);
    expect(await balance("paypal")).toBe(1000 - 400 - 35);
  });

  it("Auslagen: privat vorgestreckt minus Erstattung, nicht mehr erstatten als offen", async () => {
    await createPurchase(db, { purchasedOn: "2026-10-15", source: "private", note: null, lines: [{ articleId: null, description: "Kohle", quantity: 1, totalCents: 1200 }] }, null);
    expect((await getPotOverview(db)).advancesCents).toBe(1200);
    expect(await balance("cash")).toBe(2000); // privat: kein Topf betroffen

    expect(await mv({ type: "reimbursement", amountCents: 1300, note: "Erstattung" })).toMatchObject({ ok: false });
    expect(await mv({ type: "reimbursement", amountCents: 1200, note: "Erstattung" })).toEqual({ ok: true });
    expect((await getPotOverview(db)).advancesCents).toBe(0);
    expect(await balance("cash")).toBe(800);

    // Storno der Erstattung → Auslage wieder offen
    const [r] = await listMovements(db);
    expect(await reverseMovement(db, r.id, "falscher Betrag")).toEqual({ ok: true });
    expect((await getPotOverview(db)).advancesCents).toBe(1200);
  });

  it("Storno einer Umbuchung hebt beide Seiten auf, nur einmal", async () => {
    await mv({ type: "transfer", potId: "paypal", toPotId: "cash", amountCents: 400, note: "abgehoben" });
    const [leg] = await listMovements(db);
    expect(await reverseMovement(db, leg.id, "Tippfehler")).toEqual({ ok: true });
    expect(await reverseMovement(db, leg.id, "nochmal")).toMatchObject({ ok: false });
    expect(await balance("cash")).toBe(2000);
    expect(await balance("paypal")).toBe(1000);
    const list = await listMovements(db);
    expect(list.filter((m) => m.type === "transfer").every((m) => m.reversedReason === "Tippfehler")).toBe(true);
  });

  it("Zählung: Differenz nur protokollieren oder als Korrektur übernehmen", async () => {
    expect(await recordCount(db, { potId: "cash", countedCents: 1950, note: null, applyCorrection: false })).toEqual({ ok: true, differenceCents: -50 });
    expect(await balance("cash")).toBe(2000);

    expect(await recordCount(db, { potId: "cash", countedCents: 1950, note: "Münzen gezählt", applyCorrection: true })).toEqual({
      ok: true,
      differenceCents: -50,
    });
    expect(await balance("cash")).toBe(1950);
    const counts = await db.select().from(cashCount);
    expect(counts).toHaveLength(2);
    expect(counts.filter((c) => c.correctionMovementId)).toHaveLength(1);
  });
});

describe("Kassenbuch", () => {
  it("Abend in einer Zeile, Einkauf und Bewegungen; Bestand = Soll", async () => {
    await createPurchase(db, { purchasedOn: "2026-10-15", source: "cash", note: "Metro", lines: [{ articleId: null, description: "Kohle", quantity: 2, totalCents: 500 }] }, null);
    await mv({ type: "handover", amountCents: 1000, note: "an Kassenwart" });
    const book = buildCashBook(await getCashBookEntries(db, "cash"));
    expect(book.rows.map((r) => [r.title, r.detail, r.amountCents])).toEqual([
      ["Einnahmen Abend", "1 Zahlung, davon 1,00 € Trinkgeld", 2000],
      ["Einkauf", "Metro · 2× Kohle", -500],
      ["Abgabe an den Verein", "an Kassenwart", -1000],
    ]);
    expect(book.closingCents).toBe(await balance("cash"));
  });
});
