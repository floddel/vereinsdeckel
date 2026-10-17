/**
 * CSV für Excel und LibreOffice: Semikolon, Dezimalkomma, deutsches Datum, UTF-8 mit BOM
 * (sonst zeigt Excel die Umlaute falsch an), Zeilenende CRLF.
 */

/**
 * Text, der mit = + - @ (oder Tab/Zeilenumbruch) beginnt, würde Excel als Formel ausführen,
 * z. B. ein Artikelname „=HYPERLINK(…)“. Davor kommt ein ', dann bleibt es Text.
 * Reine Zahlen wie „-3,00“ bleiben unverändert, damit Excel damit rechnen kann.
 */
const neutralize = (v: string) => (/^[=+\-@\t\r\n]/.test(v) && !/^-?\d+(,\d+)?$/.test(v) ? `'${v}` : v);

export const csvCell = (raw: string) => {
  const v = neutralize(raw);
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/** Cent → „12,50“ bzw. „-3,00“ (ohne €, damit Excel rechnen kann). */
export const csvEuro = (cents: number) => {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
};

/** „2026-10-15“ → „15.10.2026“ */
export const csvDate = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

/** Zahl mit Dezimalkomma (z. B. Liter „1,75“). */
export const csvNumber = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

export const yesNo = (b: boolean) => (b ? "ja" : "");

export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return "﻿" + rows.map((r) => r.map((c) => csvCell(String(c))).join(";")).join("\r\n") + "\r\n";
}
