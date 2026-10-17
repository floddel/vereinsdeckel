/**
 * Mengen für Ausschank-Artikel (Schnaps, Wein, Softgetränke im Glas). Intern immer ganze ml.
 */

/** Schnellwahl im Artikel-Dialog */
export const SERVING_PRESETS = [20, 40, 100, 200, 300, 400, 500] as const;
export const BOTTLE_PRESETS = [500, 700, 750, 1000, 1250, 1500, 2000] as const;

/**
 * „4 cl“ → 40, „0,2 l“ → 200, „700 ml“ → 700, „1,25“ → 1250.
 * Ohne Einheit: bis 5 = Liter, sonst ml. Unsinn → null.
 */
export function parseVolumeMl(input: string): number | null {
  const m = /^\s*(\d{1,5}(?:[.,]\d{1,3})?)\s*(ml|cl|l)?\s*$/i.exec(input);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  const unit = m[2]?.toLowerCase() ?? (n <= 5 ? "l" : "ml");
  const ml = Math.round(unit === "l" ? n * 1000 : unit === "cl" ? n * 10 : n);
  return ml >= 1 && ml <= 50_000 ? ml : null;
}

const comma = (n: number) => String(n).replace(".", ",");

/** 40 → „4 cl“, 200 → „0,2 l“, 1250 → „1,25 l“, 35 → „35 ml“. */
export function formatVolume(ml: number): string {
  if (ml < 100 && ml % 10 === 0) return `${ml / 10} cl`;
  if (ml >= 100 && ml % 10 === 0) return `${comma(Math.round(ml) / 1000)} l`;
  return `${ml} ml`;
}

/** Auf eine Nachkommastelle, deutsch: 1.43 → „1,4“ */
export const oneDecimal = (n: number) => comma(Math.round(n * 10) / 10);

/** Inventur: volle Flaschen + angebrochene Flasche (0, ¼, ½, ¾) → ml */
export const FRACTIONS = [0, 0.25, 0.5, 0.75] as const;
export const FRACTION_LABEL: Record<number, string> = { 0: "keine", 0.25: "¼", 0.5: "½", 0.75: "¾" };

export function bottlesToMl(fullBottles: number, fraction: number, bottleMl: number): number {
  return Math.round((fullBottles + fraction) * bottleMl);
}
