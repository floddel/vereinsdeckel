/**
 * Storno: niemals löschen, sondern eine Gegenbuchung anlegen.
 * Eine Position kann ganz oder teilweise storniert werden, aber nie mehr als gebucht wurde.
 */

/** Schnell-Begründungen an der Theke (ein Tipp). Freitext ist zusätzlich möglich. */
export const QUICK_REASONS = [
  "Falsch getippt",
  "Doppelt gebucht",
  "Falsches Mitglied",
  "Sonstiges",
] as const;

/** Begründung der Rückgängig-Leiste direkt nach dem Buchen. */
export const UNDO_REASON = "Sofort rückgängig";

export function normalizeReason(reason: string | null | undefined): string {
  const r = (reason ?? "").trim();
  if (!r) throw new Error("Storno braucht eine Begründung");
  return r;
}

/** Wie viel von einer Position noch storniert werden kann. */
export function reversibleQuantity(
  originalQuantity: number,
  reversalQuantities: readonly number[],
): number {
  const reversed = reversalQuantities.reduce((sum, q) => sum - q, 0); // Storno-Mengen sind negativ
  return Math.max(originalQuantity - reversed, 0);
}

/** Baut die Storno-Position (negative Menge, gleicher Preis wie das Original). */
export function planLineReversal(
  original: { id: string; quantity: number; unitPriceCents: number },
  reversalQuantities: readonly number[],
  quantity: number = reversibleQuantity(original.quantity, reversalQuantities),
): { reversesLineId: string; quantity: number; totalCents: number; unitPriceCents: number } {
  const remaining = reversibleQuantity(original.quantity, reversalQuantities);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("Storno-Menge muss mindestens 1 sein");
  }
  if (quantity > remaining) {
    throw new Error(`Es können höchstens ${remaining} storniert werden`);
  }
  return {
    reversesLineId: original.id,
    quantity: -quantity,
    unitPriceCents: original.unitPriceCents,
    totalCents: -quantity * original.unitPriceCents,
  };
}

/** Zahlungs-Storno: immer die ganze Zahlung (inkl. Trinkgeld), nur einmal möglich. */
export function planPaymentReversal(
  original: { id: string; amountCents: number; tipCents: number; reversesPaymentId?: string | null },
  alreadyReversed: boolean,
): { reversesPaymentId: string; amountCents: number; tipCents: number } {
  if (original.reversesPaymentId) throw new Error("Ein Storno kann nicht storniert werden");
  if (alreadyReversed) throw new Error("Diese Zahlung wurde bereits storniert");
  return {
    reversesPaymentId: original.id,
    amountCents: -original.amountCents,
    tipCents: -original.tipCents,
  };
}
