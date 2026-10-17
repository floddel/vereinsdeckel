/**
 * Auswertungen (Abendabschluss, Statistik). Reine Berechnung aus Einzelbuchungen:
 *   Umsatz      = Summe aller Bon-Zeilen (Stornos sind negative Zeilen und mindern ihn)
 *   Wareneinsatz = verkaufte Menge × Ø Einkaufspreis des Artikels (wie beim Warenwert)
 *   Rohgewinn   = Umsatz − Wareneinsatz (Trinkgeld kommt obendrauf, ist aber kein Umsatz)
 * Keine Auswertung je Mitglied (keine Ranglisten).
 */

export interface ReportLine {
  articleId: string;
  articleName: string;
  categoryId: string;
  /** Datum des Abends (JJJJ-MM-TT) */
  businessDate: string;
  quantity: number;
  totalCents: number;
  isGuest: boolean;
  /** Storno-Zeile (negative Menge) */
  isReversal: boolean;
}

export interface ReportPayment {
  businessDate: string;
  methodId: string;
  /** Betrag fürs Konto (Stornos negativ) */
  amountCents: number;
  tipCents: number;
}

export interface ArticleSummary {
  articleId: string;
  name: string;
  categoryId: string;
  quantity: number;
  revenueCents: number;
  /** null = kein Einkaufspreis bekannt */
  costCents: number | null;
}

export interface ReportSummary {
  revenueCents: number;
  /** davon storniert (positiv) */
  reversedCents: number;
  guestCents: number;
  /** Wareneinsatz der Artikel mit bekanntem Einkaufspreis */
  costCents: number;
  /** Umsatz von Artikeln ohne Einkaufspreis (fehlen im Wareneinsatz) */
  uncostedRevenueCents: number;
  /** Umsatz − Wareneinsatz */
  profitCents: number;
  /** eingegangen fürs Konto (ohne Trinkgeld) */
  paidCents: number;
  tipCents: number;
  byMethod: Record<string, { amountCents: number; tipCents: number }>;
  byCategory: Record<string, number>;
  /** nach Umsatz absteigend */
  articles: ArticleSummary[];
}

/**
 * Einkaufspreis je verkaufter Einheit (Cent, ungerundet) – z. B. Bier 0,60, Schnaps 4 cl 0,43.
 * Fehlt in der Map = unbekannt.
 */
export type UnitCosts = ReadonlyMap<string, number | null>;

export function summarize(lines: readonly ReportLine[], payments: readonly ReportPayment[], unitCosts: UnitCosts): ReportSummary {
  const articles = new Map<string, ArticleSummary & { cost: number | null }>();
  let revenueCents = 0;
  let reversedCents = 0;
  let guestCents = 0;
  const byCategory: Record<string, number> = {};
  for (const l of lines) {
    revenueCents += l.totalCents;
    if (l.isReversal) reversedCents -= l.totalCents;
    if (l.isGuest) guestCents += l.totalCents;
    byCategory[l.categoryId] = (byCategory[l.categoryId] ?? 0) + l.totalCents;
    const unit = unitCosts.get(l.articleId) ?? null;
    const a = articles.get(l.articleId) ?? { articleId: l.articleId, name: l.articleName, categoryId: l.categoryId, quantity: 0, revenueCents: 0, costCents: null, cost: unit === null ? null : 0 };
    a.quantity += l.quantity;
    a.revenueCents += l.totalCents;
    if (a.cost !== null && unit !== null) a.cost += l.quantity * unit;
    if (!l.isReversal) a.name = l.articleName; // Name der jüngsten Buchung (Zeilen chronologisch)
    articles.set(l.articleId, a);
  }

  const list = [...articles.values()]
    .map(({ cost, ...a }) => ({ ...a, costCents: cost === null ? null : Math.round(cost) }))
    .filter((a) => a.quantity !== 0 || a.revenueCents !== 0)
    .sort((a, b) => b.revenueCents - a.revenueCents || b.quantity - a.quantity || a.name.localeCompare(b.name, "de"));
  const costCents = list.reduce((s, a) => s + (a.costCents ?? 0), 0);
  const uncostedRevenueCents = list.reduce((s, a) => s + (a.costCents === null ? a.revenueCents : 0), 0);

  const byMethod: ReportSummary["byMethod"] = {};
  let paidCents = 0;
  let tipCents = 0;
  for (const p of payments) {
    const m = (byMethod[p.methodId] ??= { amountCents: 0, tipCents: 0 });
    m.amountCents += p.amountCents;
    m.tipCents += p.tipCents;
    paidCents += p.amountCents;
    tipCents += p.tipCents;
  }

  return {
    revenueCents,
    reversedCents,
    guestCents,
    costCents,
    uncostedRevenueCents,
    profitCents: revenueCents - costCents,
    paidCents,
    tipCents,
    byMethod,
    byCategory,
    articles: list,
  };
}

/** Veränderung gegenüber dem Vorzeitraum in Prozent (gerundet); null = kein Vergleich möglich. */
export function changePercent(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}

// ---------------------------------------------------------------------------
// Zeiträume (Kalendertage in Berlin, Abende über ihr Datum)
// ---------------------------------------------------------------------------

export interface Period {
  /** erster Tag (einschließlich) */
  from: string;
  /** letzter Tag (einschließlich) */
  to: string;
}

export const PERIOD_PRESETS = ["monat", "vormonat", "quartal", "jahr", "vorjahr", "12monate"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PRESET_LABEL: Record<PeriodPreset, string> = {
  monat: "Dieser Monat",
  vormonat: "Letzter Monat",
  quartal: "Dieses Quartal",
  jahr: "Dieses Jahr",
  vorjahr: "Letztes Jahr",
  "12monate": "Letzte 12 Monate",
};

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** Zeitraum zu einer Voreinstellung, ausgehend vom heutigen Tag (JJJJ-MM-TT). */
export function presetPeriod(preset: PeriodPreset, today: string): Period {
  const [y, m] = today.split("-").map(Number);
  const month = m - 1;
  switch (preset) {
    case "monat":
      return { from: iso(y, month, 1), to: iso(y, month + 1, 0) };
    case "vormonat":
      return { from: iso(y, month - 1, 1), to: iso(y, month, 0) };
    case "quartal": {
      const q = Math.floor(month / 3) * 3;
      return { from: iso(y, q, 1), to: iso(y, q + 3, 0) };
    }
    case "jahr":
      return { from: iso(y, 0, 1), to: iso(y, 11, 31) };
    case "vorjahr":
      return { from: iso(y - 1, 0, 1), to: iso(y - 1, 11, 31) };
    case "12monate":
      return { from: iso(y, month - 11, 1), to: iso(y, month + 1, 0) };
  }
}

const dayMs = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Vorzeitraum gleicher Art: ganze Monate → die gleiche Anzahl Monate davor
 * (März → Februar, nicht „28 Tage“), sonst die gleiche Anzahl Tage direkt davor.
 */
export function previousPeriod(p: Period): Period {
  const [fy, fm, fd] = p.from.split("-").map(Number);
  const [ty, tm] = p.to.split("-").map(Number);
  const wholeMonths = fd === 1 && iso(ty, tm, 0) === p.to;
  if (wholeMonths) {
    const months = (ty - fy) * 12 + (tm - fm) + 1;
    return { from: iso(fy, fm - 1 - months, 1), to: iso(fy, fm - 1, 0) };
  }
  const days = (toMs(p.to) - toMs(p.from)) / dayMs + 1;
  return { from: fromMs(toMs(p.from) - days * dayMs), to: fromMs(toMs(p.from) - dayMs) };
}

/** Diagramm: Umsatz und Gewinn je Abend bzw. (bei langen Zeiträumen) je Monat. */
export interface SeriesPoint {
  key: string;
  label: string;
  revenueCents: number;
  profitCents: number;
}

export function series(
  lines: readonly ReportLine[],
  unitCosts: UnitCosts,
  by: "evening" | "month",
  period: Period,
): SeriesPoint[] {
  const keyOf = (d: string) => (by === "month" ? d.slice(0, 7) : d);
  const points = new Map<string, { revenue: number; cost: number }>();
  // Monate ohne Abend erscheinen mit 0, Abende nur, wenn es sie gab
  if (by === "month") {
    for (let [y, m] = period.from.split("-").map(Number); `${y}-${String(m).padStart(2, "0")}` <= period.to.slice(0, 7); m === 12 ? ((m = 1), y++) : m++) {
      points.set(`${y}-${String(m).padStart(2, "0")}`, { revenue: 0, cost: 0 });
    }
  }
  for (const l of lines) {
    const p = points.get(keyOf(l.businessDate)) ?? { revenue: 0, cost: 0 };
    p.revenue += l.totalCents;
    p.cost += l.quantity * (unitCosts.get(l.articleId) ?? 0);
    points.set(keyOf(l.businessDate), p);
  }
  const monthName = new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit", timeZone: "UTC" });
  const dayName = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "numeric", timeZone: "UTC" });
  return [...points]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, p]) => ({
      key,
      label: by === "month" ? monthName.format(new Date(`${key}-01T12:00:00Z`)) : dayName.format(new Date(`${key}T12:00:00Z`)),
      revenueCents: p.revenue,
      profitCents: Math.round(p.revenue - p.cost),
    }));
}
