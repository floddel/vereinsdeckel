import { describe, expect, it } from "vitest";
import { buildReceipts, type CoasterGroup, coasterState, memberOverview, splitCoasters } from "./member-view";
import type { LineEntry, PaymentEntry } from "./types";

const g = (label: string, count: number, guests = 0): CoasterGroup => ({ key: label.toLowerCase(), label, icon: "beer", count, guests });

let n = 0;
const at = (h: number, day = 10) => new Date(Date.UTC(2026, 9, day, h));
const line = (qty: number, price = 200, extra: Partial<LineEntry & { reason: string }> = {}): LineEntry => ({
  kind: "line",
  id: `l${++n}`,
  at: at(18),
  articleId: "pils",
  articleName: "Pils",
  tallyGroup: "Bier",
  icon: "beer",
  quantity: qty,
  unitPriceCents: price,
  totalCents: qty * price,
  isGuest: false,
  ...extra,
});
const pay = (amount: number, extra: Partial<PaymentEntry & { cashGivenCents: number }> = {}): PaymentEntry => ({
  kind: "payment",
  id: `p${++n}`,
  at: at(22),
  methodId: "cash",
  amountCents: amount,
  tipCents: 0,
  ...extra,
});

describe("splitCoasters", () => {
  it("kleiner Abend: ein Deckel", () => {
    expect(splitCoasters([g("Bier", 7), g("Wurst", 2), g("Cola", 1)])).toHaveLength(1);
  });

  it("mehr Gruppen als Zeilen → zweiter Deckel", () => {
    const coasters = splitCoasters([g("A", 1), g("B", 1), g("C", 1), g("D", 1), g("E", 1)]);
    expect(coasters.map((c) => c.map((x) => x.label))).toEqual([["A", "B", "C", "D"], ["E"]]);
  });

  it("auf dem letzten Deckel bleibt eine Zeile frei für die Summe", () => {
    expect(splitCoasters([g("A", 1), g("B", 1), g("C", 1)]).map((c) => c.length)).toEqual([3]);
    const four = splitCoasters([g("A", 1), g("B", 1), g("C", 1), g("D", 1)]);
    expect(four.map((c) => c.map((x) => x.label))).toEqual([["A", "B", "C"], ["D"]]);
    // große Gruppe am Ende: nur ihre letzte Zeile wandert weiter, Gäste zuletzt
    const big = splitCoasters([g("Bier", 50, 2)]);
    expect(big.map((c) => c.map((x) => [x.count, x.guests]))).toEqual([[[45, 0]], [[5, 2]]]);
  });

  it("sehr große Gruppe wird über Deckel fortgesetzt, nichts geht verloren", () => {
    const coasters = splitCoasters([g("Bier", 70, 3), g("Wurst", 2)]);
    expect(coasters.map((c) => c.map((x) => [x.label, x.count, x.guests]))).toEqual([
      [["Bier", 60, 0]],
      [
        ["Bier", 10, 3],
        ["Wurst", 2, 0],
      ],
    ]);
  });
});

describe("coasterState", () => {
  it("ohne Buchungen: leer", () => {
    expect(coasterState([]).status).toBe("empty");
  });

  it("offen: Striche je Strich-Gruppe, Stornos verrechnet", () => {
    const s = coasterState([line(3), line(-1, 200, { reversesLineId: "x" }), line(2, 300, { articleName: "Bratwurst", tallyGroup: "Wurst", icon: "sausage" })]);
    expect(s.status).toBe("open");
    expect(s.openCents).toBe(1000);
    expect(s.coasters[0].map((c) => [c.label, c.count])).toEqual([
      ["Bier", 2],
      ["Wurst", 2],
    ]);
    expect(s.strokes).toBe(4);
  });

  it("alles bezahlt: beglichen, keine Striche", () => {
    const s = coasterState([line(2), pay(400)]);
    expect(s).toMatchObject({ status: "settled", openCents: 0, coasters: [], strokes: 0 });
  });

  it("Teilzahlung: Striche bleiben, Betrag sinkt", () => {
    const s = coasterState([line(5), pay(400)]);
    expect(s.status).toBe("open");
    expect(s.openCents).toBe(600);
    expect(s.strokes).toBe(5);
  });
});

describe("buildReceipts", () => {
  it("ein Zettel je Abend, neuester zuerst, mit offenem Betrag danach", () => {
    const receipts = buildReceipts([
      { businessDate: "2026-10-10", title: null, lines: [line(2), line(1, 150, { isGuest: true, articleName: "Cola" })], payments: [] },
      {
        businessDate: "2026-10-17",
        title: "Abfischen",
        lines: [line(1, 200, { at: at(19, 17) }), line(-1, 200, { at: at(19, 17), reason: "Falsch getippt" })],
        payments: [pay(550, { at: at(23, 17), tipCents: 50, cashGivenCents: 600 })],
      },
      { businessDate: "2026-10-24", title: null, lines: [], payments: [] },
    ]);
    expect(receipts.map((r) => r.businessDate)).toEqual(["2026-10-17", "2026-10-10"]);
    const [second, first] = receipts;
    expect(first).toMatchObject({ totalCents: 550, paidCents: 0, openAfterCents: 550 });
    expect(first.lines[1]).toMatchObject({ isGuest: true, reversal: false });
    expect(second).toMatchObject({ title: "Abfischen", totalCents: 0, paidCents: 550, tipCents: 50, openAfterCents: 0 });
    expect(second.lines[1]).toMatchObject({ reversal: true, reason: "Falsch getippt" });
    expect(second.payments[0]).toMatchObject({ cashGivenCents: 600, reversal: false });
  });
});

describe("memberOverview", () => {
  it("Ausgaben Monat/Jahr/gesamt, Abende, Lieblingsartikel (Stornos verrechnet)", () => {
    const o = memberOverview(
      [
        { businessDate: "2025-12-31", title: null, lines: [line(10)], payments: [] },
        {
          businessDate: "2026-09-20",
          title: null,
          lines: [line(2), line(1, 300, { articleName: "Bratwurst" })],
          payments: [],
        },
        {
          businessDate: "2026-10-03",
          title: null,
          lines: [line(3), line(-3, 200, { reversesLineId: "x" }), line(2, 300, { articleName: "Bratwurst" })],
          payments: [pay(500)],
        },
        { businessDate: "2026-10-10", title: null, lines: [], payments: [pay(100)] },
      ],
      "2026-10-15",
    );
    expect(o).toEqual({
      monthCents: 600,
      yearCents: 1300,
      totalCents: 3300,
      evenings: 3,
      eveningsThisYear: 2,
      favorites: [
        { name: "Pils", quantity: 12 },
        { name: "Bratwurst", quantity: 3 },
      ],
    });
  });
});
