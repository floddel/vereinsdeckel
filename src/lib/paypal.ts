/**
 * PayPal.me-Links ohne Programmierschnittstelle:
 *   https://paypal.me/<Name>/14.50EUR
 * Betrag mit Punkt als Dezimaltrenner und immer zwei Nachkommastellen.
 */

/** PayPal.me-Namen bestehen aus Buchstaben und Ziffern (max. 20 Zeichen). */
export function isValidPaypalName(name: string): boolean {
  return /^[A-Za-z0-9]{1,20}$/.test(name);
}

export function formatPaypalAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error("Betrag muss eine positive ganze Zahl in Cent sein");
  }
  const euros = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  return `${euros}.${rest}EUR`;
}

/** Link mit Betrag; ohne offenen Betrag nur der Link auf das Profil. */
export function paypalMeLink(name: string, cents: number): string {
  const n = name.trim();
  if (!isValidPaypalName(n)) throw new Error(`Ungültiger PayPal.me-Name: "${name}"`);
  const base = `https://paypal.me/${n}`;
  return cents > 0 ? `${base}/${formatPaypalAmount(cents)}` : base;
}
