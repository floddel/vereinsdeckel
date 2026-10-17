import { describe, expect, it } from "vitest";
import { accountStatus, openBalanceCents, openLines } from "./account";
import type { LineEntry, PaymentEntry } from "./types";

let n = 0;
const t = (min: number) => new Date(Date.UTC(2026, 9, 14, 18, min));
const line = (min: number, qty: number, price = 200, extra: Partial<LineEntry> = {}): LineEntry => ({
  kind: "line",
  id: `l${++n}`,
  at: t(min),
  articleId: "pils",
  articleName: "Pils",
  quantity: qty,
  unitPriceCents: price,
  totalCents: qty * price,
  isGuest: false,
  ...extra,
});
const pay = (min: number, amount: number, tip = 0): PaymentEntry => ({
  kind: "payment",
  id: `p${++n}`,
  at: t(min),
  methodId: "cash",
  amountCents: amount,
  tipCents: tip,
});

describe("openBalanceCents", () => {
  it("leeres Konto ist 0", () => {
    expect(openBalanceCents([])).toBe(0);
  });

  it("Positionen minus Zahlungen", () => {
    expect(openBalanceCents([line(0, 3), line(5, 1, 300), pay(10, 500)])).toBe(400);
  });

  it("Trinkgeld mindert den offenen Betrag nicht", () => {
    expect(openBalanceCents([line(0, 2), pay(10, 400, 100)])).toBe(0);
  });

  it("Teilzahlung", () => {
    expect(openBalanceCents([line(0, 7, 200), pay(10, 1000)])).toBe(400);
  });

  it("Storno einer Position", () => {
    expect(openBalanceCents([line(0, 2), line(1, -1, 200, { reversesLineId: "x" })])).toBe(200);
  });

  it("Storno einer Zahlung macht den Betrag wieder offen", () => {
    expect(openBalanceCents([line(0, 2), pay(10, 400), { ...pay(11, -400), reversesPaymentId: "p" }])).toBe(400);
  });
});

describe("openLines (was steht auf dem Deckel?)", () => {
  it("nach vollständiger Zahlung ist der Deckel leer", () => {
    expect(openLines([line(0, 2), pay(10, 400)])).toEqual([]);
  });

  it("neue Positionen nach dem Bezahlen beginnen einen neuen Deckel", () => {
    const after = line(20, 1);
    expect(openLines([line(0, 2), pay(10, 400), after])).toEqual([after]);
  });

  it("bei Teilzahlung bleiben alle Striche stehen", () => {
    const entries = [line(0, 2), line(5, 3), pay(10, 600)];
    expect(openLines(entries)).toHaveLength(2);
  });

  it("Sofort bezahlen: Position und Zahlung zur gleichen Zeit → leer", () => {
    expect(openLines([pay(0, 200), line(0, 1)])).toEqual([]);
  });

  it("Reihenfolge der Eingabe ist egal", () => {
    const a = line(0, 1);
    const p = pay(10, 200);
    const b = line(20, 1);
    expect(openLines([b, p, a])).toEqual([b]);
  });
});

describe("accountStatus", () => {
  it.each([
    [0, 3000, "settled"],
    [-50, 3000, "settled"],
    [1450, 3000, "open"],
    [3000, 3000, "over-limit"],
    [9999, 0, "open"],
  ] as const)("%i Cent bei Limit %i → %s", (open, limit, status) => {
    expect(accountStatus(open, limit)).toBe(status);
  });
});
