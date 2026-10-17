import type { CashMovementType } from "@/db/schema";
import { potOfSource, type PurchaseSource } from "./purchase";

/**
 * Geldtöpfe (Handkasse, PayPal). Das Soll wird immer aus den Einzelvorgängen berechnet:
 *   + Zahlungen der Mitglieder (inkl. Trinkgeld) über die Zahlungsart → Topf
 *   − Einkäufe, die aus dem Topf bezahlt wurden
 *   ± Kassenbewegungen (Einlage, Abgabe, Umbuchung, Gebühren, Erstattungen, Korrekturen …)
 */
export interface PotInputs {
  payments: readonly { methodId: string; amountCents: number; tipCents: number }[];
  /** Zahlungsart → Topf */
  methodPot: Readonly<Record<string, string>>;
  /** Summe je Einkauf (Storno-Einkäufe negativ). */
  purchases: readonly { source: PurchaseSource; totalCents: number }[];
  movements: readonly { potId: string; amountCents: number }[];
}

export function potBalances(input: PotInputs): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (pot: string, cents: number) => {
    out[pot] = (out[pot] ?? 0) + cents;
  };
  for (const pot of new Set(Object.values(input.methodPot))) add(pot, 0);

  for (const p of input.payments) {
    const pot = input.methodPot[p.methodId];
    if (!pot) throw new Error(`Unbekannte Zahlungsart: ${p.methodId}`);
    add(pot, p.amountCents + p.tipCents);
  }
  for (const p of input.purchases) {
    const pot = potOfSource(p.source);
    if (pot) add(pot, -p.totalCents);
  }
  for (const m of input.movements) add(m.potId, m.amountCents);
  return out;
}

/**
 * Auslagen: privat vorgestreckte Einkäufe minus Erstattungen aus den Töpfen.
 * `effectiveType` ist bei Stornos der Typ der stornierten Bewegung.
 */
export function outstandingAdvancesCents(input: {
  purchases: PotInputs["purchases"];
  movements: readonly { effectiveType: CashMovementType; amountCents: number }[];
}): number {
  let sum = 0;
  for (const p of input.purchases) if (p.source === "private") sum += p.totalCents;
  // Erstattungen sind Ausgänge (negativ) aus einem Topf und mindern die Auslagen.
  for (const m of input.movements) if (m.effectiveType === "reimbursement") sum += m.amountCents;
  return sum;
}

/** Kassenzählung: gezählt − Soll. Positiv = mehr in der Kasse als erwartet. */
export function countDifferenceCents(countedCents: number, expectedCents: number): number {
  return countedCents - expectedCents;
}
