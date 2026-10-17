import { describe, expect, it } from "vitest";
import { isPlausiblePurchaseDate, planPurchaseReversal, purchaseInputSchema, purchaseTotal, unitCostLabel, withReceiptRest } from "./purchase";

const A = "11111111-1111-4111-8111-111111111111";

describe("purchaseInputSchema", () => {
  const base = { purchasedOn: "2026-10-15", source: "cash", note: "", lines: [{ articleId: A, description: "", quantity: 24, totalCents: 1499 }] };

  it("nimmt einen normalen Einkauf an, leere Notiz wird null", () => {
    expect(purchaseInputSchema.parse(base)).toMatchObject({ note: null, lines: [{ quantity: 24, totalCents: 1499 }] });
  });

  it("Position ohne Artikel braucht eine Beschreibung", () => {
    const r = purchaseInputSchema.safeParse({ ...base, lines: [{ articleId: null, description: " ", quantity: 1, totalCents: 299 }] });
    expect(r.success).toBe(false);
    expect(purchaseInputSchema.safeParse({ ...base, lines: [{ articleId: null, description: "Grillkohle", quantity: 1, totalCents: 299 }] }).success).toBe(true);
  });

  it("lehnt leere Einkäufe, 0 Stück, Kommazahlen und unbekannte Quellen ab", () => {
    expect(purchaseInputSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
    expect(purchaseInputSchema.safeParse({ ...base, lines: [{ ...base.lines[0], quantity: 0 }] }).success).toBe(false);
    expect(purchaseInputSchema.safeParse({ ...base, lines: [{ ...base.lines[0], quantity: 1.5 }] }).success).toBe(false);
    expect(purchaseInputSchema.safeParse({ ...base, source: "bank" }).success).toBe(false);
  });
});

describe("Einkäufe", () => {
  it("Datum nicht in der Zukunft", () => {
    expect(isPlausiblePurchaseDate("2026-10-15", "2026-10-15")).toBe(true);
    expect(isPlausiblePurchaseDate("2026-10-16", "2026-10-15")).toBe(true); // Zeitzonen-Spielraum
    expect(isPlausiblePurchaseDate("2026-10-18", "2026-10-15")).toBe(false);
  });

  it("Summe und Storno", () => {
    const lines = [
      { articleId: A, description: "Pils", quantity: 24, bottleMl: null, totalCents: 1499 },
      { articleId: null, description: "Servietten", quantity: 1, bottleMl: null, totalCents: 199 },
    ];
    expect(purchaseTotal(lines)).toBe(1698);
    const rev = planPurchaseReversal(lines);
    expect(rev).toEqual([
      { articleId: A, description: "Pils", quantity: -24, bottleMl: null, totalCents: -1499 },
      { articleId: null, description: "Servietten", quantity: -1, bottleMl: null, totalCents: -199 },
    ]);
    expect(purchaseTotal(lines) + purchaseTotal(rev)).toBe(0);
    expect(() => planPurchaseReversal(rev)).toThrow();
  });
});

describe("unitCostLabel", () => {
  it("zeigt Preis je Stück und den Vergleich zum Vereinspreis", () => {
    expect(unitCostLabel(62)).toBe("je Stück 0,62\u00a0€");
    expect(unitCostLabel(62, 200)).toBe("je Stück 0,62\u00a0€ · Vereinspreis 2,00\u00a0€ (1,38\u00a0€ mehr)");
    expect(unitCostLabel(300, 250)).toBe("je Stück 3,00\u00a0€ · Vereinspreis 2,50\u00a0€ (0,50\u00a0€ weniger)");
    expect(unitCostLabel(120, 300, "4 cl")).toBe("je 4 cl 1,20\u00a0€ · Vereinspreis 3,00\u00a0€ (1,80\u00a0€ mehr)");
  });
});

describe("Bon-Summe statt Einzelpreise", () => {
  it("ohne Einzelpreise und ohne Bon-Summe geht es nicht", () => {
    expect(withReceiptRest([{ totalCents: null }], null)).toMatchObject({ ok: false });
    expect(withReceiptRest([{ totalCents: 500 }], null)).toEqual({ ok: true, rest: 0 });
  });

  it("Rest = Bon-Summe − Einzelpreise", () => {
    expect(withReceiptRest([{ totalCents: null }, { totalCents: 500 }], 4200)).toEqual({ ok: true, rest: 3700 });
    expect(withReceiptRest([{ totalCents: 500 }], 500)).toEqual({ ok: true, rest: 0 });
    expect(withReceiptRest([{ totalCents: 500 }], 400)).toMatchObject({ ok: false });
  });

  it("Schema: Preis darf fehlen, Flaschengröße optional", () => {
    const r = purchaseInputSchema.parse({
      purchasedOn: "2026-10-15",
      source: "cash",
      note: "",
      receiptTotalCents: 4200,
      lines: [{ articleId: A, description: "", quantity: 6, bottleMl: 1250, totalCents: null }],
    });
    expect(r.lines[0]).toMatchObject({ bottleMl: 1250, totalCents: null });
  });
});
