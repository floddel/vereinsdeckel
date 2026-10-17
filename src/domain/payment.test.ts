import { describe, expect, it } from "vitest";
import { cashSuggestions, changeCents, splitPayment } from "./payment";

describe("splitPayment", () => {
  it("passend bezahlt", () => {
    expect(splitPayment({ openCents: 1450, receivedCents: 1450, keepChange: false })).toEqual({
      amountCents: 1450,
      tipCents: 0,
      changeCents: 0,
    });
  });

  it("20 € gegeben bei 14,50 € offen → 5,50 € zurück", () => {
    expect(splitPayment({ openCents: 1450, receivedCents: 2000, keepChange: false })).toEqual({
      amountCents: 1450,
      tipCents: 0,
      changeCents: 550,
    });
  });

  it('"Stimmt so" → Mehrbetrag ist Trinkgeld', () => {
    expect(splitPayment({ openCents: 1450, receivedCents: 1500, keepChange: true })).toEqual({
      amountCents: 1450,
      tipCents: 50,
      changeCents: 0,
    });
  });

  it("Teilzahlung", () => {
    expect(splitPayment({ openCents: 1450, receivedCents: 1000, keepChange: false })).toEqual({
      amountCents: 1000,
      tipCents: 0,
      changeCents: 0,
    });
  });

  it("nichts offen + Stimmt so → reines Trinkgeld", () => {
    expect(splitPayment({ openCents: 0, receivedCents: 200, keepChange: true })).toEqual({
      amountCents: 0,
      tipCents: 200,
      changeCents: 0,
    });
  });

  it("nichts offen ohne Trinkgeld → Fehler", () => {
    expect(() => splitPayment({ openCents: 0, receivedCents: 200, keepChange: false })).toThrow();
  });

  it("ungültige Beträge → Fehler", () => {
    expect(() => splitPayment({ openCents: 100, receivedCents: 0, keepChange: false })).toThrow();
    expect(() => splitPayment({ openCents: 100, receivedCents: 1.5, keepChange: false })).toThrow();
  });
});

describe("Rückgeld", () => {
  it("gegeben 20 €, offen 14,50 € → 5,50 €", () => {
    expect(changeCents(2000, 1450)).toBe(550);
  });

  it("Scheinvorschläge", () => {
    expect(cashSuggestions(1450)).toEqual([1450, 1500, 2000, 5000]);
    expect(cashSuggestions(2000)).toEqual([2000, 5000, 10000]);
    expect(cashSuggestions(0)).toEqual([]);
  });
});
