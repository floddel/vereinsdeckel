import { describe, expect, it } from "vitest";
import { movementInputSchema, planMovement } from "./cash";

const m = (over: Record<string, unknown>) =>
  movementInputSchema.parse({ type: "deposit", potId: "cash", toPotId: null, amountCents: 5000, note: "Wechselgeld", ...over });

describe("Kassenbewegungen", () => {
  it("Einlage +, Abgabe/Gebühr/Ausgabe/Erstattung −", () => {
    expect(planMovement(m({}))).toEqual([{ potId: "cash", type: "deposit", amountCents: 5000 }]);
    expect(planMovement(m({ type: "handover" }))).toEqual([{ potId: "cash", type: "handover", amountCents: -5000 }]);
    expect(planMovement(m({ type: "paypal_fee", potId: "paypal", amountCents: 35 }))).toEqual([
      { potId: "paypal", type: "paypal_fee", amountCents: -35 },
    ]);
    expect(planMovement(m({ type: "reimbursement" }))[0].amountCents).toBe(-5000);
  });

  it("Umbuchung = zwei Zeilen, Summe 0", () => {
    const rows = planMovement(m({ type: "transfer", potId: "paypal", toPotId: "cash" }));
    expect(rows).toEqual([
      { potId: "paypal", type: "transfer", amountCents: -5000 },
      { potId: "cash", type: "transfer", amountCents: 5000 },
    ]);
  });

  it("prüft die Eingaben", () => {
    const bad = (over: Record<string, unknown>) =>
      movementInputSchema.safeParse({ type: "deposit", potId: "cash", toPotId: null, amountCents: 5000, note: "x", ...over }).success;
    expect(bad({ amountCents: 0 })).toBe(false);
    expect(bad({ note: "  " })).toBe(false);
    expect(bad({ type: "transfer", toPotId: "cash" })).toBe(false); // gleicher Topf
    expect(bad({ type: "transfer", toPotId: null })).toBe(false);
    expect(bad({ type: "paypal_fee", potId: "cash" })).toBe(false);
    expect(bad({ type: "count_correction" })).toBe(false); // entsteht nur automatisch
  });
});
