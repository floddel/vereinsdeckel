/**
 * Geldbeträge werden überall als ganze Cent (integer) geführt, nie als Kommazahl.
 * Diese Datei enthält nur Umrechnung und Anzeige.
 */

/** Prüft, dass ein Wert wirklich ganze Cent sind. */
export function assertCents(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Betrag muss eine ganze Zahl in Cent sein, erhalten: ${value}`);
  }
}

/**
 * 1450 → "14,50 €" (geschütztes Leerzeichen vor €).
 * Bewusst ohne Intl: Server (Node) und ältere iPads formatieren sonst teils unterschiedlich,
 * und React meldet dann Abweichungen beim Laden der Seite.
 */
export function formatCents(cents: number): string {
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${euros},${String(abs % 100).padStart(2, "0")}\u00a0€`;
}

/**
 * Eingabe aus einem Textfeld → Cent. Akzeptiert "14,50", "14.50", "14", "14,5".
 * Gibt null zurück, wenn die Eingabe kein gültiger Betrag ist.
 */
export function parseEuroToCents(input: string): number | null {
  const s = input.trim().replace(/\s|€/g, "");
  const m = /^(-)?(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const [, minus, euros, frac = ""] = m;
  const cents = Number(euros) * 100 + Number(frac.padEnd(2, "0"));
  return minus ? -cents : cents;
}

/** 1450 → "14,50" (für Eingabefelder, ohne €-Zeichen). */
export function formatCentsPlain(cents: number): string {
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
