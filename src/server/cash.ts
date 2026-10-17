import { randomUUID } from "node:crypto";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cashCount, cashMovement, type CashMovementType, event, payment, paymentMethod, pot, purchase, purchaseLine } from "@/db/schema";
import { businessDate } from "@/domain/business-date";
import { type CashBookEntry, eveningTitle } from "@/domain/cash-book";
import { type CountInput, MOVEMENT_LABEL, type MovementInput, planMovement } from "@/domain/cash";
import { countDifferenceCents, outstandingAdvancesCents, potBalances } from "@/domain/pots";
import { formatCents } from "@/lib/money";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;

export interface PotOverview {
  pots: { id: string; name: string; balanceCents: number }[];
  /** privat vorgestreckt und noch nicht erstattet */
  advancesCents: number;
}

/** Soll aller Töpfe und offene Auslagen – immer aus den Einzelvorgängen berechnet. */
export async function getPotOverview(db: DbOrTx): Promise<PotOverview> {
  const [pots, methods, payments, purchases, movements] = await Promise.all([
    db.select().from(pot).orderBy(asc(pot.sortOrder)),
    db.select({ id: paymentMethod.id, potId: paymentMethod.potId }).from(paymentMethod),
    db.select({ methodId: payment.methodId, amountCents: payment.amountCents, tipCents: payment.tipCents }).from(payment),
    db
      .select({ source: purchase.source, totalCents: sql<number>`coalesce(${purchaseLine.totalCents}, 0)`.mapWith(Number) })
      .from(purchaseLine)
      .innerJoin(purchase, eq(purchase.id, purchaseLine.purchaseId)),
    db.select().from(cashMovement),
  ]);
  const balances = potBalances({
    payments,
    methodPot: Object.fromEntries(methods.map((m) => [m.id, m.potId])),
    purchases,
    movements,
  });
  const typeById = new Map(movements.map((m) => [m.id, m.type]));
  const advancesCents = outstandingAdvancesCents({
    purchases,
    movements: movements.map((m) => ({
      effectiveType: (m.type === "reversal" ? typeById.get(m.reversesMovementId ?? "") : m.type) ?? m.type,
      amountCents: m.amountCents,
    })),
  });
  return { pots: pots.map((p) => ({ id: p.id, name: p.name, balanceCents: balances[p.id] ?? 0 })), advancesCents };
}

export type CashResult = { ok: true } | { ok: false; error: string };

export async function addMovement(db: Db, input: MovementInput): Promise<CashResult> {
  return db.transaction(async (tx): Promise<CashResult> => {
    const known = new Set((await tx.select({ id: pot.id }).from(pot)).map((p) => p.id));
    if (!known.has(input.potId) || (input.toPotId && !known.has(input.toPotId))) return { ok: false, error: "Unbekannter Topf" };
    if (input.type === "reimbursement") {
      const { advancesCents } = await getPotOverview(tx);
      if (input.amountCents > advancesCents) {
        return { ok: false, error: `Es sind nur noch ${formatCents(advancesCents)} Auslagen offen` };
      }
    }
    const rows = planMovement(input);
    const transferGroupId = input.type === "transfer" ? randomUUID() : null;
    await tx.insert(cashMovement).values(rows.map((r) => ({ ...r, transferGroupId, note: input.note })));
    return { ok: true };
  });
}

/** Storno einer Bewegung (bei Umbuchung beide Seiten). Begründung Pflicht, nur einmal. */
export async function reverseMovement(db: Db, id: string, reason: string): Promise<CashResult> {
  return db.transaction(async (tx): Promise<CashResult> => {
    const [m] = await tx.select().from(cashMovement).where(eq(cashMovement.id, id)).for("update");
    if (!m) return { ok: false, error: "Bewegung nicht gefunden" };
    if (m.type === "reversal") return { ok: false, error: "Ein Storno kann nicht storniert werden" };
    const group = m.transferGroupId
      ? await tx.select().from(cashMovement).where(eq(cashMovement.transferGroupId, m.transferGroupId))
      : [m];
    const already = await tx
      .select({ id: cashMovement.id })
      .from(cashMovement)
      .where(inArray(cashMovement.reversesMovementId, group.map((g) => g.id)));
    if (already.length) return { ok: false, error: "Diese Bewegung ist schon storniert" };
    await tx.insert(cashMovement).values(
      group.map((g) => ({ potId: g.potId, type: "reversal" as const, amountCents: -g.amountCents, reversesMovementId: g.id, note: reason })),
    );
    return { ok: true };
  });
}

/** Kassenzählung: Differenz zum Soll protokollieren, auf Wunsch als Korrektur buchen. */
export async function recordCount(db: Db, input: CountInput): Promise<{ ok: true; differenceCents: number } | { ok: false; error: string }> {
  return db.transaction(async (tx) => {
    const overview = await getPotOverview(tx);
    const p = overview.pots.find((x) => x.id === input.potId);
    if (!p) return { ok: false as const, error: "Unbekannter Topf" };
    const differenceCents = countDifferenceCents(input.countedCents, p.balanceCents);
    let correctionMovementId: string | null = null;
    if (input.applyCorrection && differenceCents !== 0) {
      const [c] = await tx
        .insert(cashMovement)
        .values({ potId: p.id, type: "count_correction", amountCents: differenceCents, note: input.note ?? "Differenz aus Kassenzählung übernommen" })
        .returning({ id: cashMovement.id });
      correctionMovementId = c.id;
    }
    await tx.insert(cashCount).values({
      potId: p.id,
      countedCents: input.countedCents,
      expectedCents: p.balanceCents,
      differenceCents,
      correctionMovementId,
      note: input.note,
    });
    return { ok: true as const, differenceCents };
  });
}

export interface MovementView {
  id: string;
  potId: string;
  type: CashMovementType;
  amountCents: number;
  note: string;
  createdAt: Date;
  transferGroupId: string | null;
  /** storniert? (Begründung) */
  reversedReason: string | null;
  /** bei Storno-Zeilen: Art der stornierten Bewegung */
  reversesType: CashMovementType | null;
}

export async function listMovements(db: Db, limit = 100): Promise<MovementView[]> {
  const rows = await db.select().from(cashMovement).orderBy(desc(cashMovement.createdAt)).limit(limit);
  const ids = rows.map((r) => r.id);
  const reversedIds = rows.map((r) => r.reversesMovementId).filter((x): x is string => !!x);
  const [reversals, originals] = await Promise.all([
    ids.length ? db.select().from(cashMovement).where(inArray(cashMovement.reversesMovementId, ids)) : [],
    reversedIds.length ? db.select({ id: cashMovement.id, type: cashMovement.type }).from(cashMovement).where(inArray(cashMovement.id, reversedIds)) : [],
  ]);
  const reason = new Map(reversals.map((r) => [r.reversesMovementId!, r.note]));
  const typeOf = new Map(originals.map((o) => [o.id, o.type]));
  return rows.map((r) => ({
    id: r.id,
    potId: r.potId,
    type: r.type,
    amountCents: r.amountCents,
    note: r.note,
    createdAt: r.createdAt,
    transferGroupId: r.transferGroupId,
    reversedReason: reason.get(r.id) ?? null,
    reversesType: r.reversesMovementId ? (typeOf.get(r.reversesMovementId) ?? null) : null,
  }));
}

export async function listCounts(db: Db, limit = 20) {
  return db.select().from(cashCount).orderBy(desc(cashCount.createdAt)).limit(limit);
}

// ---------------------------------------------------------------------------
// Kassenbuch
// ---------------------------------------------------------------------------

/** Alle Ein- und Ausgänge eines Topfs (Abendeinnahmen je Abend zusammengefasst). */
export async function getCashBookEntries(db: Db, potId: string): Promise<CashBookEntry[]> {
  const [payments, purchases, movements] = await Promise.all([
    db
      .select({ payment, businessDate: event.businessDate, eventTitle: event.title })
      .from(payment)
      .innerJoin(paymentMethod, eq(paymentMethod.id, payment.methodId))
      .innerJoin(event, eq(event.id, payment.eventId))
      .where(eq(paymentMethod.potId, potId)),
    potId === "cash" || potId === "paypal"
      ? db
          .select({ purchase, totalCents: purchaseLine.totalCents, description: purchaseLine.description, quantity: purchaseLine.quantity })
          .from(purchaseLine)
          .innerJoin(purchase, eq(purchase.id, purchaseLine.purchaseId))
          .where(eq(purchase.source, potId))
      : [],
    db.select().from(cashMovement).where(eq(cashMovement.potId, potId)),
  ]);

  const entries: CashBookEntry[] = [];

  // Abendeinnahmen
  for (const rows of Map.groupBy(payments, (p) => p.businessDate).values()) {
    const amount = rows.reduce((s, r) => s + r.payment.amountCents + r.payment.tipCents, 0);
    const tip = rows.reduce((s, r) => s + r.payment.tipCents, 0);
    const count = rows.filter((r) => !r.payment.reversesPaymentId).length;
    const reversed = rows.length - count;
    entries.push({
      date: rows[0].businessDate,
      at: new Date(Math.max(...rows.map((r) => r.payment.createdAt.getTime()))),
      kind: "evening",
      title: rows[0].eventTitle ? `Einnahmen Abend „${rows[0].eventTitle}“` : "Einnahmen Abend",
      detail: eveningTitle(count, tip, formatCents) + (reversed ? `, ${reversed} storniert` : ""),
      amountCents: amount,
    });
  }

  // Einkäufe (privat vorgestreckte betreffen keinen Topf)
  for (const rows of Map.groupBy(purchases, (p) => p.purchase.id).values()) {
    const p = rows[0].purchase;
    const items = rows.map((r) => `${Math.abs(r.quantity)}× ${r.description}`).join(", ");
    entries.push({
      date: p.purchasedOn,
      at: p.createdAt,
      kind: "purchase",
      title: p.reversesPurchaseId ? "Storno Einkauf" : "Einkauf",
      detail: [p.reversesPurchaseId ? p.reason : p.note, items].filter(Boolean).join(" · "),
      amountCents: -rows.reduce((s, r) => s + (r.totalCents ?? 0), 0),
    });
  }

  // Kassenbewegungen
  const typeById = new Map((await db.select({ id: cashMovement.id, type: cashMovement.type }).from(cashMovement)).map((m) => [m.id, m.type]));
  for (const m of movements) {
    const reversed = m.reversesMovementId ? typeById.get(m.reversesMovementId) : null;
    entries.push({
      date: businessDate(m.createdAt, 0),
      at: m.createdAt,
      kind: "movement",
      title: reversed ? `Storno ${MOVEMENT_LABEL[reversed]}` : MOVEMENT_LABEL[m.type],
      detail: m.note,
      amountCents: m.amountCents,
    });
  }
  return entries;
}
