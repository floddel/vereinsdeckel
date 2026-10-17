import { z } from "@/lib/z";
import { formatCents } from "@/lib/money";

/**
 * Einkäufe (ein Kassenbon vom Großmarkt). Bezahlt aus Handkasse, PayPal oder privat vorgestreckt.
 * „Anfangsbestand“: Ware, die schon da war (eigene Ware) – zählt für Bestand und Warenwert, bewegt aber kein Geld.
 * Unveränderlich: Korrektur nur per Storno (neuer Einkauf mit negativen Mengen und Begründung).
 */

export const PURCHASE_SOURCES = ["cash", "paypal", "private", "opening"] as const;
export type PurchaseSource = (typeof PURCHASE_SOURCES)[number];

export const SOURCE_LABEL: Record<PurchaseSource, string> = {
  cash: "Handkasse",
  paypal: "PayPal",
  private: "Privat vorgestreckt",
  opening: "Anfangsbestand",
};

/** Aus welchem Topf bezahlt (Anfangsbestand und Auslagen bewegen keinen Topf). */
export const potOfSource = (s: PurchaseSource): string | null => (s === "cash" || s === "paypal" ? s : null);

export const MAX_PURCHASE_LINES = 60;

const isoDay = z.iso.date("Bitte ein Datum wählen");

export const purchaseLineSchema = z
  .object({
    /** leer = ohne Artikel (z. B. Servietten, Grillkohle) */
    articleId: z.uuid().nullable(),
    description: z.string().trim().max(80, "Höchstens 80 Zeichen"),
    quantity: z.number().int("Nur ganze Stück").min(1, "Mindestens 1 Stück").max(10_000),
    /** Ausschank-Artikel: Größe je Flasche in ml */
    bottleMl: z.number().int().min(1).max(50_000).nullable().default(null),
    /** leer = Einzelpreis nicht bekannt (dann muss die Bon-Summe angegeben sein) */
    totalCents: z.number().int().min(0).max(1_000_000).nullable(),
  })
  .refine((l) => l.articleId !== null || l.description.length > 0, "Bitte beschreiben, was gekauft wurde");

export const purchaseInputSchema = z.object({
  purchasedOn: isoDay,
  source: z.enum(PURCHASE_SOURCES),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
  lines: z.array(purchaseLineSchema).min(1, "Mindestens eine Position").max(MAX_PURCHASE_LINES),
  /** Summe laut Kassenbon (optional). Was die Einzelpreise nicht abdecken, wird „Rest laut Bon“. */
  receiptTotalCents: z.number().int().min(0).max(10_000_000).nullable().default(null),
});
export type PurchaseInput = z.output<typeof purchaseInputSchema>;

/** Einkaufsdatum darf nicht in der Zukunft liegen (ein Tag Spielraum wegen Zeitzonen). */
export function isPlausiblePurchaseDate(day: string, today: string): boolean {
  return day <= addDays(today, 1) && day >= "2000-01-01";
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const purchaseTotal = (lines: readonly { totalCents: number | null }[]) => lines.reduce((s, l) => s + (l.totalCents ?? 0), 0);

export const REST_LINE = "Rest laut Bon (ohne Einzelpreis)";

/**
 * Positionen mit Bon-Summe abgleichen: Einzelpreise sind optional. Ist eine Bon-Summe angegeben,
 * wird der nicht aufgeteilte Rest als eigene Zeile gespeichert – so stimmt die Kasse immer.
 */
export function withReceiptRest<L extends { totalCents: number | null }>(
  lines: readonly L[],
  receiptTotalCents: number | null,
): { ok: true; rest: number } | { ok: false; error: string } {
  const known = purchaseTotal(lines);
  if (receiptTotalCents === null) {
    if (lines.some((l) => l.totalCents === null)) return { ok: false, error: "Bitte die Preise oder die Summe laut Bon eingeben" };
    return { ok: true, rest: 0 };
  }
  if (receiptTotalCents < known) return { ok: false, error: "Die Summe laut Bon ist kleiner als die Einzelpreise zusammen" };
  return { ok: true, rest: receiptTotalCents - known };
}

/** Storno-Positionen: gleiche Positionen mit negativer Menge und negativem Betrag. */
type PlanLine = { articleId: string | null; description: string; quantity: number; bottleMl: number | null; totalCents: number | null };

export function planPurchaseReversal(lines: readonly PlanLine[]): PlanLine[] {
  if (lines.some((l) => l.quantity < 0)) throw new Error("Ein Storno kann nicht storniert werden");
  return lines.map((l) => ({
    articleId: l.articleId,
    description: l.description,
    quantity: -l.quantity,
    bottleMl: l.bottleMl,
    totalCents: l.totalCents === null ? null : -l.totalCents,
  }));
}

/**
 * Hinweis beim Erfassen: „je Stück 0,62 € · Vereinspreis 2,00 € (1,38 € mehr)“.
 * `unit` = Einkaufspreis je Stück bzw. je Portion, `unitName` z. B. „Stück“ oder „4 cl“.
 */
export function unitCostLabel(unit: number, salePriceCents?: number, unitName = "Stück"): string {
  let text = `je ${unitName} ${formatCents(unit)}`;
  if (salePriceCents !== undefined) {
    const diff = salePriceCents - unit;
    text += ` · Vereinspreis ${formatCents(salePriceCents)}`;
    if (diff !== 0) text += ` (${formatCents(Math.abs(diff))} ${diff > 0 ? "mehr" : "weniger"})`;
  }
  return text;
}
