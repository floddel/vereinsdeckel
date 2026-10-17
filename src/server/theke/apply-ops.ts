import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { article, event, foodOrder, member, payment, paymentMethod, sale, saleLine, settings } from "@/db/schema";
import { businessDate } from "@/domain/business-date";
import { nextStatus } from "@/domain/food-order";
import { splitPayment } from "@/domain/payment";
import { planPaymentReversal } from "@/domain/reversal";
import {
  type BookedLine,
  type MoveOp,
  moveReason,
  type OpResult,
  type PaymentOp,
  type PaymentReversalOp,
  planSaleReversal,
  type ReversalOp,
  reversedQuantities,
  type SaleOp,
  type ThekeOp,
} from "@/domain/theke";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Fachlicher Fehler: Vorgang dauerhaft ablehnen (das Tablet soll ihn nicht erneut senden). */
class Rejected extends Error {}

export interface ApplyContext {
  deviceId: string;
  cutoffHour: number;
  now?: Date;
  /**
   * Korrektur aus der Verwaltung (mit PIN): Stornos auch für frühere Abende. Der Storno gehört
   * zum Abend des Originals und bekommt dessen Uhrzeit, damit Abendabschluss und Kassenzettel
   * danach stimmen; wann wirklich korrigiert wurde, steht in receivedAt (deviceId „verwaltung“).
   */
  verwaltung?: boolean;
}

/**
 * Speichert die Vorgänge der Theke der Reihe nach, jeden in einer eigenen Transaktion.
 * Idempotent: Eine schon gespeicherte ID ergibt „duplicate“ und ändert nichts.
 */
export async function applyOps(db: Db, ops: readonly ThekeOp[], ctx: ApplyContext): Promise<OpResult[]> {
  const results: OpResult[] = [];
  // In der Testphase zurückgesetzt? Dann gehören ältere, noch nicht gesendete Vorgänge zu den gelöschten Daten.
  const [s] = await db.select({ resetAt: settings.dataResetAt }).from(settings).where(eq(settings.id, 1));
  for (const op of ops) {
    if (s?.resetAt && Date.parse(op.createdAt) < s.resetAt.getTime()) {
      results.push({ id: op.id, status: "rejected", message: "Vor dem Zurücksetzen der Daten gebucht – verworfen" });
      continue;
    }
    try {
      const status = await db.transaction((tx) => applyOp(tx, op, ctx));
      results.push({ id: op.id, status });
    } catch (e) {
      if (e instanceof Rejected) results.push({ id: op.id, status: "rejected", message: e.message });
      else throw e;
    }
  }
  return results;
}

async function applyOp(tx: Tx, op: ThekeOp, ctx: ApplyContext): Promise<"ok" | "duplicate"> {
  if (op.type === "payment" || op.type === "payment-reversal") {
    if (await paymentExists(tx, op.id)) return "duplicate";
    if (op.type === "payment") await applyPayment(tx, op, ctx);
    else await applyPaymentReversal(tx, op, ctx);
    return "ok";
  }
  if (await saleExists(tx, op.id)) return "duplicate";
  if (op.type === "sale") await applySale(tx, op, ctx);
  else if (op.type === "reversal") await applyReversal(tx, op, ctx, op.reason);
  else await applyMove(tx, op, ctx);
  return "ok";
}

async function paymentExists(tx: Tx, id: string) {
  const [row] = await tx.select({ id: payment.id }).from(payment).where(eq(payment.id, id));
  return !!row;
}

/** Offener Betrag eines Mitglieds laut Datenbank. */
export async function openCents(tx: Tx, memberId: string): Promise<number> {
  const [lines] = await tx
    .select({ cents: sql<number>`coalesce(sum(${saleLine.totalCents}), 0)`.mapWith(Number) })
    .from(saleLine)
    .innerJoin(sale, eq(saleLine.saleId, sale.id))
    .where(eq(sale.memberId, memberId));
  const [paid] = await tx
    .select({ cents: sql<number>`coalesce(sum(${payment.amountCents}), 0)`.mapWith(Number) })
    .from(payment)
    .where(eq(payment.memberId, memberId));
  return lines.cents - paid.cents;
}

/**
 * Zahlung speichern. Zu viel bezahlt (z. B. weil das Tablet offline einen älteren Stand hatte)
 * wird Trinkgeld – nie Guthaben.
 */
async function applyPayment(tx: Tx, op: PaymentOp, ctx: ApplyContext) {
  await requireMember(tx, op.memberId);
  const [method] = await tx.select().from(paymentMethod).where(eq(paymentMethod.id, op.methodId));
  if (!method?.active) throw new Rejected("Zahlungsart nicht verfügbar");
  if (op.saleId) {
    const [s] = await tx.select({ memberId: sale.memberId }).from(sale).where(eq(sale.id, op.saleId));
    if (!s || s.memberId !== op.memberId) throw new Rejected("Bon gehört nicht zu diesem Mitglied");
  }
  // Sperre auf das Mitglied, damit zwei Geräte nicht gleichzeitig denselben offenen Betrag verrechnen.
  await tx.select({ id: member.id }).from(member).where(eq(member.id, op.memberId)).for("update");

  let split;
  try {
    split = splitPayment({
      openCents: await openCents(tx, op.memberId),
      receivedCents: op.amountCents + op.tipCents,
      keepChange: true,
    });
  } catch (e) {
    throw new Rejected((e as Error).message);
  }
  // Wer bewusst weniger zahlt (Teilzahlung), bleibt bei seinem Betrag.
  const amountCents = Math.min(op.amountCents, split.amountCents);
  const tipCents = op.amountCents + op.tipCents - amountCents;

  const at = deviceTime(op.createdAt, ctx.now ?? new Date());
  const eventId = await ensureEvent(tx, at, ctx.cutoffHour);
  await tx.insert(payment).values({
    id: op.id,
    memberId: op.memberId,
    eventId,
    methodId: method.id,
    amountCents,
    tipCents,
    cashGivenCents: op.cashGivenCents,
    saleId: op.saleId,
    createdAt: at,
    deviceId: ctx.deviceId,
  });
}

async function applyPaymentReversal(tx: Tx, op: PaymentReversalOp, ctx: ApplyContext) {
  const [original] = await tx.select().from(payment).where(eq(payment.id, op.paymentId)).for("update");
  if (!original) throw new Rejected("Zahlung nicht gefunden");
  await requireMember(tx, original.memberId);
  const at = ctx.verwaltung ? original.createdAt : deviceTime(op.createdAt, ctx.now ?? new Date());
  if (!ctx.verwaltung) await requireSameEvening(tx, original.eventId, at, ctx.cutoffHour, "Eine Zahlung");
  const [already] = await tx
    .select({ id: payment.id })
    .from(payment)
    .where(eq(payment.reversesPaymentId, original.id));
  let plan;
  try {
    plan = planPaymentReversal(original, !!already);
  } catch (e) {
    throw new Rejected((e as Error).message);
  }
  const eventId = ctx.verwaltung ? original.eventId : await ensureEvent(tx, at, ctx.cutoffHour);
  await tx.insert(payment).values({
    id: op.id,
    memberId: original.memberId,
    eventId,
    methodId: original.methodId,
    ...plan,
    reason: op.reason,
    createdAt: at,
    deviceId: ctx.deviceId,
  });
}

async function saleExists(tx: Tx, id: string) {
  const [row] = await tx.select({ id: sale.id }).from(sale).where(eq(sale.id, id));
  return !!row;
}

/**
 * Wie weit die Uhrzeit des Tablets zurückliegen darf: Offline zählt sie (z. B. Internet bis zum
 * nächsten Vereinsabend weg). Ältere Zeiten gelten nicht, damit niemand an der Theke ohne PIN
 * Buchungen in längst vergangene Abende schreiben kann.
 */
export const OFFLINE_GRACE_DAYS = 7;

/** Zeit vom Tablet; liegt sie in der Zukunft (falsch gestellte Uhr) oder zu weit zurück, gilt die Serverzeit. */
function deviceTime(iso: string, now: Date): Date {
  const t = new Date(iso);
  if (t.getTime() > now.getTime() + 5 * 60_000) return now;
  if (t.getTime() < now.getTime() - OFFLINE_GRACE_DAYS * 24 * 60 * 60_000) return now;
  return t;
}

/**
 * Stornos an der Theke (ohne PIN) nur am selben Abend wie der Bon bzw. die Zahlung –
 * genau das, was die Theke anbietet. Ältere Vorgänge gehören in die Verwaltung.
 */
async function requireSameEvening(tx: Tx, originalEventId: string, at: Date, cutoffHour: number, what: string) {
  const [e] = await tx.select({ businessDate: event.businessDate }).from(event).where(eq(event.id, originalEventId));
  if (!e || e.businessDate !== businessDate(at, cutoffHour)) {
    throw new Rejected(`${what} von einem früheren Abend kann an der Theke nicht storniert werden`);
  }
}

/** Abend zum Zeitpunkt holen oder anlegen (ein Abend je Geschäftstag). */
export async function ensureEvent(tx: Tx, at: Date, cutoffHour: number): Promise<string> {
  const day = businessDate(at, cutoffHour);
  await tx.insert(event).values({ businessDate: day }).onConflictDoNothing();
  const [row] = await tx.select({ id: event.id }).from(event).where(eq(event.businessDate, day));
  return row.id;
}

async function requireMember(tx: Tx, id: string) {
  // Geteilte Sperre: Läuft gerade das Anonymisieren (FOR UPDATE), wartet die Buchung und
  // sieht danach das anonymisierte Mitglied – so geht keine Schuld unbemerkt verloren.
  const [m] = await tx
    .select({ id: member.id, name: member.name })
    .from(member)
    .where(and(eq(member.id, id), isNull(member.anonymizedAt)))
    .for("share");
  if (!m) throw new Rejected("Mitglied nicht gefunden");
  return m;
}

async function applySale(tx: Tx, op: SaleOp, ctx: ApplyContext) {
  await requireMember(tx, op.memberId);
  const ids = [...new Set(op.lines.map((l) => l.articleId))];
  const found = await tx.select({ id: article.id }).from(article).where(inArray(article.id, ids));
  if (found.length !== ids.length) throw new Rejected("Artikel nicht gefunden");

  if (op.foodOrderId) {
    // Sperre auf die Bestellung: Zwei Tablets können sie nicht gleichzeitig abholen.
    const [o] = await tx.select().from(foodOrder).where(eq(foodOrder.id, op.foodOrderId)).for("update");
    if (!o || o.memberId !== op.memberId) throw new Rejected("Bestellung nicht gefunden");
    const next = nextStatus(o.status, "pickup");
    if (!next.ok || o.saleId) throw new Rejected(next.ok ? "Bestellung wurde schon abgeholt" : next.message);
  }

  const at = deviceTime(op.createdAt, ctx.now ?? new Date());
  const eventId = await ensureEvent(tx, at, ctx.cutoffHour);
  await tx.insert(sale).values({ id: op.id, memberId: op.memberId, eventId, kind: "sale", createdAt: at, deviceId: ctx.deviceId });
  await tx.insert(saleLine).values(
    op.lines.map((l) => ({
      id: l.id,
      saleId: op.id,
      articleId: l.articleId,
      articleName: l.articleName,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      totalCents: l.quantity * l.unitPriceCents,
      isGuest: l.isGuest,
    })),
  );
  if (op.foodOrderId) {
    await tx
      .update(foodOrder)
      .set({ status: "picked_up", saleId: op.id, updatedAt: ctx.now ?? new Date() })
      .where(eq(foodOrder.id, op.foodOrderId));
  }
}

/** Storno eines Bons (ganz oder teilweise). Liefert die Storno-Positionen für „Umbuchen“. */
async function applyReversal(tx: Tx, op: ReversalOp | MoveOp, ctx: ApplyContext, reason: string, movedToMemberId: string | null = null) {
  // Sperre auf den Original-Bon: Zwei Geräte können denselben Bon nicht gleichzeitig stornieren.
  const [original] = await tx.select().from(sale).where(eq(sale.id, op.saleId)).for("update");
  if (!original || original.kind !== "sale") throw new Rejected("Bon nicht gefunden");
  await requireMember(tx, original.memberId);
  const at = ctx.verwaltung ? original.createdAt : deviceTime(op.createdAt, ctx.now ?? new Date());
  if (!ctx.verwaltung) await requireSameEvening(tx, original.eventId, at, ctx.cutoffHour, "Ein Bon");

  const lines: BookedLine[] = await tx.select().from(saleLine).where(eq(saleLine.saleId, original.id));
  const reversals = await tx
    .select({ line: saleLine })
    .from(saleLine)
    .innerJoin(sale, eq(saleLine.saleId, sale.id))
    .where(eq(sale.reversesSaleId, original.id));

  let planned;
  try {
    planned = planSaleReversal(lines, reversedQuantities(reversals.map((r) => r.line)), op.lines);
  } catch (e) {
    throw new Rejected((e as Error).message);
  }

  const eventId = ctx.verwaltung ? original.eventId : await ensureEvent(tx, at, ctx.cutoffHour);
  await tx.insert(sale).values({
    id: op.id,
    memberId: original.memberId,
    eventId,
    kind: "reversal",
    reversesSaleId: original.id,
    reason,
    movedToMemberId,
    createdAt: at,
    deviceId: ctx.deviceId,
  });
  await tx.insert(saleLine).values(planned.map((l) => ({ ...l, id: randomUUID(), saleId: op.id })));
  return { planned, eventId, at, fromMemberId: original.memberId };
}

async function applyMove(tx: Tx, op: MoveOp, ctx: ApplyContext) {
  const to = await requireMember(tx, op.toMemberId);
  if (await saleExists(tx, op.newSaleId)) throw new Rejected("Umbuchung wurde schon gespeichert");
  const { planned, eventId, at, fromMemberId } = await applyReversal(tx, op, ctx, moveReason(to.name), to.id);
  if (fromMemberId === to.id) throw new Rejected("Umbuchen auf dasselbe Mitglied ist nicht möglich");

  await tx.insert(sale).values({ id: op.newSaleId, memberId: to.id, eventId, kind: "sale", createdAt: at, deviceId: ctx.deviceId });
  await tx.insert(saleLine).values(
    planned.map((l) => ({
      id: randomUUID(),
      saleId: op.newSaleId,
      articleId: l.articleId,
      articleName: l.articleName,
      quantity: -l.quantity,
      unitPriceCents: l.unitPriceCents,
      totalCents: -l.totalCents,
      isGuest: l.isGuest,
    })),
  );
}
