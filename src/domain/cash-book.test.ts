import { describe, expect, it } from "vitest";
import { buildCashBook, type CashBookEntry, cashBookCsv } from "./cash-book";

const e = (date: string, amountCents: number, title = "x", hour = 12): CashBookEntry => ({
  date,
  at: new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`),
  kind: "movement",
  title,
  detail: "",
  amountCents,
});

describe("Kassenbuch", () => {
  const entries = [e("2026-10-14", 5000, "Einlage"), e("2026-10-01", 2000, "Abend"), e("2026-10-14", -1500, "Einkauf", 9), e("2026-11-02", -300, "Gebühr")];

  it("chronologisch mit laufendem Bestand", () => {
    const book = buildCashBook(entries);
    expect(book.rows.map((r) => [r.title, r.balanceCents])).toEqual([
      ["Abend", 2000],
      ["Einkauf", 500],
      ["Einlage", 5500],
      ["Gebühr", 5200],
    ]);
    expect(book).toMatchObject({ openingCents: 0, inCents: 7000, outCents: 1800, closingCents: 5200 });
  });

  it("Zeitraum mit Übertrag", () => {
    const book = buildCashBook(entries, "2026-10-14", "2026-10-31");
    expect(book.openingCents).toBe(2000);
    expect(book.rows.map((r) => r.title)).toEqual(["Einkauf", "Einlage"]);
    expect(book.closingCents).toBe(5500);
  });

  it("CSV für Excel: BOM, Semikolon, Dezimalkomma, Anführungszeichen wo nötig", () => {
    const csv = cashBookCsv(buildCashBook([{ ...e("2026-10-14", -1499, "Einkauf"), detail: 'Metro; "Sommerfest"' }]), "Handkasse");
    expect(csv.startsWith("﻿Datum;Topf;Art;")).toBe(true);
    expect(csv).toContain('14.10.2026;Handkasse;Einkauf;"Metro; ""Sommerfest""";;14,99;-14,99');
    expect(csv).toContain("Summe;;0,00;14,99;-14,99");
  });
});
