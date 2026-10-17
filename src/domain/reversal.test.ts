import { describe, expect, it } from "vitest";
import {
  normalizeReason,
  planLineReversal,
  planPaymentReversal,
  reversibleQuantity,
} from "./reversal";

const original = { id: "l1", quantity: 3, unitPriceCents: 200 };

describe("Storno von Positionen", () => {
  it("komplett stornieren", () => {
    expect(planLineReversal(original, [])).toEqual({
      reversesLineId: "l1",
      quantity: -3,
      unitPriceCents: 200,
      totalCents: -600,
    });
  });

  it("teilweise stornieren", () => {
    expect(planLineReversal(original, [], 1).totalCents).toBe(-200);
  });

  it("nie mehr stornieren als gebucht", () => {
    expect(reversibleQuantity(3, [-1, -1])).toBe(1);
    expect(() => planLineReversal(original, [-1, -1], 2)).toThrow(/höchstens 1/);
    expect(() => planLineReversal(original, [-3])).toThrow();
  });

  it("Storno-Menge muss positiv sein", () => {
    expect(() => planLineReversal(original, [], 0)).toThrow();
  });

  it("Preis des Originals gilt, auch wenn sich der Artikelpreis inzwischen geändert hat", () => {
    expect(planLineReversal({ ...original, unitPriceCents: 180 }, [], 1).totalCents).toBe(-180);
  });
});

describe("Storno von Zahlungen", () => {
  it("dreht Betrag und Trinkgeld um", () => {
    expect(planPaymentReversal({ id: "p1", amountCents: 1450, tipCents: 50 }, false)).toEqual({
      reversesPaymentId: "p1",
      amountCents: -1450,
      tipCents: -50,
    });
  });

  it("nur einmal möglich", () => {
    expect(() => planPaymentReversal({ id: "p1", amountCents: 100, tipCents: 0 }, true)).toThrow();
  });

  it("ein Storno kann nicht storniert werden", () => {
    expect(() =>
      planPaymentReversal({ id: "p2", amountCents: -100, tipCents: 0, reversesPaymentId: "p1" }, false),
    ).toThrow();
  });
});

describe("Begründung", () => {
  it("ist Pflicht", () => {
    expect(() => normalizeReason("   ")).toThrow();
    expect(() => normalizeReason(undefined)).toThrow();
    expect(normalizeReason(" Falsch getippt ")).toBe("Falsch getippt");
  });
});
