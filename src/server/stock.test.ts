import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { article, member } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { getPotOverview } from "./cash";
import { createPurchase } from "./purchases";
import { getStockOverview, listInventories, recordInventory } from "./stock";
import { applyOps } from "./theke/apply-ops";

let db: Db;
let klaus: string;
let pils: string;
let cola: string;

beforeEach(async () => {
  db = await createTestDb();
  [{ id: klaus }] = await db.insert(member).values({ name: "Klaus" }).returning();
  [{ id: pils }, { id: cola }] = await db
    .insert(article)
    .values([
      { name: "Pils", categoryId: "getraenke", priceCents: 200 },
      { name: "Cola", categoryId: "getraenke", priceCents: 150 },
      { name: "Spende", categoryId: "sonstiges", priceCents: 100, trackStock: false },
    ])
    .returning();
});

const sellAt = (articleId: string, quantity: number, at: Date) =>
  applyOps(
    db,
    [
      {
        type: "sale",
        id: randomUUID(),
        memberId: klaus,
        createdAt: at.toISOString(),
        lines: [{ id: randomUUID(), articleId, articleName: "x", quantity, unitPriceCents: 200, isGuest: false }],
      },
    ],
    { deviceId: "t", cutoffHour: 6, now: new Date(at.getTime() + 60_000) },
  );
const sell = (articleId: string, quantity: number, day: string) => sellAt(articleId, quantity, new Date(`${day}T19:00:00Z`));

const row = async (id: string) => (await getStockOverview(db)).rows.find((r) => r.articleId === id)!;

describe("Bestand", () => {
  it("Einkäufe − Verkäufe, Ø je Abend, Reichweite und Einkaufsliste", async () => {
    await createPurchase(db, { purchasedOn: "2026-10-01", source: "cash", note: null, lines: [{ articleId: pils, description: "", quantity: 48, totalCents: 2998 }] }, null);
    await sell(pils, 20, "2026-10-02");
    await sell(pils, 10, "2026-10-09");
    expect(await row(pils)).toMatchObject({ stock: 18, avgPerEvening: 15, reach: 1, restock: true });
    // ohne Einkauf und ohne Verkauf: nichts bekannt → leer = nachkaufen
    expect(await row(cola)).toMatchObject({ stock: 0, avgPerEvening: null, reach: null, restock: true });
    // Artikel ohne Bestandsführung tauchen nicht auf
    expect((await getStockOverview(db)).rows.map((r) => r.name)).toEqual(["Cola", "Pils"]);
  });

  it("Inventur setzt den Bestand neu und protokolliert die Differenz", async () => {
    // Zeitpunkte zählen in Erfassungsreihenfolge: Einkauf (jetzt erfasst) → Verkauf → Inventur → Verkauf
    await createPurchase(db, { purchasedOn: "2026-10-01", source: "cash", note: null, lines: [{ articleId: pils, description: "", quantity: 24, totalCents: 1499 }] }, null);
    const t = Date.now();
    await sellAt(pils, 4, new Date(t + 1_000));
    const r = await recordInventory(db, { note: "Saisonstart", lines: [{ articleId: pils, countedQty: 18 }] }, new Date(t + 2_000));
    expect(r.differences).toBe(1);
    const [inv] = await listInventories(db);
    expect(inv.lines[0]).toMatchObject({ name: "Pils", countedQty: 18, expectedQty: 20, differenceQty: -2 });

    // danach zählen nur neue Vorgänge
    await sellAt(pils, 3, new Date(t + 3_000));
    expect((await row(pils)).stock).toBe(15);
  });

  it("Inaktive Artikel werden nicht gelistet", async () => {
    await db.update(article).set({ active: false }).where(eq(article.id, cola));
    expect((await getStockOverview(db)).rows.map((r) => r.name)).toEqual(["Pils"]);
  });
});

describe("Ausschank-Artikel", () => {
  it("Jack: Einkauf 2 × 0,7 l, Verkauf 10 × 4 cl, Inventur mit angebrochener Flasche", async () => {
    const [{ id: jack }] = await db
      .insert(article)
      .values({ name: "Jack Daniels", categoryId: "getraenke", priceCents: 300, servingMl: 40, bottleMl: 700 })
      .returning();
    await createPurchase(db, { purchasedOn: "2026-10-01", source: "cash", note: null, lines: [{ articleId: jack, description: "", quantity: 2, bottleMl: 700, totalCents: 4200 }] }, null);
    const t = Date.now();
    await sellAt(jack, 10, new Date(t + 1_000));
    expect(await row(jack)).toMatchObject({ stock: 1000, servingMl: 40, bottleMl: 700, avgPerEvening: 10, reach: 2, restock: false });

    // Inventur: 1 volle + ½ Flasche = 1050 ml (50 ml mehr als berechnet)
    await recordInventory(db, { note: null, lines: [{ articleId: jack, countedQty: 1050 }] }, new Date(t + 2_000));
    const [inv] = await listInventories(db);
    expect(inv.lines[0]).toMatchObject({ countedQty: 1050, expectedQty: 1000, differenceQty: 50, inMl: true });
    expect((await row(jack)).stock).toBe(1050);
  });
});

describe("Bestand aus anderem Artikel und Warenwert", () => {
  it("Le Filou: Glas und ganze Flasche teilen einen Bestand, Warenwert zum Einkaufspreis", async () => {
    const [{ id: glas }] = await db
      .insert(article)
      .values({ name: "Le Filou Glas", categoryId: "getraenke", priceCents: 250, servingMl: 250, bottleMl: 1000 })
      .returning();
    const [{ id: flasche }] = await db
      .insert(article)
      .values({ name: "Le Filou Flasche", categoryId: "getraenke", priceCents: 800, servingMl: 1000, bottleMl: 1000, stockArticleId: glas })
      .returning();
    // Anfangsbestand: 8 Flaschen à 1 l für 27,92 €
    await createPurchase(
      db,
      { purchasedOn: "2026-10-15", source: "opening", note: null, lines: [{ articleId: glas, description: "", quantity: 8, bottleMl: 1000, totalCents: 2792 }] },
      null,
    );
    const t = Date.now();
    await sellAt(flasche, 1, new Date(t + 1_000));
    await sellAt(glas, 2, new Date(t + 2_000));

    const overview = await getStockOverview(db);
    expect(overview.rows.map((r) => r.name)).not.toContain("Le Filou Flasche");
    // 8000 − 1000 − 2 × 250 = 6500 ml; Ø je Abend in Gläsern: 4 + 2
    expect(await row(glas)).toMatchObject({ stock: 6500, avgPerEvening: 6, valueCents: Math.round(6500 * (2792 / 8000)) });
    // Pils und Cola haben keinen Einkaufspreis → fehlen in der Summe
    expect(overview.valueCents).toBe(Math.round(6500 * (2792 / 8000)));
  });

  it("Anfangsbestand ändert die Kasse nicht", async () => {
    await createPurchase(db, { purchasedOn: "2026-10-15", source: "opening", note: null, lines: [{ articleId: pils, description: "", quantity: 105, totalCents: 8400 }] }, null);
    const pots = await getPotOverview(db);
    expect(pots.pots.every((p) => p.balanceCents === 0)).toBe(true);
    expect(pots.advancesCents).toBe(0);
    expect(await row(pils)).toMatchObject({ stock: 105, valueCents: 8400 });
  });
});
