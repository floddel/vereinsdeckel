import { z } from "@/lib/z";
import type { CashMovementType } from "@/db/schema";

/**
 * Kassenbewegungen in der Verwaltung: alles, was Geld in einen Topf bringt oder herausnimmt,
 * außer Zahlungen der Mitglieder und Einkäufen (die stehen in eigenen Tabellen).
 * Betrag wird immer positiv eingegeben, das Vorzeichen ergibt sich aus der Art.
 */

/** Arten, die man von Hand bucht (Korrektur und Storno entstehen automatisch). */
export const MANUAL_MOVEMENT_TYPES = ["deposit", "handover", "transfer", "paypal_fee", "other_expense", "reimbursement"] as const;
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

export const MOVEMENT_LABEL: Record<CashMovementType, string> = {
  deposit: "Einlage",
  handover: "Abgabe an den Verein",
  transfer: "Umbuchung",
  paypal_fee: "PayPal-Gebühr",
  other_expense: "Sonstige Ausgabe",
  reimbursement: "Erstattung Auslagen",
  count_correction: "Korrektur nach Zählung",
  reversal: "Storno",
};

export const MOVEMENT_HINT: Record<ManualMovementType, string> = {
  deposit: "Geld kommt dazu, z. B. Wechselgeld vom Kassenwart",
  handover: "Geld geht an den Verein, z. B. Abgabe an den Kassenwart",
  transfer: "Geld wandert zwischen den Töpfen, z. B. PayPal aufs Vereinskonto, bar in die Handkasse",
  paypal_fee: "Gebühr, die PayPal einbehalten hat",
  other_expense: "Ausgabe ohne Einkauf, z. B. Reparatur",
  reimbursement: "Privat vorgestreckte Einkäufe zurückzahlen",
};

const cents = z.number().int().min(1, "Bitte einen Betrag eingeben").max(10_000_000);

export const movementInputSchema = z
  .object({
    type: z.enum(MANUAL_MOVEMENT_TYPES),
    potId: z.string().min(1),
    /** nur bei Umbuchung: Ziel-Topf */
    toPotId: z.string().nullable(),
    amountCents: cents,
    note: z.string().trim().min(1, "Bitte kurz beschreiben").max(200),
  })
  .refine((m) => m.type !== "transfer" || (m.toPotId && m.toPotId !== m.potId), "Bitte zwei verschiedene Töpfe wählen")
  .refine((m) => m.type !== "paypal_fee" || m.potId === "paypal", "PayPal-Gebühren gehen immer vom PayPal-Topf ab");
export type MovementInput = z.output<typeof movementInputSchema>;

export interface PlannedMovement {
  potId: string;
  type: CashMovementType;
  amountCents: number;
}

/** Aus der Eingabe die Zeilen: + Eingang, − Ausgang. Umbuchung = zwei Zeilen. */
export function planMovement(m: MovementInput): PlannedMovement[] {
  switch (m.type) {
    case "deposit":
      return [{ potId: m.potId, type: m.type, amountCents: m.amountCents }];
    case "transfer":
      return [
        { potId: m.potId, type: "transfer", amountCents: -m.amountCents },
        { potId: m.toPotId!, type: "transfer", amountCents: m.amountCents },
      ];
    default:
      return [{ potId: m.potId, type: m.type, amountCents: -m.amountCents }];
  }
}

export const countInputSchema = z.object({
  potId: z.string().min(1),
  countedCents: z.number().int().min(0).max(10_000_000),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
  /** Differenz als Korrekturbewegung buchen, damit das Soll wieder stimmt */
  applyCorrection: z.boolean(),
});
export type CountInput = z.output<typeof countInputSchema>;
