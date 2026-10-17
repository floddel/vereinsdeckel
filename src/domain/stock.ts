/**
 * Warenbestand je Artikel:
 *   Bestand = letzte Inventur + Einkäufe danach − Verkäufe danach
 *   (ohne Inventur: alle Einkäufe − alle Verkäufe)
 * Stornos sind negative Mengen und werden automatisch verrechnet.
 * Zeitpunkt eines Einkaufs = wann er in der App erfasst wurde.
 */
export interface StockInputs {
  purchases: readonly { articleId: string; quantity: number; at: Date }[];
  sales: readonly { articleId: string; quantity: number; at: Date }[];
  inventories: readonly { at: Date; lines: readonly { articleId: string; countedQty: number }[] }[];
}

export function stockLevel(articleId: string, input: StockInputs, asOf?: Date): number {
  const until = asOf?.getTime() ?? Number.POSITIVE_INFINITY;

  let base = 0;
  let since = Number.NEGATIVE_INFINITY;
  for (const inv of input.inventories) {
    const t = inv.at.getTime();
    if (t > until || t < since) continue;
    const line = inv.lines.find((l) => l.articleId === articleId);
    if (line) {
      base = line.countedQty;
      since = t;
    }
  }

  const inWindow = (at: Date) => at.getTime() > since && at.getTime() <= until;
  let stock = base;
  for (const p of input.purchases) if (p.articleId === articleId && inWindow(p.at)) stock += p.quantity;
  for (const s of input.sales) if (s.articleId === articleId && inWindow(s.at)) stock -= s.quantity;
  return stock;
}

/** Inventur-Differenz: gezählt − erwartet. Negativ = Schwund (oder vergessen anzuschreiben). */
export function inventoryDifference(countedQty: number, expectedQty: number): number {
  return countedQty - expectedQty;
}

/**
 * Reichweite: "reicht noch ca. X Abende".
 * Durchschnitt der letzten `window` Abende mit Verkauf. null = keine Verkäufe bekannt.
 */
export function reachEvenings(
  stock: number,
  soldPerEvening: readonly number[],
  window = 10,
): number | null {
  const recent = soldPerEvening.filter((q) => q > 0).slice(-window);
  if (recent.length === 0) return null;
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  return Math.max(Math.floor(stock / avg), 0);
}

/** Für die Einkaufsliste: Artikel, deren Reichweite unter der Schwelle liegt. */
export function needsRestock(reach: number | null, stock: number, thresholdEvenings: number): boolean {
  if (reach === null) return stock <= 0;
  return reach < thresholdEvenings;
}

/** Einkaufspreis pro Einheit (auf ganze Cent gerundet), z. B. Kiste 24 × für 14,99 € → 62 Cent. */
export function unitCostCents(totalCents: number, quantity: number): number {
  if (quantity === 0) throw new Error("Menge darf nicht 0 sein");
  return Math.round(totalCents / quantity);
}

/**
 * Verkaufte Menge je Abend und Artikel, Abende chronologisch (für Ø und Reichweite).
 * Stornos sind negative Mengen und mindern den Abend, an dem sie gebucht wurden.
 */
export function soldPerEvening(lines: readonly { articleId: string; quantity: number; businessDate: string }[]): Map<string, number[]> {
  const byArticle = new Map<string, Map<string, number>>();
  for (const l of lines) {
    const days = byArticle.get(l.articleId) ?? new Map<string, number>();
    days.set(l.businessDate, (days.get(l.businessDate) ?? 0) + l.quantity);
    byArticle.set(l.articleId, days);
  }
  return new Map(
    [...byArticle].map(([id, days]) => [id, [...days].sort(([a], [b]) => a.localeCompare(b)).map(([, q]) => q)]),
  );
}

/** Ø Verkauf je Abend (letzte `window` Abende mit Verkauf), auf eine Stelle gerundet. */
export function averagePerEvening(sold: readonly number[], window = 10): number | null {
  const recent = sold.filter((q) => q > 0).slice(-window);
  if (recent.length === 0) return null;
  return Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Einheiten: Stückartikel (Flasche, Wurst) und Ausschank-Artikel (Bestand in ml)
// ---------------------------------------------------------------------------

export interface ArticleUnit {
  /** Portion in ml; leer = Stückartikel */
  servingMl: number | null;
  /** übliche Flaschengröße in ml (Ausschank) */
  bottleMl: number | null;
  /** Stück je Kiste (Stückartikel) */
  packSize: number | null;
}

export const isServed = (a: ArticleUnit) => !!a.servingMl;

/**
 * Alles in die Bestandseinheit des Artikels umrechnen (Stück bzw. ml).
 * Wurde ein Artikel umgestellt (Stück ↔ Ausschank), werden ältere Vorgänge so gut es geht umgerechnet –
 * danach am besten eine Inventur machen.
 */
export const toBase = {
  purchase(a: ArticleUnit, quantity: number, lineBottleMl: number | null): number {
    if (!isServed(a)) return quantity;
    return quantity * (lineBottleMl ?? a.bottleMl ?? a.servingMl!);
  },
  sale(a: ArticleUnit, quantity: number): number {
    return isServed(a) ? quantity * a.servingMl! : quantity;
  },
  inventory(a: ArticleUnit, counted: number, inMl: boolean): number {
    if (isServed(a)) return inMl ? counted : counted * (a.bottleMl ?? a.servingMl!);
    return inMl ? Math.floor(counted / (a.bottleMl ?? 1)) : counted;
  },
};

/**
 * Bestand verständlich: „47“ (Stück – ohne Umrechnung in Kisten, weil nicht immer volle Kisten dastehen)
 * bzw. „≈ 1,4 Fl. · 24 × 4 cl“.
 */
export function describeStock(a: ArticleUnit, base: number, fmt: { volume: (ml: number) => string; decimal: (n: number) => string }): string {
  if (!isServed(a)) return String(base);
  const portions = Math.floor(Math.max(base, 0) / a.servingMl!);
  const amount = a.bottleMl ? `≈ ${fmt.decimal(base / a.bottleMl)} Fl.` : fmt.volume(Math.max(base, 0));
  return `${base < 0 ? "−" : ""}${amount} · ${portions} × ${fmt.volume(a.servingMl!)}`;
}

/**
 * Ø Einkaufspreis je Bestandseinheit (Cent je Stück bzw. je ml) über alle Einkäufe mit Preis.
 * Stornos (negative Mengen und Beträge) verrechnen sich. null = kein Preis bekannt.
 */
export function averageUnitCost(lines: readonly { quantity: number; totalCents: number | null }[]): number | null {
  let quantity = 0;
  let cents = 0;
  for (const l of lines) {
    if (l.totalCents === null) continue;
    quantity += l.quantity;
    cents += l.totalCents;
  }
  return quantity > 0 ? cents / quantity : null;
}

/** Warenwert eines Bestands zum Ø Einkaufspreis (negativer Bestand zählt als 0). */
export const stockValueCents = (stock: number, unitCost: number | null): number | null =>
  unitCost === null ? null : Math.round(Math.max(stock, 0) * unitCost);

/**
 * Aus welchem Bestand ein Verkauf dieses Artikels geht und wie viel er davon verbraucht
 * (1 Stück bzw. die Portion in ml). null = ohne Bestandsführung (unbegrenzt verkaufbar).
 * `stock` enthält nur Artikel mit eigener Bestandsführung.
 */
export function stockRef(
  a: { id: string; servingMl: number | null; stockArticleId: string | null },
  stock: Readonly<Record<string, number>>,
): { pool: string; perUnit: number } | null {
  const pool = a.stockArticleId && a.servingMl && a.stockArticleId in stock ? a.stockArticleId : a.id;
  return pool in stock ? { pool, perUnit: a.servingMl ?? 1 } : null;
}

/** Einkaufspreis je Portion (Ausschank) bzw. je Stück, gerundet auf Cent. */
export function costPerUnitCents(a: ArticleUnit, totalCents: number, quantity: number, lineBottleMl: number | null): number {
  if (!isServed(a)) return unitCostCents(totalCents, quantity);
  const portions = toBase.purchase(a, quantity, lineBottleMl) / a.servingMl!;
  return Math.round(totalCents / portions);
}
