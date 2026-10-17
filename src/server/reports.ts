import { and, asc, between, count, countDistinct, desc, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { article, category, event, member, payment, paymentMethod, sale, saleLine } from "@/db/schema";
import {
  type Period,
  previousPeriod,
  type ReportLine,
  type ReportPayment,
  type ReportSummary,
  series,
  type SeriesPoint,
  summarize,
} from "@/domain/report";
import { getSaleUnitCosts, getStockOverview, type StockRow } from "./stock";

/** Bon-Zeilen im Zeitraum (über das Datum des Abends), chronologisch. */
async function loadLines(db: Db, where: ReturnType<typeof and>): Promise<ReportLine[]> {
  const rows = await db
    .select({
      articleId: saleLine.articleId,
      articleName: saleLine.articleName,
      categoryId: article.categoryId,
      businessDate: event.businessDate,
      quantity: saleLine.quantity,
      totalCents: saleLine.totalCents,
      isGuest: saleLine.isGuest,
      reversesLineId: saleLine.reversesLineId,
    })
    .from(saleLine)
    .innerJoin(sale, eq(sale.id, saleLine.saleId))
    .innerJoin(event, eq(event.id, sale.eventId))
    .innerJoin(article, eq(article.id, saleLine.articleId))
    .where(where)
    .orderBy(asc(sale.createdAt));
  return rows.map(({ reversesLineId, ...l }) => ({ ...l, isReversal: reversesLineId !== null }));
}

async function loadPayments(db: Db, where: ReturnType<typeof and>): Promise<ReportPayment[]> {
  return db
    .select({ businessDate: event.businessDate, methodId: payment.methodId, amountCents: payment.amountCents, tipCents: payment.tipCents })
    .from(payment)
    .innerJoin(event, eq(event.id, payment.eventId))
    .where(where);
}

const inPeriod = (p: Period) => between(event.businessDate, p.from, p.to);

export async function getPaymentMethods(db: Db): Promise<{ id: string; label: string }[]> {
  return db.select({ id: paymentMethod.id, label: paymentMethod.label }).from(paymentMethod).orderBy(asc(paymentMethod.sortOrder));
}

export async function getCategories(db: Db): Promise<{ id: string; name: string }[]> {
  return db.select({ id: category.id, name: category.name }).from(category).orderBy(asc(category.sortOrder));
}

// ---------------------------------------------------------------------------
// Abende
// ---------------------------------------------------------------------------

export interface EveningRow {
  id: string;
  businessDate: string;
  title: string | null;
  revenueCents: number;
  paidCents: number;
  tipCents: number;
  profitCents: number;
  /** Umsatz enthält Artikel ohne Einkaufspreis → Gewinn zu hoch */
  profitIncomplete: boolean;
}

/** Alle Abende, neueste zuerst (höchstens `limit`). */
export async function listEvenings(db: Db, limit = 100): Promise<EveningRow[]> {
  const events = await db.select().from(event).orderBy(desc(event.businessDate)).limit(limit);
  if (events.length === 0) return [];
  const ids = events.map((e) => e.id);
  const [lines, payments, costs] = await Promise.all([
    loadLines(db, and(inArray(event.id, ids))),
    loadPayments(db, and(inArray(event.id, ids))),
    getSaleUnitCosts(db),
  ]);
  const linesBy = Map.groupBy(lines, (l) => l.businessDate);
  const paymentsBy = Map.groupBy(payments, (p) => p.businessDate);
  return events.map((e) => {
    const s = summarize(linesBy.get(e.businessDate) ?? [], paymentsBy.get(e.businessDate) ?? [], costs);
    return {
      id: e.id,
      businessDate: e.businessDate,
      title: e.title,
      revenueCents: s.revenueCents,
      paidCents: s.paidCents,
      tipCents: s.tipCents,
      profitCents: s.profitCents,
      profitIncomplete: s.uncostedRevenueCents !== 0,
    };
  });
}

export interface EveningReport {
  event: { id: string; businessDate: string; title: string | null; note: string | null };
  summary: ReportSummary;
  /** Bons (ohne Stornos) */
  receipts: number;
  /** bediente Mitglieder */
  members: number;
  reversals: { at: Date; memberName: string; reason: string; totalCents: number; items: string }[];
  methods: { id: string; label: string }[];
  categories: { id: string; name: string }[];
}

export async function getEveningReport(db: Db, businessDate: string): Promise<EveningReport | null> {
  const [e] = await db.select().from(event).where(eq(event.businessDate, businessDate));
  if (!e) return null;
  const [lines, payments, costs, [counts], reversalRows, methods, categories] = await Promise.all([
    loadLines(db, and(eq(event.id, e.id))),
    loadPayments(db, and(eq(event.id, e.id))),
    getSaleUnitCosts(db),
    db
      .select({ receipts: count(), members: countDistinct(sale.memberId) })
      .from(sale)
      .where(and(eq(sale.eventId, e.id), eq(sale.kind, "sale"))),
    db
      .select({ sale, memberName: member.name, line: saleLine })
      .from(sale)
      .innerJoin(member, eq(member.id, sale.memberId))
      .innerJoin(saleLine, eq(saleLine.saleId, sale.id))
      .where(and(eq(sale.eventId, e.id), eq(sale.kind, "reversal"), isNotNull(sale.reason)))
      .orderBy(asc(sale.createdAt)),
    getPaymentMethods(db),
    getCategories(db),
  ]);
  const reversals = [...Map.groupBy(reversalRows, (r) => r.sale.id).values()].map((rows) => ({
    at: rows[0].sale.createdAt,
    memberName: rows[0].memberName,
    reason: rows[0].sale.reason!,
    totalCents: -rows.reduce((s, r) => s + r.line.totalCents, 0),
    items: rows.map((r) => `${-r.line.quantity}× ${r.line.articleName}`).join(", "),
  }));
  return {
    event: { id: e.id, businessDate: e.businessDate, title: e.title, note: e.note },
    summary: summarize(lines, payments, costs),
    receipts: counts?.receipts ?? 0,
    members: counts?.members ?? 0,
    reversals,
    methods,
    categories,
  };
}

/** Datum des Abends davor bzw. danach (für „‹ ›“ im Abendabschluss). */
export async function neighbourEvenings(db: Db, businessDate: string): Promise<{ prev: string | null; next: string | null }> {
  const [[prev], [next]] = await Promise.all([
    db.select({ d: event.businessDate }).from(event).where(lt(event.businessDate, businessDate)).orderBy(desc(event.businessDate)).limit(1),
    db.select({ d: event.businessDate }).from(event).where(gt(event.businessDate, businessDate)).orderBy(asc(event.businessDate)).limit(1),
  ]);
  return { prev: prev?.d ?? null, next: next?.d ?? null };
}

// ---------------------------------------------------------------------------
// Statistik (Zeitraum mit Vorzeitraum)
// ---------------------------------------------------------------------------

export interface PeriodReport {
  period: Period;
  previous: Period;
  summary: ReportSummary;
  previousSummary: ReportSummary;
  evenings: number;
  previousEvenings: number;
  series: SeriesPoint[];
  seriesBy: "evening" | "month";
  /** Artikel mit Bestand, die im Zeitraum nicht verkauft wurden */
  slowMovers: StockRow[];
  methods: { id: string; label: string }[];
  categories: { id: string; name: string }[];
}

export async function getPeriodReport(db: Db, period: Period): Promise<PeriodReport> {
  const previous = previousPeriod(period);
  const [lines, payments, prevLines, prevPayments, costs, [ev], [prevEv], stock, methods, categories] = await Promise.all([
    loadLines(db, and(inPeriod(period))),
    loadPayments(db, and(inPeriod(period))),
    loadLines(db, and(inPeriod(previous))),
    loadPayments(db, and(inPeriod(previous))),
    getSaleUnitCosts(db),
    db.select({ n: count() }).from(event).where(inPeriod(period)),
    db.select({ n: count() }).from(event).where(inPeriod(previous)),
    getStockOverview(db),
    getPaymentMethods(db),
    getCategories(db),
  ]);
  const summary = summarize(lines, payments, costs);
  // „Bestand aus“-Artikel (z. B. ganze Flasche) zählen als Verkauf des Bestands-Artikels
  const sold = new Set(lines.filter((l) => !l.isReversal).map((l) => l.articleId));
  const linked = await db.select({ id: article.id, to: article.stockArticleId }).from(article).where(isNotNull(article.stockArticleId));
  for (const l of linked) if (sold.has(l.id) && l.to) sold.add(l.to);
  const days = (Date.parse(period.to) - Date.parse(period.from)) / 86_400_000 + 1;
  const seriesBy = days > 62 ? "month" : "evening";
  return {
    period,
    previous,
    summary,
    previousSummary: summarize(prevLines, prevPayments, costs),
    evenings: ev?.n ?? 0,
    previousEvenings: prevEv?.n ?? 0,
    series: series(lines, costs, seriesBy, period),
    seriesBy,
    slowMovers: stock.rows.filter((r) => r.stock > 0 && !sold.has(r.articleId)),
    methods,
    categories,
  };
}
