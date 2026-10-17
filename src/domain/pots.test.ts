import { describe, expect, it } from "vitest";
import { countDifferenceCents, outstandingAdvancesCents, potBalances } from "./pots";

const methodPot = { cash: "cash", paypal: "paypal" };

describe("potBalances", () => {
  it("ohne Vorgänge sind alle Töpfe 0", () => {
    expect(potBalances({ payments: [], methodPot, purchases: [], movements: [] })).toEqual({
      cash: 0,
      paypal: 0,
    });
  });

  it("Barzahlung → Handkasse, PayPal-Zahlung → PayPal, Trinkgeld zählt mit", () => {
    expect(
      potBalances({
        payments: [
          { methodId: "cash", amountCents: 1450, tipCents: 50 },
          { methodId: "paypal", amountCents: 800, tipCents: 0 },
        ],
        methodPot,
        purchases: [],
        movements: [],
      }),
    ).toEqual({ cash: 1500, paypal: 800 });
  });

  it("Einkauf mindert den gewählten Topf, privat vorgestreckt keinen", () => {
    expect(
      potBalances({
        payments: [{ methodId: "cash", amountCents: 5000, tipCents: 0 }],
        methodPot,
        purchases: [
          { source: "cash", totalCents: 3000 },
          { source: "private", totalCents: 2000 },
        ],
        movements: [],
      }),
    ).toEqual({ cash: 2000, paypal: 0 });
  });

  it("Anfangsbestand (eigene Ware) bewegt weder Topf noch Auslagen", () => {
    const purchases = [{ source: "opening" as const, totalCents: 85_241 }];
    expect(potBalances({ payments: [], methodPot, purchases, movements: [] })).toEqual({ cash: 0, paypal: 0 });
    expect(outstandingAdvancesCents({ purchases, movements: [] })).toBe(0);
  });

  it("Storno von Zahlung und Einkauf heben sich auf", () => {
    expect(
      potBalances({
        payments: [
          { methodId: "cash", amountCents: 1000, tipCents: 100 },
          { methodId: "cash", amountCents: -1000, tipCents: -100 },
        ],
        methodPot,
        purchases: [
          { source: "paypal", totalCents: 500 },
          { source: "paypal", totalCents: -500 },
        ],
        movements: [],
      }),
    ).toEqual({ cash: 0, paypal: 0 });
  });

  it("Kassenbewegungen: Einlage, Abgabe, Umbuchung, Gebühr", () => {
    expect(
      potBalances({
        payments: [],
        methodPot,
        purchases: [],
        movements: [
          { potId: "cash", amountCents: 10000 }, // Einlage Wechselgeld
          { potId: "cash", amountCents: -5000 }, // Abgabe an den Verein
          { potId: "paypal", amountCents: 2000 }, // Umbuchung bar → PayPal
          { potId: "cash", amountCents: -2000 },
          { potId: "paypal", amountCents: -35 }, // PayPal-Gebühr
        ],
      }),
    ).toEqual({ cash: 3000, paypal: 1965 });
  });

  it("unbekannte Zahlungsart ist ein Fehler", () => {
    expect(() =>
      potBalances({
        payments: [{ methodId: "gold", amountCents: 1, tipCents: 0 }],
        methodPot,
        purchases: [],
        movements: [],
      }),
    ).toThrow();
  });
});

describe("Auslagen (privat vorgestreckt)", () => {
  it("Einkauf privat minus Erstattung", () => {
    expect(
      outstandingAdvancesCents({
        purchases: [
          { source: "private", totalCents: 4500 },
          { source: "cash", totalCents: 1000 },
        ],
        movements: [
          { effectiveType: "reimbursement", amountCents: -3000 },
          { effectiveType: "deposit", amountCents: 1000 },
        ],
      }),
    ).toBe(1500);
  });

  it("Storno einer Erstattung erhöht die Auslagen wieder", () => {
    expect(
      outstandingAdvancesCents({
        purchases: [{ source: "private", totalCents: 4500 }],
        movements: [
          { effectiveType: "reimbursement", amountCents: -4500 },
          { effectiveType: "reimbursement", amountCents: 4500 },
        ],
      }),
    ).toBe(4500);
  });
});

describe("Kassenzählung", () => {
  it("Differenz zum Soll", () => {
    expect(countDifferenceCents(14800, 15000)).toBe(-200);
    expect(countDifferenceCents(15000, 15000)).toBe(0);
  });
});
