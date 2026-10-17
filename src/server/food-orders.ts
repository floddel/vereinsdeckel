import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { article, event, foodOrder, foodOrderLine, member, settings } from "@/db/schema";
import { businessDate } from "@/domain/business-date";
import {
  type FoodOrderStatus,
  MAX_OPEN_ORDERS,
  MAX_ORDERS_PER_EVENING,
  type MemberOrderInput,
  nextStatus,
  OPEN_STATUSES,
  ORDER_RETENTION_DAYS,
  type ThekeOrderAction,
} from "@/domain/food-order";
import { stockRef } from "@/domain/stock";
import { getStockOverview } from "./stock";
import { onSale } from "./on-sale";
import { ensureEvent } from "./theke/apply-ops";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

/**
 * Bestellbar sind nur aktive Artikel der Kategorie Essen mit Häkchen „per Handy bestellbar“ –
 * selbst gekochte nur an dem Abend, für den sie eingeschaltet sind.
 */
const orderableArticle = (now: Date, cutoffHour: number) =>
  and(eq(article.active, true), eq(article.orderable, true), eq(article.categoryId, "essen"), onSale(businessDate(now, cutoffHour)));

export interface MenuArticle {
  id: string;
  name: string;
  icon: string;
  priceCents: number;
  /** noch bestellbar laut Bestand (abzüglich offener Bestellungen); null = unbegrenzt */
  left: number | null;
}

export interface OrderLineView {
  articleId: string;
  articleName: string;
  quantity: number;
  /** aktueller Preis (gebucht wird der Preis beim Abholen) */
  unitPriceCents: number;
}

export interface MemberOrder {
  id: string;
  status: FoodOrderStatus;
  /** Hat die Theke die Bestellung schon angezeigt? */
  seen: boolean;
  note: string | null;
  rejectReason: string | null;
  createdAt: string;
  lines: OrderLineView[];
  totalCents: number;
}

export interface MemberOrders {
  /** Küche offen und mindestens ein Essen bestellbar */
  kitchenOpen: boolean;
  menu: MenuArticle[];
  /** Bestellungen des aktuellen Abends, neueste zuerst */
  orders: MemberOrder[];
  version: string;
}

export interface ThekeOrder {
  id: string;
  memberId: string;
  memberName: string;
  status: "new" | "accepted" | "ready";
  note: string | null;
  createdAt: string;
  lines: OrderLineView[];
}

export interface ThekeOrders {
  kitchenOpen: boolean;
  /** Anzahl bestellbarer Artikel (0 = Hinweis: in der Verwaltung Häkchen setzen) */
  orderableCount: number;
  /** offene Bestellungen des Abends, älteste zuerst */
  orders: ThekeOrder[];
}

async function readSettings(db: Db) {
  const [s] = await db
    .select({ kitchenOpen: settings.kitchenOpen, cutoffHour: settings.businessDayCutoffHour })
    .from(settings);
  return { kitchenOpen: s?.kitchenOpen ?? false, cutoffHour: s?.cutoffHour ?? 6 };
}

async function getMenu(db: Db, now: Date, cutoffHour: number): Promise<MenuArticle[]> {
  const [rows, { rows: stockRows }, eventId] = await Promise.all([
    db
      .select({ id: article.id, name: article.name, icon: article.icon, priceCents: article.priceCents, servingMl: article.servingMl, stockArticleId: article.stockArticleId })
      .from(article)
      .where(orderableArticle(now, cutoffHour))
      .orderBy(asc(article.sortOrder), asc(article.name)),
    getStockOverview(db),
    todayEventId(db, now, cutoffHour),
  ]);
  // Nur bestellen, was da ist: Bestand minus offene Bestellungen (noch nicht abgeholt)
  const stock = Object.fromEntries(stockRows.map((r) => [r.articleId, r.stock]));
  const reserved = eventId
    ? await db
        .select({ articleId: foodOrderLine.articleId, quantity: foodOrderLine.quantity, servingMl: article.servingMl, stockArticleId: article.stockArticleId })
        .from(foodOrderLine)
        .innerJoin(foodOrder, eq(foodOrder.id, foodOrderLine.foodOrderId))
        .innerJoin(article, eq(article.id, foodOrderLine.articleId))
        .where(and(eq(foodOrder.eventId, eventId), inArray(foodOrder.status, OPEN_STATUSES)))
    : [];
  for (const r of reserved) {
    const ref = stockRef({ id: r.articleId, servingMl: r.servingMl, stockArticleId: r.stockArticleId }, stock);
    if (ref) stock[ref.pool] -= r.quantity * ref.perUnit;
  }
  return rows.map(({ servingMl, stockArticleId, ...a }) => {
    const ref = stockRef({ id: a.id, servingMl, stockArticleId }, stock);
    return { ...a, left: ref ? Math.max(Math.floor(stock[ref.pool] / ref.perUnit), 0) : null };
  });
}

async function todayEventId(db: Db, now: Date, cutoffHour: number): Promise<string | null> {
  const [e] = await db.select({ id: event.id }).from(event).where(eq(event.businessDate, businessDate(now, cutoffHour)));
  return e?.id ?? null;
}

async function loadLines(db: Db, orderIds: string[]): Promise<Map<string, OrderLineView[]>> {
  if (orderIds.length === 0) return new Map();
  const rows = await db
    .select({
      orderId: foodOrderLine.foodOrderId,
      articleId: foodOrderLine.articleId,
      articleName: article.name,
      quantity: foodOrderLine.quantity,
      unitPriceCents: article.priceCents,
    })
    .from(foodOrderLine)
    .innerJoin(article, eq(article.id, foodOrderLine.articleId))
    .where(inArray(foodOrderLine.foodOrderId, orderIds))
    .orderBy(asc(article.sortOrder), asc(article.name));
  const map = new Map<string, OrderLineView[]>();
  for (const { orderId, ...line } of rows) map.set(orderId, [...(map.get(orderId) ?? []), line]);
  return map;
}

// ---------------------------------------------------------------------------
// Handy (Mitglied) – die Mitglieds-ID kommt immer aus dem Link
// ---------------------------------------------------------------------------

export async function getMemberOrders(db: Db, memberId: string, now = new Date()): Promise<MemberOrders> {
  const { kitchenOpen, cutoffHour } = await readSettings(db);
  const [menu, eventId] = await Promise.all([getMenu(db, now, cutoffHour), todayEventId(db, now, cutoffHour)]);
  const rows = eventId
    ? await db
        .select()
        .from(foodOrder)
        .where(and(eq(foodOrder.memberId, memberId), eq(foodOrder.eventId, eventId)))
        .orderBy(desc(foodOrder.createdAt))
    : [];
  const lines = await loadLines(db, rows.map((r) => r.id));
  const orders = rows.map((r) => {
    const l = lines.get(r.id) ?? [];
    return {
      id: r.id,
      status: r.status,
      seen: !!r.seenAt,
      note: r.note,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt.toISOString(),
      lines: l,
      totalCents: l.reduce((s, x) => s + x.quantity * x.unitPriceCents, 0),
    };
  });
  const data = { kitchenOpen: kitchenOpen && menu.length > 0, menu, orders };
  const version = createHash("sha256").update(JSON.stringify(data)).digest("base64url").slice(0, 16);
  return { ...data, version };
}

/** Kurzform für den Bierdeckel: Küche offen? Wie weit ist die eigene Bestellung? */
export async function getMemberOrderBadge(
  db: Db,
  memberId: string,
  now = new Date(),
): Promise<{ kitchenOpen: boolean; orderStatus: "new" | "accepted" | "ready" | null }> {
  const { kitchenOpen, cutoffHour } = await readSettings(db);
  const [[menu], eventId] = await Promise.all([
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(article).where(orderableArticle(now, cutoffHour)),
    todayEventId(db, now, cutoffHour),
  ]);
  const open = eventId
    ? await db
        .select({ status: foodOrder.status })
        .from(foodOrder)
        .where(and(eq(foodOrder.memberId, memberId), eq(foodOrder.eventId, eventId), inArray(foodOrder.status, OPEN_STATUSES)))
    : [];
  const rank = { new: 0, accepted: 1, ready: 2 } as const;
  const best = open
    .map((o) => o.status as keyof typeof rank)
    .sort((a, b) => rank[b] - rank[a])[0];
  return { kitchenOpen: kitchenOpen && menu.n > 0, orderStatus: best ?? null };
}

export async function createFoodOrder(
  db: Db,
  memberId: string,
  input: MemberOrderInput,
  now = new Date(),
): Promise<Result<{ id: string }>> {
  // Nur bestellen, was da ist (Bestand minus offene Bestellungen). Gelesen vor der Transaktion;
  // zwei Bestellungen im selben Augenblick könnten zusammen knapp darüber liegen – das ist hinnehmbar.
  const menu = new Map((await getMenu(db, now, (await readSettings(db)).cutoffHour)).map((a) => [a.id, a]));
  const result = await db.transaction(async (tx): Promise<Result<{ id: string }>> => {
    // Sperre auf das Mitglied: Zwei schnelle Klicks ergeben nicht zwei Bestellungen über der Grenze.
    const [m] = await tx
      .select({ active: member.active })
      .from(member)
      .where(and(eq(member.id, memberId), isNull(member.anonymizedAt)))
      .for("update");
    if (!m?.active) return { ok: false, message: "Bestellen ist mit diesem Link nicht möglich." };

    const [s] = await tx.select({ kitchenOpen: settings.kitchenOpen, cutoffHour: settings.businessDayCutoffHour }).from(settings);
    if (!s?.kitchenOpen) return { ok: false, message: "Die Küche ist gerade zu." };

    const ids = input.lines.map((l) => l.articleId);
    const found = await tx
      .select({ id: article.id })
      .from(article)
      .where(and(inArray(article.id, ids), orderableArticle(now, s.cutoffHour)));
    if (found.length !== ids.length) return { ok: false, message: "Ein Essen ist gerade nicht bestellbar. Bitte neu laden." };
    const short = input.lines.find((l) => {
      const left = menu.get(l.articleId)?.left;
      return left !== null && left !== undefined && l.quantity > left;
    });
    if (short) {
      const a = menu.get(short.articleId)!;
      return { ok: false, message: a.left ? `Von ${a.name} sind nur noch ${a.left} da.` : `${a.name} ist leider aus.` };
    }

    const eventId = await ensureEvent(tx, now, s.cutoffHour);
    const mine = await tx
      .select({ status: foodOrder.status })
      .from(foodOrder)
      .where(and(eq(foodOrder.memberId, memberId), eq(foodOrder.eventId, eventId)));
    if (mine.filter((o) => (OPEN_STATUSES as readonly string[]).includes(o.status)).length >= MAX_OPEN_ORDERS) {
      return { ok: false, message: `Du hast schon ${MAX_OPEN_ORDERS} offene Bestellungen. Bitte erst abholen.` };
    }
    if (mine.length >= MAX_ORDERS_PER_EVENING) {
      return { ok: false, message: "Für heute sind genug Bestellungen eingegangen. Bitte vorne bestellen." };
    }

    const [o] = await tx
      .insert(foodOrder)
      .values({ memberId, eventId, note: input.note, createdAt: now, updatedAt: now })
      .returning({ id: foodOrder.id });
    await tx.insert(foodOrderLine).values(input.lines.map((l) => ({ foodOrderId: o.id, ...l })));
    return { ok: true, id: o.id };
  });
  if (result.ok) await deleteOldFoodOrders(db, now);
  return result;
}

/** Zurückziehen – nur die eigene Bestellung und nur, solange sie noch nicht angenommen ist. */
export async function cancelFoodOrder(db: Db, memberId: string, orderId: string, now = new Date()): Promise<Result> {
  return db.transaction(async (tx): Promise<Result> => {
    const [o] = await tx
      .select({ status: foodOrder.status })
      .from(foodOrder)
      .where(and(eq(foodOrder.id, orderId), eq(foodOrder.memberId, memberId)))
      .for("update");
    if (!o) return { ok: false, message: "Bestellung nicht gefunden." };
    const next = nextStatus(o.status, "cancel");
    if (!next.ok) return next;
    await tx.update(foodOrder).set({ status: next.status, updatedAt: now }).where(eq(foodOrder.id, orderId));
    return { ok: true };
  });
}

/** Datensparsamkeit: Bestellungen nach 30 Tagen löschen (die Buchung im Bierdeckel bleibt). */
export async function deleteOldFoodOrders(db: Db, now = new Date()): Promise<void> {
  const limit = new Date(now.getTime() - ORDER_RETENTION_DAYS * 24 * 60 * 60_000);
  await db.delete(foodOrder).where(lt(foodOrder.createdAt, limit));
}

// ---------------------------------------------------------------------------
// Theke (angemeldet)
// ---------------------------------------------------------------------------

/** Offene Bestellungen des Abends. Neue werden dabei als „an der Theke angekommen“ markiert. */
export async function getThekeOrders(db: Db, now = new Date()): Promise<ThekeOrders> {
  const { kitchenOpen, cutoffHour } = await readSettings(db);
  const [[count], eventId] = await Promise.all([
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(article).where(orderableArticle(now, cutoffHour)),
    todayEventId(db, now, cutoffHour),
  ]);
  if (!eventId) return { kitchenOpen, orderableCount: count.n, orders: [] };

  const open = and(eq(foodOrder.eventId, eventId), inArray(foodOrder.status, OPEN_STATUSES));
  await db
    .update(foodOrder)
    .set({ seenAt: now })
    .where(and(open, isNull(foodOrder.seenAt)));
  const rows = await db
    .select({ order: foodOrder, memberName: member.name })
    .from(foodOrder)
    .innerJoin(member, eq(member.id, foodOrder.memberId))
    .where(open)
    .orderBy(asc(foodOrder.createdAt));
  const lines = await loadLines(db, rows.map((r) => r.order.id));
  return {
    kitchenOpen,
    orderableCount: count.n,
    orders: rows.map(({ order: o, memberName }) => ({
      id: o.id,
      memberId: o.memberId,
      memberName,
      status: o.status as ThekeOrder["status"],
      note: o.note,
      createdAt: o.createdAt.toISOString(),
      lines: lines.get(o.id) ?? [],
    })),
  };
}

export async function updateFoodOrderStatus(
  db: Db,
  orderId: string,
  action: ThekeOrderAction,
  reason: string | null = null,
  now = new Date(),
): Promise<Result> {
  return db.transaction(async (tx): Promise<Result> => {
    const [o] = await tx.select({ status: foodOrder.status }).from(foodOrder).where(eq(foodOrder.id, orderId)).for("update");
    if (!o) return { ok: false, message: "Bestellung nicht gefunden" };
    const next = nextStatus(o.status, action);
    if (!next.ok) return next;
    if (next.status === o.status) return { ok: true };
    await tx
      .update(foodOrder)
      .set({ status: next.status, rejectReason: action === "reject" ? reason : null, updatedAt: now })
      .where(eq(foodOrder.id, orderId));
    return { ok: true };
  });
}

export async function setKitchenOpen(db: Db, open: boolean): Promise<void> {
  await db.update(settings).set({ kitchenOpen: open, updatedAt: new Date() }).where(eq(settings.id, 1));
}
