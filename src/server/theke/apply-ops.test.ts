import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { article, event, member, payment, sale, settings } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import type { PaymentOp, ReversalRequest, SaleOp, ThekeOp } from "@/domain/theke";
import { applyOps } from "./apply-ops";
import { createPurchase } from "../purchases";
import { getThekeSnapshot } from "./snapshot";

let db: Db;
let klaus: string;
let peter: string;
let pils: string;
let wurst: string;
const now = new Date("2026-10-15T19:00:00Z"); // 21:00 Uhr in Berlin
const ctx = { deviceId: "tablet-test", cutoffHour: 6, now };

beforeEach(async () => {
  db = await createTestDb();
  [{ id: klaus }, { id: peter }] = await db
    .insert(member)
    .values([{ name: "Klaus Müller" }, { name: "Peter Weiß" }])
    .returning();
  [{ id: pils }, { id: wurst }] = await db
    .insert(article)
    .values([
      { name: "Pils", categoryId: "getraenke", icon: "beer", priceCents: 200 },
      { name: "Bratwurst", categoryId: "essen", icon: "sausage", priceCents: 300 },
    ])
    .returning();
});

function saleOp(memberId: string, items: [string, number, number][], createdAt = now): SaleOp {
  return {
    type: "sale",
    id: randomUUID(),
    memberId,
    createdAt: createdAt.toISOString(),
    lines: items.map(([articleId, quantity, unitPriceCents]) => ({
      id: randomUUID(),
      articleId,
      articleName: articleId === pils ? "Pils" : "Bratwurst",
      quantity,
      unitPriceCents,
      isGuest: false,
    })),
  };
}

const open = async (memberId: string) =>
  (await getThekeSnapshot(db, now)).members.find((m) => m.id === memberId)?.openCents;

describe("applyOps", () => {
  it("speichert einen Bon und legt den Abend automatisch an", async () => {
    const op = saleOp(klaus, [[pils, 2, 200], [wurst, 1, 300]]);
    expect(await applyOps(db, [op], ctx)).toEqual([{ id: op.id, status: "ok" }]);
    expect(await open(klaus)).toBe(700);
    const [e] = await db.select().from(event);
    expect(e.businessDate).toBe("2026-10-15");
  });

  it("doppelt gesendeter Vorgang wird nur einmal gespeichert", async () => {
    const op = saleOp(klaus, [[pils, 1, 200]]);
    await applyOps(db, [op], ctx);
    expect(await applyOps(db, [op, op], ctx)).toEqual([
      { id: op.id, status: "duplicate" },
      { id: op.id, status: "duplicate" },
    ]);
    expect(await open(klaus)).toBe(200);
  });

  it("Buchung um 01:30 Uhr gehört noch zum Vorabend", async () => {
    const late = new Date("2026-10-15T23:30:00Z"); // 01:30 Uhr am 16.10. in Berlin
    await applyOps(db, [saleOp(klaus, [[pils, 1, 200]], late)], { ...ctx, now: late });
    const [e] = await db.select().from(event);
    expect(e.businessDate).toBe("2026-10-15");
  });

  it("Uhr des Tablets weit in der Zukunft → Serverzeit", async () => {
    const op = saleOp(klaus, [[pils, 1, 200]], new Date("2027-01-01T12:00:00Z"));
    await applyOps(db, [op], ctx);
    const [s] = await db.select().from(sale).where(eq(sale.id, op.id));
    expect(s.createdAt.toISOString()).toBe(now.toISOString());
  });

  it("Storno ganz und teilweise, nie mehr als gebucht", async () => {
    const op = saleOp(klaus, [[pils, 3, 200]]);
    const lineId = op.lines[0].id;
    const part: ThekeOp = { type: "reversal", id: randomUUID(), saleId: op.id, createdAt: now.toISOString(), reason: "Falsch getippt", lines: [{ lineId, quantity: 1 }] };
    const rest: ThekeOp = { type: "reversal", id: randomUUID(), saleId: op.id, createdAt: now.toISOString(), reason: "Doppelt gebucht", lines: "all" };
    const again: ThekeOp = { ...rest, id: randomUUID() };
    const results = await applyOps(db, [op, part, rest, again], ctx);
    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "ok", "rejected"]);
    expect(results[3].message).toMatch(/vollständig storniert/);
    expect(await open(klaus)).toBe(0);
  });

  it("Rückgängig im selben Paket wie der Bon (beides noch unterwegs gewesen)", async () => {
    const op = saleOp(klaus, [[pils, 1, 200]]);
    const undo: ThekeOp = { type: "reversal", id: randomUUID(), saleId: op.id, createdAt: now.toISOString(), reason: "Sofort rückgängig", lines: "all" };
    expect((await applyOps(db, [op, undo], ctx)).map((r) => r.status)).toEqual(["ok", "ok"]);
    expect(await open(klaus)).toBe(0);
  });

  it("Umbuchen: Storno bei Klaus, gleiche Positionen und Preise bei Peter", async () => {
    const op = saleOp(klaus, [[pils, 2, 180], [wurst, 1, 300]]);
    const later = new Date(now.getTime() + 60_000).toISOString();
    const move: ThekeOp = { type: "move", id: randomUUID(), newSaleId: randomUUID(), saleId: op.id, toMemberId: peter, createdAt: later, lines: [{ lineId: op.lines[0].id, quantity: 2 }] };
    expect((await applyOps(db, [op, move], ctx)).map((r) => r.status)).toEqual(["ok", "ok"]);
    expect(await open(klaus)).toBe(300);
    expect(await open(peter)).toBe(360);
    const snap = await getThekeSnapshot(db, now);
    expect(snap.todaySales.find((s) => s.id === move.id)?.reason).toBe("Umgebucht auf Peter Weiß");
    expect(snap.recentMemberIds[0]).toBe(peter);
  });

  it("Umbuchen auf dasselbe Mitglied wird abgelehnt und ändert nichts", async () => {
    const op = saleOp(klaus, [[pils, 1, 200]]);
    const move: ThekeOp = { type: "move", id: randomUUID(), newSaleId: randomUUID(), saleId: op.id, toMemberId: klaus, createdAt: now.toISOString(), lines: "all" };
    expect((await applyOps(db, [op, move], ctx))[1].status).toBe("rejected");
    expect(await open(klaus)).toBe(200);
    expect(await db.select().from(sale)).toHaveLength(1);
  });

  it("unbekanntes Mitglied oder unbekannter Artikel → abgelehnt", async () => {
    const r = await applyOps(db, [saleOp(randomUUID(), [[pils, 1, 200]]), saleOp(klaus, [[randomUUID(), 1, 200]])], ctx);
    expect(r.map((x) => x.status)).toEqual(["rejected", "rejected"]);
  });
});

describe("getThekeSnapshot", () => {
  it("liefert aktive Mitglieder alphabetisch, Anwesende über die Bons des Abends", async () => {
    await db.insert(member).values({ name: "Anton Inaktiv", active: false });
    await applyOps(db, [saleOp(peter, [[pils, 1, 200]])], ctx);
    const snap = await getThekeSnapshot(db, now);
    expect(snap.members.map((m) => m.name)).toEqual(["Klaus Müller", "Peter Weiß"]);
    expect(snap.todaySales.map((s) => s.memberId)).toEqual([peter]);
    expect(snap.articles.map((a) => a.name)).toEqual(["Pils", "Bratwurst"]);
  });

  it("liefert den Bestand mit – auch für „Bestand aus“ (ganze Flasche aus dem Glas)", async () => {
    const [{ id: glas }] = await db
      .insert(article)
      .values({ name: "Wein Glas", categoryId: "getraenke", priceCents: 250, servingMl: 250, bottleMl: 1000 })
      .returning();
    await db.insert(article).values([
      { name: "Wein Flasche", categoryId: "getraenke", priceCents: 800, servingMl: 1000, bottleMl: 1000, stockArticleId: glas },
      { name: "Spende", categoryId: "sonstiges", priceCents: 100, trackStock: false },
    ]);
    await createPurchase(
      db,
      { purchasedOn: "2026-10-01", source: "opening", note: null, lines: [{ articleId: glas, description: "", quantity: 2, bottleMl: 1000, totalCents: 700 }, { articleId: pils, description: "", quantity: 20, totalCents: 1600 }] },
      null,
    );
    await applyOps(db, [saleOp(klaus, [[pils, 3, 200]])], ctx);
    const snap = await getThekeSnapshot(db, now);
    const ref = (name: string) => snap.articles.find((a) => a.name === name)?.stock;
    expect(ref("Pils")).toEqual({ pool: pils, perUnit: 1 });
    expect(ref("Wein Flasche")).toEqual({ pool: glas, perUnit: 1000 });
    expect(ref("Spende")).toBeNull();
    expect(snap.stock).toMatchObject({ [pils]: 17, [glas]: 2000 });
  });

  it("am nächsten Abend ist die Liste „heute“ wieder leer, der offene Betrag bleibt", async () => {
    await applyOps(db, [saleOp(klaus, [[pils, 1, 200]])], ctx);
    const tomorrow = new Date("2026-10-16T19:00:00Z");
    const snap = await getThekeSnapshot(db, tomorrow);
    expect(snap.todaySales).toEqual([]);
    expect(snap.members.find((m) => m.id === klaus)?.openCents).toBe(200);
    expect(snap.recentMemberIds).toEqual([klaus]);
  });
});

function payOp(memberId: string, amountCents: number, tipCents = 0, extra: Partial<PaymentOp> = {}): PaymentOp {
  return {
    type: "payment",
    id: randomUUID(),
    memberId,
    createdAt: now.toISOString(),
    methodId: "cash",
    amountCents,
    tipCents,
    cashGivenCents: null,
    saleId: null,
    ...extra,
  };
}

const tips = async () => (await db.select({ tip: payment.tipCents }).from(payment)).reduce((s, p) => s + p.tip, 0);

describe("Zahlungen", () => {
  it("passend bezahlt → beglichen; Teilzahlung → Rest bleibt offen", async () => {
    await applyOps(db, [saleOp(klaus, [[pils, 5, 200]])], ctx);
    await applyOps(db, [payOp(klaus, 400)], ctx);
    expect(await open(klaus)).toBe(600);
    await applyOps(db, [payOp(klaus, 600)], ctx);
    expect(await open(klaus)).toBe(0);
  });

  it("„Stimmt so“: Trinkgeld mindert den offenen Betrag nicht", async () => {
    await applyOps(db, [saleOp(klaus, [[pils, 7, 200]]), payOp(klaus, 1400, 100)], ctx);
    expect(await open(klaus)).toBe(0);
    expect(await tips()).toBe(100);
  });

  it("zu viel bezahlt (z. B. offline mit altem Stand) wird Trinkgeld, nie Guthaben", async () => {
    await applyOps(db, [saleOp(klaus, [[pils, 1, 200]])], ctx);
    await applyOps(db, [payOp(klaus, 500)], ctx);
    expect(await open(klaus)).toBe(0);
    expect(await tips()).toBe(300);
  });

  it("nichts offen und kein Trinkgeld → abgelehnt", async () => {
    const [r] = await applyOps(db, [payOp(klaus, 0)], ctx);
    expect(r.status).toBe("rejected");
  });

  it("Sofort bezahlen: Bon und Zahlung im selben Paket", async () => {
    const s = saleOp(klaus, [[wurst, 1, 300]]);
    const p = payOp(klaus, 300, 0, { saleId: s.id, cashGivenCents: 500 });
    expect((await applyOps(db, [s, p], ctx)).map((r) => r.status)).toEqual(["ok", "ok"]);
    expect(await open(klaus)).toBe(0);
    const [row] = await db.select().from(payment);
    expect([row.saleId, row.cashGivenCents]).toEqual([s.id, 500]);
  });

  it("Zahlung für fremden Bon oder unbekannte Zahlungsart → abgelehnt", async () => {
    const s = saleOp(peter, [[pils, 1, 200]]);
    const r = await applyOps(db, [s, payOp(klaus, 200, 0, { saleId: s.id }), payOp(peter, 200, 0, { methodId: "bitcoin" })], ctx);
    expect(r.map((x) => x.status)).toEqual(["ok", "rejected", "rejected"]);
  });

  it("doppelt gesendete Zahlung zählt nur einmal", async () => {
    await applyOps(db, [saleOp(klaus, [[pils, 5, 200]])], ctx);
    const p = payOp(klaus, 400);
    expect((await applyOps(db, [p, p], ctx)).map((r) => r.status)).toEqual(["ok", "duplicate"]);
    expect(await open(klaus)).toBe(600);
  });

  it("Zahlungs-Storno: ganze Zahlung inkl. Trinkgeld, nur einmal", async () => {
    const p = payOp(klaus, 400, 50);
    const rev: ThekeOp = { type: "payment-reversal", id: randomUUID(), paymentId: p.id, createdAt: now.toISOString(), reason: "Falsch getippt" };
    const again: ThekeOp = { ...rev, id: randomUUID() };
    const r = await applyOps(db, [saleOp(klaus, [[pils, 2, 200]]), p, rev, again], ctx);
    expect(r.map((x) => x.status)).toEqual(["ok", "ok", "ok", "rejected"]);
    expect(r[3].message).toMatch(/bereits storniert/);
    expect(await open(klaus)).toBe(400);
    expect(await tips()).toBe(0);
  });

  it("Stand liefert Zahlungen des Abends; PayPal nur mit PayPal.me-Name", async () => {
    await applyOps(db, [saleOp(klaus, [[pils, 1, 200]]), payOp(klaus, 200)], ctx);
    let snap = await getThekeSnapshot(db, now);
    expect(snap.todayPayments.map((p) => p.amountCents)).toEqual([200]);
    expect(snap.paymentMethods.map((m) => m.id)).toEqual(["cash"]);
    await db.update(settings).set({ paypalName: "AngelvereinTest" });
    snap = await getThekeSnapshot(db, now);
    expect(snap.paymentMethods.map((m) => m.id)).toEqual(["cash", "paypal"]);
    expect(snap.paypalName).toBe("AngelvereinTest");
  });
});

describe("Stand der Theke: offene Posten früherer Abende", () => {
  it("bringt Posten von gestern mit, Teilzahlung wird ausgewiesen, beglichen → nichts mehr", async () => {
    const yesterday = new Date("2026-10-14T19:00:00Z");
    await applyOps(db, [saleOp(klaus, [[pils, 3, 200]], yesterday)], { ...ctx, now: yesterday });
    await applyOps(db, [saleOp(klaus, [[wurst, 1, 300]])], ctx); // heute: steht in todaySales, nicht in carried

    let snap = await getThekeSnapshot(db, now);
    expect(snap.carried[klaus]).toEqual({
      lines: [
        { at: yesterday.toISOString(), businessDate: "2026-10-14", articleName: "Pils", quantity: 3, unitPriceCents: 200, totalCents: 600, isGuest: false },
      ],
      paidCents: 0,
    });
    expect(snap.carried[peter]).toBeUndefined();

    const pay = (amountCents: number, at: Date): PaymentOp => ({
      type: "payment",
      id: randomUUID(),
      memberId: klaus,
      createdAt: at.toISOString(),
      methodId: "cash",
      amountCents,
      tipCents: 0,
      cashGivenCents: null,
      saleId: null,
    });
    await applyOps(db, [pay(200, yesterday)], { ...ctx, now: yesterday });
    snap = await getThekeSnapshot(db, now);
    expect(snap.carried[klaus].paidCents).toBe(200);

    await applyOps(db, [pay(400, yesterday)], { ...ctx, now: yesterday });
    snap = await getThekeSnapshot(db, now);
    expect(snap.carried[klaus]).toBeUndefined();
  });
});

describe("Grenzen der Theke ohne PIN", () => {
  const lastWeek = new Date("2026-10-08T19:00:00Z");
  const reversal = (saleId: string, lines: ReversalRequest, at = now): ThekeOp => ({
    type: "reversal",
    id: randomUUID(),
    saleId,
    createdAt: at.toISOString(),
    reason: "Test",
    lines,
  });

  it("Bon von letzter Woche: kein Storno und kein Umbuchen", async () => {
    const op = saleOp(klaus, [[pils, 1, 300]], lastWeek);
    await applyOps(db, [op], { ...ctx, now: lastWeek });
    const move: ThekeOp = { type: "move", id: randomUUID(), newSaleId: randomUUID(), saleId: op.id, toMemberId: peter, createdAt: now.toISOString(), lines: "all" };
    const r = await applyOps(db, [reversal(op.id, "all"), move], ctx);
    expect(r.map((x) => x.status)).toEqual(["rejected", "rejected"]);
    expect(r[0].message).toMatch(/früheren Abend/);
    expect(await open(klaus)).toBe(300);
    expect(await open(peter)).toBe(0);
  });

  it("Storno am selben Abend geht – auch offline nach Mitternacht nachgereicht", async () => {
    const op = saleOp(klaus, [[pils, 1, 300]]);
    await applyOps(db, [op], ctx);
    const nextMorning = new Date("2026-10-16T09:00:00Z");
    const late = new Date("2026-10-15T23:30:00Z"); // 01:30 Uhr, gehört noch zum 15.
    expect((await applyOps(db, [reversal(op.id, "all", late)], { ...ctx, now: nextMorning }))[0].status).toBe("ok");
    expect(await open(klaus)).toBe(0);
  });

  it("Zahlung von letzter Woche kann an der Theke nicht storniert werden", async () => {
    await applyOps(db, [saleOp(klaus, [[pils, 2, 200]], lastWeek), payOp(klaus, 400, 0, { createdAt: lastWeek.toISOString() })], { ...ctx, now: lastWeek });
    const [p] = await db.select().from(payment);
    const rev: ThekeOp = { type: "payment-reversal", id: randomUUID(), paymentId: p.id, createdAt: now.toISOString(), reason: "Test" };
    const [r] = await applyOps(db, [rev], ctx);
    expect(r.status).toBe("rejected");
    expect(r.message).toMatch(/früheren Abend/);
    expect(await open(klaus)).toBe(0);
  });

  it("Zeit vom Tablet: bis 7 Tage zurück zählt sie (offline), älter gilt die Serverzeit", async () => {
    const sixDays = new Date(now.getTime() - 6 * 24 * 60 * 60_000);
    const longAgo = new Date("2025-12-18T19:00:00Z");
    const a = saleOp(klaus, [[pils, 1, 200]], sixDays);
    const b = saleOp(klaus, [[pils, 1, 200]], longAgo);
    const c = payOp(klaus, 100, 0, { createdAt: longAgo.toISOString() });
    expect((await applyOps(db, [a, b, c], ctx)).map((x) => x.status)).toEqual(["ok", "ok", "ok"]);
    const at = async (id: string) => (await db.select().from(sale).where(eq(sale.id, id)))[0].createdAt.toISOString();
    expect(await at(a.id)).toBe(sixDays.toISOString());
    expect(await at(b.id)).toBe(now.toISOString());
    expect((await db.select().from(payment))[0].createdAt.toISOString()).toBe(now.toISOString());
    expect((await db.select().from(event)).map((e) => e.businessDate).sort()).toEqual(["2026-10-09", "2026-10-15"]);
  });

  it("dieselbe Position mehrfach im Storno wird abgelehnt (kein Minus-Deckel)", async () => {
    const op = saleOp(klaus, [[pils, 1, 200]]);
    await applyOps(db, [op], ctx);
    const L = op.lines[0].id;
    const triple = [1, 2, 3].map(() => ({ lineId: L, quantity: 1 }));
    const move: ThekeOp = { type: "move", id: randomUUID(), newSaleId: randomUUID(), saleId: op.id, toMemberId: peter, createdAt: now.toISOString(), lines: triple };
    const r = await applyOps(db, [reversal(op.id, triple), move], ctx);
    expect(r.map((x) => x.status)).toEqual(["rejected", "rejected"]);
    expect(r[0].message).toMatch(/doppelt/);
    expect(await open(klaus)).toBe(200);
    expect(await open(peter)).toBe(0);
  });

  it("anonymisiertes Mitglied: weder Storno noch Zahlungs-Storno", async () => {
    const op = saleOp(klaus, [[pils, 1, 200]]);
    const p = payOp(klaus, 200);
    await applyOps(db, [op, p], ctx);
    await db.update(member).set({ anonymizedAt: now, name: "Anonym" }).where(eq(member.id, klaus));
    const rev: ThekeOp = { type: "payment-reversal", id: randomUUID(), paymentId: p.id, createdAt: now.toISOString(), reason: "Test" };
    const r = await applyOps(db, [reversal(op.id, "all"), rev], ctx);
    expect(r.map((x) => x.status)).toEqual(["rejected", "rejected"]);
    expect(r.every((x) => x.status === "rejected" && /Mitglied nicht gefunden/.test(x.message ?? ""))).toBe(true);
  });
});

describe("Korrektur aus der Verwaltung (mit PIN)", () => {
  const lastWeek = new Date("2026-10-08T19:00:00Z");
  const verwaltung = { ...ctx, deviceId: "verwaltung", verwaltung: true };

  it("Storno eines Bons von letzter Woche gehört zu dessen Abend", async () => {
    const op = saleOp(klaus, [[pils, 2, 200]], lastWeek);
    await applyOps(db, [op], { ...ctx, now: lastWeek });
    const rev: ThekeOp = { type: "reversal", id: randomUUID(), saleId: op.id, createdAt: now.toISOString(), reason: "Falsch getippt", lines: [{ lineId: op.lines[0].id, quantity: 1 }] };
    expect((await applyOps(db, [rev], verwaltung))[0].status).toBe("ok");

    const [original] = await db.select().from(sale).where(eq(sale.id, op.id));
    const [storno] = await db.select().from(sale).where(eq(sale.id, rev.id));
    expect(storno).toMatchObject({ eventId: original.eventId, deviceId: "verwaltung", reason: "Falsch getippt" });
    expect(storno.createdAt.toISOString()).toBe(lastWeek.toISOString());
    expect(await db.select().from(event)).toHaveLength(1); // kein neuer Abend
    expect(await open(klaus)).toBe(200);
  });

  it("Umbuchen und Zahlungs-Storno von letzter Woche", async () => {
    const op = saleOp(klaus, [[pils, 1, 300]], lastWeek);
    const p = payOp(peter, 0, 0, { createdAt: lastWeek.toISOString() });
    await applyOps(db, [op, saleOp(peter, [[wurst, 1, 300]], lastWeek), { ...p, amountCents: 300 }], { ...ctx, now: lastWeek });
    const move: ThekeOp = { type: "move", id: randomUUID(), newSaleId: randomUUID(), saleId: op.id, toMemberId: peter, createdAt: now.toISOString(), lines: "all" };
    const rev: ThekeOp = { type: "payment-reversal", id: randomUUID(), paymentId: p.id, createdAt: now.toISOString(), reason: "Falsch getippt" };
    expect((await applyOps(db, [move, rev], verwaltung)).map((r) => r.status)).toEqual(["ok", "ok"]);

    expect(await open(klaus)).toBe(0);
    expect(await open(peter)).toBe(600);
    const [moved] = await db.select().from(sale).where(eq(sale.id, move.newSaleId));
    const [reversal] = await db.select().from(payment).where(eq(payment.id, rev.id));
    const [e] = await db.select().from(event);
    expect(moved.eventId).toBe(e.id);
    expect(reversal.eventId).toBe(e.id);
    expect(await db.select().from(event)).toHaveLength(1);
  });

  it("auch die Verwaltung storniert nichts doppelt und nichts bei anonymisierten Mitgliedern", async () => {
    const op = saleOp(klaus, [[pils, 1, 200]], lastWeek);
    await applyOps(db, [op], { ...ctx, now: lastWeek });
    const rev = (): ThekeOp => ({ type: "reversal", id: randomUUID(), saleId: op.id, createdAt: now.toISOString(), reason: "Test", lines: "all" });
    expect((await applyOps(db, [rev(), rev()], verwaltung)).map((r) => r.status)).toEqual(["ok", "rejected"]);

    const other = saleOp(peter, [[pils, 1, 200]], lastWeek);
    await applyOps(db, [other], { ...ctx, now: lastWeek });
    await db.update(member).set({ anonymizedAt: now }).where(eq(member.id, peter));
    const [r] = await applyOps(db, [{ type: "reversal", id: randomUUID(), saleId: other.id, createdAt: now.toISOString(), reason: "Test", lines: "all" }], verwaltung);
    expect(r).toMatchObject({ status: "rejected", message: "Mitglied nicht gefunden" });
  });
});
