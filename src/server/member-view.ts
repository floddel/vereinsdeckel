import { createHash } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { article, event, member, memberToken, payment, sale, saleLine, settings } from "@/db/schema";
import { businessDate } from "@/domain/business-date";
import {
  buildReceipts,
  coasterState,
  type EventEntries,
  type MemberOverview,
  type MemberStand,
  memberOverview,
  type Receipt,
} from "@/domain/member-view";
import type { AccountEntry, LineEntry, PaymentEntry } from "@/domain/types";
import { getMemberOrderBadge } from "./food-orders";

/** Format der Mitglieder-Links (base64url, siehe lib/token.ts). Alles andere wird gar nicht erst gesucht. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{32,64}$/;

/**
 * Mitglied zum persönlichen Link. Einziger Weg zu Mitgliederdaten in der Mitgliederansicht:
 * Unbekannter, gesperrter Link oder anonymisiertes Mitglied → null (immer dieselbe neutrale Antwort).
 */
export async function findMemberByToken(db: Db, token: string): Promise<{ id: string; name: string } | null> {
  if (!TOKEN_FORMAT.test(token)) return null;
  const [row] = await db
    .select({ id: member.id, name: member.name })
    .from(memberToken)
    .innerJoin(member, eq(member.id, memberToken.memberId))
    .where(and(eq(memberToken.token, token), isNull(memberToken.revokedAt), isNull(member.anonymizedAt)));
  return row ?? null;
}

/** Alle Positionen und Zahlungen eines Mitglieds, nach Abenden gruppiert. */
async function loadEntries(db: Db, memberId: string): Promise<{ entries: AccountEntry[]; events: EventEntries[] }> {
  const [lines, payments] = await Promise.all([
    db
      .select({
        line: saleLine,
        at: sale.createdAt,
        reason: sale.reason,
        tallyGroup: article.tallyGroup,
        icon: article.icon,
        businessDate: event.businessDate,
        title: event.title,
      })
      .from(saleLine)
      .innerJoin(sale, eq(saleLine.saleId, sale.id))
      .innerJoin(article, eq(article.id, saleLine.articleId))
      .innerJoin(event, eq(event.id, sale.eventId))
      .where(eq(sale.memberId, memberId))
      .orderBy(asc(sale.createdAt)),
    db
      .select({ payment, businessDate: event.businessDate, title: event.title })
      .from(payment)
      .innerJoin(event, eq(event.id, payment.eventId))
      .where(eq(payment.memberId, memberId))
      .orderBy(asc(payment.createdAt)),
  ]);

  const events = new Map<string, EventEntries>();
  const eventFor = (businessDate: string, title: string | null) => {
    let e = events.get(businessDate);
    if (!e) events.set(businessDate, (e = { businessDate, title, lines: [], payments: [] }));
    return e;
  };
  const entries: AccountEntry[] = [];
  for (const r of lines) {
    const l: LineEntry & { reason: string | null } = {
      kind: "line",
      id: r.line.id,
      at: r.at,
      articleId: r.line.articleId,
      articleName: r.line.articleName,
      tallyGroup: r.tallyGroup,
      icon: r.icon,
      quantity: r.line.quantity,
      unitPriceCents: r.line.unitPriceCents,
      totalCents: r.line.totalCents,
      isGuest: r.line.isGuest,
      reversesLineId: r.line.reversesLineId,
      reason: r.line.quantity < 0 ? r.reason : null,
    };
    entries.push(l);
    eventFor(r.businessDate, r.title).lines.push(l);
  }
  for (const r of payments) {
    const p: PaymentEntry & { cashGivenCents: number | null; reason: string | null } = {
      kind: "payment",
      id: r.payment.id,
      at: r.payment.createdAt,
      methodId: r.payment.methodId,
      amountCents: r.payment.amountCents,
      tipCents: r.payment.tipCents,
      reversesPaymentId: r.payment.reversesPaymentId,
      cashGivenCents: r.payment.cashGivenCents,
      reason: r.payment.reason,
    };
    entries.push(p);
    eventFor(r.businessDate, r.title).payments.push(p);
  }
  return { entries, events: [...events.values()] };
}

/** Stand für den Live-Bierdeckel – enthält ausschließlich Daten dieses einen Mitglieds. */
export async function getMemberStand(db: Db, m: { id: string; name: string }, now = new Date()): Promise<MemberStand> {
  const [[s], { entries }, badge] = await Promise.all([
    db.select().from(settings),
    loadEntries(db, m.id),
    getMemberOrderBadge(db, m.id, now),
  ]);
  const state = coasterState(entries);
  const stand = {
    clubName: s?.clubName ?? "Verein",
    logoUrl: s?.logoFileId ? `/api/datei/${s.logoFileId}` : null,
    memberName: m.name,
    paypalName: s?.paypalName || null,
    ...state,
    ...badge,
  };
  const version = createHash("sha256").update(JSON.stringify(stand)).digest("base64url").slice(0, 16);
  return { ...stand, version };
}

/** Kassenzettel des Mitglieds, neueste zuerst, seitenweise (vor einem Geschäftstag). */
export async function getMemberReceipts(
  db: Db,
  memberId: string,
  { before, limit = 10 }: { before?: string; limit?: number } = {},
): Promise<{ receipts: Receipt[]; nextBefore: string | null }> {
  const { events } = await loadEntries(db, memberId);
  const all = buildReceipts(events).filter((r) => !before || r.businessDate < before);
  const receipts = all.slice(0, limit);
  return { receipts, nextBefore: all.length > limit ? receipts[receipts.length - 1].businessDate : null };
}

/** Persönliche Übersicht (Ausgaben Monat/Jahr, Lieblingsartikel). */
export async function getMemberOverview(db: Db, memberId: string, now = new Date()): Promise<MemberOverview> {
  const [[s], { events }] = await Promise.all([db.select().from(settings), loadEntries(db, memberId)]);
  return memberOverview(events, businessDate(now, s?.businessDayCutoffHour ?? 6));
}

/** Kassenzettel eines Abends (für das PDF). */
export async function getMemberReceipt(db: Db, memberId: string, businessDate: string): Promise<Receipt | null> {
  const { events } = await loadEntries(db, memberId);
  return buildReceipts(events).find((r) => r.businessDate === businessDate) ?? null;
}

/**
 * Kontoauszug: offener Betrag am Anfang, alle Abende im Zeitraum (älteste zuerst), offen am Ende.
 * `from`/`to` sind Abend-Daten (jeweils einschließlich).
 */
export async function getMemberStatement(
  db: Db,
  memberId: string,
  from: string,
  to: string,
): Promise<{ openingCents: number; receipts: Receipt[]; closingCents: number }> {
  const { events } = await loadEntries(db, memberId);
  const all = buildReceipts(events).reverse();
  const openingCents = all.filter((r) => r.businessDate < from).at(-1)?.openAfterCents ?? 0;
  const receipts = all.filter((r) => r.businessDate >= from && r.businessDate <= to);
  return { openingCents, receipts, closingCents: receipts.at(-1)?.openAfterCents ?? openingCents };
}
