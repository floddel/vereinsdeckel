import { describe, expect, it } from "vitest";
import {
  averagePerEvening,
  averageUnitCost,
  costPerUnitCents,
  inventoryDifference,
  needsRestock,
  reachEvenings,
  stockLevel,
  stockRef,
  stockValueCents,
  unitCostCents,
  type StockInputs,
  soldPerEvening,
} from "./stock";

const d = (day: number) => new Date(Date.UTC(2026, 9, day, 18));

describe("stockLevel", () => {
  it("ohne Inventur: Einkäufe − Verkäufe", () => {
    const input: StockInputs = {
      purchases: [{ articleId: "pils", quantity: 24, at: d(1) }],
      sales: [
        { articleId: "pils", quantity: 5, at: d(2) },
        { articleId: "cola", quantity: 3, at: d(2) },
      ],
      inventories: [],
    };
    expect(stockLevel("pils", input)).toBe(19);
    expect(stockLevel("cola", input)).toBe(-3);
  });

  it("Storno eines Verkaufs erhöht den Bestand wieder", () => {
    const input: StockInputs = {
      purchases: [{ articleId: "pils", quantity: 24, at: d(1) }],
      sales: [
        { articleId: "pils", quantity: 2, at: d(2) },
        { articleId: "pils", quantity: -1, at: d(2) },
      ],
      inventories: [],
    };
    expect(stockLevel("pils", input)).toBe(23);
  });

  it("Inventur setzt den Bestand neu, danach zählen nur neue Vorgänge", () => {
    const input: StockInputs = {
      purchases: [
        { articleId: "pils", quantity: 24, at: d(1) },
        { articleId: "pils", quantity: 24, at: d(6) },
      ],
      sales: [
        { articleId: "pils", quantity: 10, at: d(2) },
        { articleId: "pils", quantity: 4, at: d(7) },
      ],
      inventories: [{ at: d(5), lines: [{ articleId: "pils", countedQty: 12 }] }],
    };
    expect(stockLevel("pils", input)).toBe(12 + 24 - 4);
    // erwarteter Bestand zum Zeitpunkt der Inventur (für die Differenz)
    expect(stockLevel("pils", { ...input, inventories: [] }, d(5))).toBe(14);
    expect(inventoryDifference(12, 14)).toBe(-2);
  });

  it("Inventur ohne diesen Artikel ändert seinen Bestand nicht", () => {
    const input: StockInputs = {
      purchases: [{ articleId: "cola", quantity: 12, at: d(1) }],
      sales: [],
      inventories: [{ at: d(5), lines: [{ articleId: "pils", countedQty: 3 }] }],
    };
    expect(stockLevel("cola", input)).toBe(12);
  });
});

describe("Reichweite und Einkaufsliste", () => {
  it("reicht noch ca. X Abende", () => {
    expect(reachEvenings(30, [10, 8, 12])).toBe(3);
    expect(reachEvenings(5, [10])).toBe(0);
    expect(reachEvenings(10, [])).toBeNull();
  });

  it("nur Abende mit Verkauf und nur die letzten 10 zählen", () => {
    expect(reachEvenings(20, [0, 0, 10, 0, 10])).toBe(2);
    expect(reachEvenings(100, [100, ...Array(10).fill(10)])).toBe(10);
  });

  it("Einkaufsliste bei niedriger Reichweite", () => {
    expect(needsRestock(1, 10, 2)).toBe(true);
    expect(needsRestock(5, 50, 2)).toBe(false);
    expect(needsRestock(null, 0, 2)).toBe(true);
  });

  it("Einkaufspreis pro Einheit", () => {
    expect(unitCostCents(1499, 24)).toBe(62);
    expect(unitCostCents(1000, 10)).toBe(100);
    expect(() => unitCostCents(100, 0)).toThrow();
  });
});

describe("Verkauf je Abend", () => {
  it("summiert je Abend (Stornos mindern), chronologisch", () => {
    const m = soldPerEvening([
      { articleId: "pils", quantity: 5, businessDate: "2026-10-14" },
      { articleId: "pils", quantity: 3, businessDate: "2026-10-01" },
      { articleId: "pils", quantity: -1, businessDate: "2026-10-14" },
      { articleId: "cola", quantity: 2, businessDate: "2026-10-14" },
    ]);
    expect(m.get("pils")).toEqual([3, 4]);
    expect(m.get("cola")).toEqual([2]);
  });

  it("Durchschnitt der letzten Abende mit Verkauf", () => {
    expect(averagePerEvening([3, 4])).toBe(3.5);
    expect(averagePerEvening([0, 0])).toBeNull();
    expect(averagePerEvening([10, 1, 2], 2)).toBe(1.5);
  });
});

describe("Einkaufspreis je Portion", () => {
  it("Jack: 0,7 l für 21 € → 4 cl kosten 1,20 €", () => {
    expect(costPerUnitCents({ servingMl: 40, bottleMl: 700, packSize: null }, 2100, 1, null)).toBe(120);
    expect(costPerUnitCents({ servingMl: null, bottleMl: null, packSize: 20 }, 1499, 20, null)).toBe(75);
  });
});

describe("Warenwert", () => {
  it("Ø Einkaufspreis je Einheit über alle Einkäufe mit Preis, Stornos verrechnet", () => {
    // 40 Flaschen für 32 €, 20 Flaschen für 12 € → 44 € / 60
    expect(averageUnitCost([{ quantity: 40, totalCents: 3200 }, { quantity: 20, totalCents: 1200 }, { quantity: 5, totalCents: null }])).toBeCloseTo(4400 / 60);
    expect(averageUnitCost([{ quantity: 20, totalCents: 1200 }, { quantity: -20, totalCents: -1200 }])).toBeNull();
    expect(averageUnitCost([])).toBeNull();
  });

  it("Wert = Bestand × Ø Preis, negativer Bestand zählt als 0", () => {
    expect(stockValueCents(105, 80)).toBe(8400);
    expect(stockValueCents(-3, 80)).toBe(0);
    expect(stockValueCents(10, null)).toBeNull();
    // Ausschank in ml: 1,4 l zu 0,7 l à 7,99 €
    expect(stockValueCents(1400, 799 / 700)).toBe(1598);
  });
});

describe("Aus welchem Bestand verkauft wird", () => {
  const stock = { glas: 8000, pils: 105 };
  it("eigener Bestand, „Bestand aus“ oder unbegrenzt", () => {
    expect(stockRef({ id: "pils", servingMl: null, stockArticleId: null }, stock)).toEqual({ pool: "pils", perUnit: 1 });
    expect(stockRef({ id: "glas", servingMl: 250, stockArticleId: null }, stock)).toEqual({ pool: "glas", perUnit: 250 });
    expect(stockRef({ id: "flasche", servingMl: 1000, stockArticleId: "glas" }, stock)).toEqual({ pool: "glas", perUnit: 1000 });
    // ohne Bestandsführung (nicht in der Liste): unbegrenzt
    expect(stockRef({ id: "spende", servingMl: null, stockArticleId: null }, stock)).toBeNull();
  });
});
