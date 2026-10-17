import { and, asc, desc, eq, inArray, isNull, lt, max, sql, sum } from "drizzle-orm";
import type { Db } from "@/db/client";
import { article, category, event, member, payment, paymentMethod, sale, saleLine, settings } from "@/db/schema";
import { openBalanceCents, openLines } from "@/domain/account";
import { businessDate } from "@/domain/business-date";
import { byName, type CarriedDeckel, type ThekePayment, type ThekeSale, type ThekeSnapshot } from "@/domain/theke";
import type { AccountEntry } from "@/domain/types";
import { stockRef } from "@/domain/stock";
import { onSale } from "../on-sale";
import { getStockOverview } from "../stock";

const RECENT_LIMIT = 8;

/** Alles, was die Theke zum Arbeiten braucht – in einer Antwort (später auch offline zwischengespeichert). */
export async function getThekeSnapshot(db: Db, now = new Date()): Promise<ThekeSnapshot> {
  const [s] = await db.select().from(settings);
  const cutoffHour = s?.businessDayCutoffHour ?? 6;
  const today = businessDate(now, cutoffHour);

  const lineSums = db
    .select({ memberId: sale.memberId, cents: sum(saleLine.totalCents).mapWith(Number).as("line_cents") })
    .from(saleLine)
    .innerJoin(sale, eq(saleLine.saleId, sale.id))
    .groupBy(sale.memberId)
    .as("line_sums");
  const paySums = db
    .select({ memberId: payment.memberId, cents: sum(payment.amountCents).mapWith(Number).as("pay_cents") })
    .from(payment)
    .groupBy(payment.memberId)
    .as("pay_sums");

  const [methods, categories, articleRows, members, recent, [todayEvent], stockOverview] = await Promise.all([
    db
      .select({ id: paymentMethod.id, label: paymentMethod.label })
      .from(paymentMethod)
      .where(eq(paymentMethod.active, true))
      .orderBy(asc(paymentMethod.sortOrder)),
    db.select({ id: category.id, name: category.name }).from(category).orderBy(asc(category.sortOrder)),
    db
      .select({
        id: article.id,
        name: article.name,
        categoryId: article.categoryId,
        icon: article.icon,
        priceCents: article.priceCents,
        servingMl: article.servingMl,
        stockArticleId: article.stockArticleId,
      })
      .from(article)
      .innerJoin(category, eq(article.categoryId, category.id))
      .where(and(eq(article.active, true), onSale(today)))
      .orderBy(asc(category.sortOrder), asc(article.sortOrder), asc(article.name)),
    db
      .select({
        id: member.id,
        name: member.name,
        openCents: sql<number>`coalesce(${lineSums.cents}, 0) - coalesce(${paySums.cents}, 0)`.mapWith(Number),
      })
      .from(member)
      .leftJoin(lineSums, eq(lineSums.memberId, member.id))
      .leftJoin(paySums, eq(paySums.memberId, member.id))
      .where(and(eq(member.active, true), isNull(member.anonymizedAt))),
    db
      .select({ memberId: sale.memberId, last: max(sale.createdAt) })
      .from(sale)
      .innerJoin(member, eq(member.id, sale.memberId))
      .where(and(eq(sale.kind, "sale"), eq(member.active, true), isNull(member.anonymizedAt)))
      .groupBy(sale.memberId)
      .orderBy(desc(max(sale.createdAt)))
      .limit(RECENT_LIMIT),
    db.select({ id: event.id }).from(event).where(eq(event.businessDate, today)),
    getStockOverview(db),
  ]);
  // Nur verkaufen, was da ist: Bestand je Bestands-Artikel (mit Bestandsführung)
  const stock = Object.fromEntries(stockOverview.rows.map((r) => [r.articleId, r.stock]));
  const articles = articleRows.map(({ servingMl, stockArticleId, ...a }) => ({ ...a, stock: stockRef({ id: a.id, servingMl, stockArticleId }, stock) }));

  return {
    generatedAt: now.toISOString(),
    clubName: s?.clubName ?? "Verein",
    warnLimitCents: s?.warnLimitCents ?? 0,
    paypalName: s?.paypalName || null,
    // PayPal nur anbieten, wenn ein PayPal.me-Name eingetragen ist
    paymentMethods: methods.filter((m) => m.id !== "paypal" || !!s?.paypalName),
    cutoffHour,
    businessDate: today,
    categories,
    articles,
    members: members.sort(byName),
    recentMemberIds: recent.map((r) => r.memberId),
    todaySales: todayEvent ? await getEventSales(db, todayEvent.id) : [],
    todayPayments: todayEvent ? await getEventPayments(db, todayEvent.id) : [],
    carried: await getCarried(
      db,
      members.filter((m) => m.openCents > 0).map((m) => m.id),
      today,
    ),
    stock,
  };
}

/**
 * Offene Posten früherer Abende (vor `today`) je Mitglied – so kann die Theke „Auf dem Deckel“
 * auch ohne Internet zeigen. Nur für Mitglieder, die etwas offen haben.
 */
async function getCarried(db: Db, memberIds: string[], today: string): Promise<Record<string, CarriedDeckel>> {
  if (memberIds.length === 0) return {};
  const [lines, payments] = await Promise.all([
    db
      .select({ line: saleLine, memberId: sale.memberId, at: sale.createdAt, businessDate: event.businessDate })
      .from(saleLine)
      .innerJoin(sale, eq(saleLine.saleId, sale.id))
      .innerJoin(event, eq(event.id, sale.eventId))
      .where(and(inArray(sale.memberId, memberIds), lt(event.businessDate, today))),
    db
      .select({ payment })
      .from(payment)
      .innerJoin(event, eq(event.id, payment.eventId))
      .where(and(inArray(payment.memberId, memberIds), lt(event.businessDate, today))),
  ]);

  const entries = new Map<string, AccountEntry[]>();
  const dateOf = new Map<string, string>();
  const add = (memberId: string, e: AccountEntry) => entries.set(memberId, [...(entries.get(memberId) ?? []), e]);
  for (const { line: l, memberId, at, businessDate: d } of lines) {
    dateOf.set(l.id, d);
    add(memberId, { kind: "line", id: l.id, at, articleId: l.articleId, articleName: l.articleName, quantity: l.quantity, unitPriceCents: l.unitPriceCents, totalCents: l.totalCents, isGuest: l.isGuest, reversesLineId: l.reversesLineId });
  }
  for (const { payment: p } of payments) {
    add(p.memberId, { kind: "payment", id: p.id, at: p.createdAt, methodId: p.methodId, amountCents: p.amountCents, tipCents: p.tipCents });
  }

  const carried: Record<string, CarriedDeckel> = {};
  for (const [memberId, list] of entries) {
    const balance = openBalanceCents(list);
    if (balance <= 0) continue;
    const open = openLines(list);
    carried[memberId] = {
      lines: open.map((l) => ({
        at: l.at.toISOString(),
        businessDate: dateOf.get(l.id)!,
        articleName: l.articleName,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        totalCents: l.totalCents,
        isGuest: l.isGuest,
      })),
      paidCents: open.reduce((sum, l) => sum + l.totalCents, 0) - balance,
    };
  }
  return carried;
}

/** Bons eines Abends (auch für die Verwaltung). */
export async function getEventSales(db: Db, eventId: string): Promise<ThekeSale[]> {
  const sales = await db.select().from(sale).where(eq(sale.eventId, eventId)).orderBy(asc(sale.createdAt), asc(sale.receivedAt));
  if (sales.length === 0) return [];
  const lines = await db
    .select()
    .from(saleLine)
    .where(inArray(saleLine.saleId, sales.map((x) => x.id)));
  const bySale = Map.groupBy(lines, (l) => l.saleId);
  return sales.map((x) => ({
    id: x.id,
    memberId: x.memberId,
    kind: x.kind,
    reversesSaleId: x.reversesSaleId,
    reason: x.reason,
    createdAt: x.createdAt.toISOString(),
    lines: (bySale.get(x.id) ?? []).map((l) => ({
      id: l.id,
      articleId: l.articleId,
      articleName: l.articleName,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      totalCents: l.totalCents,
      isGuest: l.isGuest,
      reversesLineId: l.reversesLineId,
    })),
  }));
}

/** Zahlungen eines Abends (auch für die Verwaltung). */
export async function getEventPayments(db: Db, eventId: string): Promise<ThekePayment[]> {
  const rows = await db
    .select()
    .from(payment)
    .where(eq(payment.eventId, eventId))
    .orderBy(asc(payment.createdAt), asc(payment.receivedAt));
  return rows.map((p) => ({
    id: p.id,
    memberId: p.memberId,
    methodId: p.methodId,
    amountCents: p.amountCents,
    tipCents: p.tipCents,
    cashGivenCents: p.cashGivenCents,
    reversesPaymentId: p.reversesPaymentId,
    reason: p.reason,
    saleId: p.saleId,
    createdAt: p.createdAt.toISOString(),
  }));
}
