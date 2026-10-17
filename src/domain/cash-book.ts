import { csvDate, csvEuro, toCsv } from "./csv";

/**
 * Kassenbuch eines Topfs: alle Ein- und Ausgänge chronologisch mit laufendem Bestand.
 * Mitgliederzahlungen stehen je Abend in einer Zeile (die einzelnen Zahlungen stehen beim Mitglied).
 */

export type CashBookKind = "evening" | "purchase" | "movement";

export interface CashBookEntry {
  /** Kalendertag (YYYY-MM-DD) – Belegdatum */
  date: string;
  /** Zeitpunkt zum Sortieren innerhalb eines Tages */
  at: Date;
  kind: CashBookKind;
  /** z. B. „Einnahmen Abend“, „Einkauf“, „Einlage“ */
  title: string;
  /** Erläuterung, z. B. Notiz, Positionen */
  detail: string;
  /** + Eingang, − Ausgang */
  amountCents: number;
}

export interface CashBookRow extends CashBookEntry {
  balanceCents: number;
}

export interface CashBook {
  /** Bestand vor dem Zeitraum („Übertrag“) */
  openingCents: number;
  rows: CashBookRow[];
  inCents: number;
  outCents: number;
  closingCents: number;
}

const byTime = (a: CashBookEntry, b: CashBookEntry) => a.date.localeCompare(b.date) || a.at.getTime() - b.at.getTime();

/** Zeitraum von–bis (jeweils einschließlich, leer = offen). */
export function buildCashBook(entries: readonly CashBookEntry[], from?: string | null, to?: string | null): CashBook {
  const sorted = [...entries].filter((e) => e.amountCents !== 0).sort(byTime);
  let balance = 0;
  let openingCents = 0;
  let inCents = 0;
  let outCents = 0;
  const rows: CashBookRow[] = [];
  for (const e of sorted) {
    if (to && e.date > to) break;
    balance += e.amountCents;
    if (from && e.date < from) {
      openingCents = balance;
      continue;
    }
    if (e.amountCents > 0) inCents += e.amountCents;
    else outCents -= e.amountCents;
    rows.push({ ...e, balanceCents: balance });
  }
  return { openingCents, rows, inCents, outCents, closingCents: openingCents + inCents - outCents };
}

/** Zeile für die Abendeinnahmen. */
export function eveningTitle(count: number, tipCents: number, formatCents: (c: number) => string): string {
  const n = `${count} ${count === 1 ? "Zahlung" : "Zahlungen"}`;
  return tipCents ? `${n}, davon ${formatCents(tipCents)} Trinkgeld` : n;
}

// ---------------------------------------------------------------------------
// CSV (für Excel/LibreOffice: Semikolon, Dezimalkomma, UTF-8 mit BOM)
// ---------------------------------------------------------------------------

export function cashBookCsv(book: CashBook, potName: string): string {
  const lines = [
    ["Datum", "Topf", "Art", "Beschreibung", "Einnahme", "Ausgabe", "Bestand"],
    ["", potName, "Übertrag", "", "", "", csvEuro(book.openingCents)],
    ...book.rows.map((r) => [
      csvDate(r.date),
      potName,
      r.title,
      r.detail,
      r.amountCents > 0 ? csvEuro(r.amountCents) : "",
      r.amountCents < 0 ? csvEuro(-r.amountCents) : "",
      csvEuro(r.balanceCents),
    ]),
    ["", potName, "Summe", "", csvEuro(book.inCents), csvEuro(book.outCents), csvEuro(book.closingCents)],
  ];
  return toCsv(lines);
}
