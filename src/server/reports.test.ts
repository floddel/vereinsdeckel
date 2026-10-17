import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { article, member } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import type { ThekeOp } from "@/domain/theke";
import { createPurchase } from "./purchases";
import { getEveningReport, getPeriodReport, listEvenings, neighbourEvenings } from "./reports";
import { applyOps } from "./theke/apply-ops";

let db: Db;
let klaus: string;
let pils: string;
let glas: string;
let flasche: string;
let wurst: string;

beforeEach(async () => {
  db = await createTestDb();
  [{ id: klaus }] = await db.insert(member).values({ name: "Klaus Müller" }).returning();
  [{ id: pils }, { id: glas }, { id: wurst }] = await db
    .insert(article)
    .values([
      { name: "Pils", categoryId: "getraenke", priceCents: 100 },
      { name: "Wein Glas", categoryId: "getraenke", priceCents: 250, servingMl: 250, bottleMl: 1000 },
      { name: "Bockwurst", categoryId: "essen", priceCents: 150, trackStock: false },
    ])
    .returning();
  [{ id: flasche }] = await db
    .insert(article)
    .values({ name: "Wein Flasche", categoryId: "getraenke", priceCents: 800, servingMl: 1000, bottleMl: 1000, stockArticleId: glas })
    .returning();
  // Pils 0,60 €/Fl., Wein 3,49 €/l
  await createPurchase(
    db,
    {
      purchasedOn: "2026-10-01",
      source: "opening",
      note: null,
      lines: [
        { articleId: pils, description: "", quantity: 100, totalCents: 6000 },
        { articleId: glas, description: "", quantity: 4, bottleMl: 1000, totalCents: 1396 },
      ],
    },
    null,
  );
});

const evening = (day: string) => new Date(`${day}T19:00:00Z`);
const run = (ops: ThekeOp[], day: string) => applyOps(db, ops, { deviceId: "t", cutoffHour: 6, now: evening(day) });
const sale = (day: string, items: [string, string, number, number][], isGuest = false) => ({
  type: "sale" as const,
  id: randomUUID(),
  memberId: klaus,
  createdAt: evening(day).toISOString(),
  lines: items.map(([articleId, articleName, quantity, unitPriceCents]) => ({ id: randomUUID(), articleId, articleName, quantity, unitPriceCents, isGuest })),
});
const pay = (day: string, amountCents: number, tipCents: number, methodId = "cash") => ({
  type: "payment" as const,
  id: randomUUID(),
  memberId: klaus,
  createdAt: evening(day).toISOString(),
  methodId,
  amountCents,
  tipCents,
  cashGivenCents: null,
  saleId: null,
});

describe("Abendabschluss", () => {
  it("Umsatz, Zahlungen, Trinkgeld, Storno, Wareneinsatz und Gewinn eines Abends", async () => {
    const first = sale("2026-10-09", [
      [pils, "Pils", 10, 100],
      [flasche, "Wein Flasche", 1, 800],
      [wurst, "Bockwurst", 2, 150],
    ]);
    await run([first], "2026-10-09");
    await run([{ type: "reversal", id: randomUUID(), saleId: first.id, createdAt: evening("2026-10-09").toISOString(), reason: "Versehen", lines: [{ lineId: first.lines[0].id, quantity: 2 }] }], "2026-10-09");
    await run([pay("2026-10-09", 1500, 100)], "2026-10-09");

    const r = (await getEveningReport(db, "2026-10-09"))!;
    // 8 Pils + 1 Flasche + 2 Würste
    expect(r.summary).toMatchObject({ revenueCents: 800 + 800 + 300, reversedCents: 200, paidCents: 1500, tipCents: 100 });
    // Pils 8 × 60 + Flasche 1000 ml × 0,349 = 480 + 349; Wurst ohne Einkaufspreis
    expect(r.summary.costCents).toBe(829);
    expect(r.summary.uncostedRevenueCents).toBe(300);
    expect(r).toMatchObject({ receipts: 1, members: 1 });
    expect(r.reversals).toEqual([{ at: expect.any(Date), memberName: "Klaus Müller", reason: "Versehen", totalCents: 200, items: "2× Pils" }]);

    expect(await getEveningReport(db, "2026-10-10")).toBeNull();
  });

  it("Liste der Abende, neueste zuerst, mit Nachbarn", async () => {
    await run([sale("2026-10-02", [[pils, "Pils", 5, 100]])], "2026-10-02");
    await run([sale("2026-10-09", [[pils, "Pils", 3, 100]]), pay("2026-10-09", 800, 0)], "2026-10-09");
    const list = await listEvenings(db);
    expect(list.map((e) => [e.businessDate, e.revenueCents, e.paidCents, e.profitCents])).toEqual([
      ["2026-10-09", 300, 800, 120],
      ["2026-10-02", 500, 0, 200],
    ]);
    expect(await neighbourEvenings(db, "2026-10-09")).toEqual({ prev: "2026-10-02", next: null });
  });
});

describe("Statistik", () => {
  it("Zeitraum mit Vorzeitraum, Diagramm je Abend und Ladenhüter", async () => {
    await run([sale("2026-09-11", [[pils, "Pils", 20, 100]])], "2026-09-11");
    await run([sale("2026-10-02", [[pils, "Pils", 5, 100]])], "2026-10-02");
    await run([sale("2026-10-09", [[flasche, "Wein Flasche", 1, 800]]), pay("2026-10-09", 500, 50, "paypal")], "2026-10-09");

    const r = await getPeriodReport(db, { from: "2026-10-01", to: "2026-10-31" });
    expect(r.previous).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(r).toMatchObject({ evenings: 2, previousEvenings: 1 });
    expect(r.summary.revenueCents).toBe(1300);
    expect(r.previousSummary.revenueCents).toBe(2000);
    expect(r.summary.byMethod).toEqual({ paypal: { amountCents: 500, tipCents: 50 } });
    expect(r.seriesBy).toBe("evening");
    expect(r.series.map((p) => p.revenueCents)).toEqual([500, 800]);
    // Wein wurde (als Flasche) verkauft, Pils auch → keine Ladenhüter
    expect(r.slowMovers).toEqual([]);

    const sept = await getPeriodReport(db, { from: "2026-09-01", to: "2026-09-30" });
    expect(sept.slowMovers.map((s) => s.name)).toEqual(["Wein Glas"]);
  });
});
