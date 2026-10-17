import { z } from "@/lib/z";
import { openLines } from "./account";
import { planLineReversal, planPaymentReversal } from "./reversal";
import type { AccountEntry } from "./types";

/**
 * Theke: Vorgänge („Ops“), die das Tablet an den Server schickt, und die Ansicht daraus.
 * Jeder Vorgang hat eine ID, die das Tablet selbst erzeugt. Der Server speichert jede ID
 * höchstens einmal – so darf das Tablet bei schlechtem Netz einfach erneut senden.
 */

// ---------------------------------------------------------------------------
// Vorgänge
// ---------------------------------------------------------------------------

const uuid = z.uuid();
const isoDate = z.iso.datetime({ offset: true });

export const MAX_QUANTITY = 99;
export const MAX_LINES = 50;

const saleLineInput = z.object({
  id: uuid,
  articleId: uuid,
  articleName: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  unitPriceCents: z.number().int().min(0).max(100_000),
  isGuest: z.boolean(),
});

const reversalRequest = z.union([
  z.literal("all"),
  z.array(z.object({ lineId: uuid, quantity: z.number().int().min(1).max(MAX_QUANTITY) })).min(1).max(MAX_LINES),
]);

export const saleOpSchema = z.object({
  type: z.literal("sale"),
  id: uuid,
  memberId: uuid,
  createdAt: isoDate,
  lines: z.array(saleLineInput).min(1).max(MAX_LINES),
  /** Abholung einer Handy-Bestellung: Bon und „abgeholt“ in einem Schritt */
  foodOrderId: uuid.optional(),
});

export const reversalOpSchema = z.object({
  type: z.literal("reversal"),
  id: uuid,
  saleId: uuid,
  createdAt: isoDate,
  reason: z.string().trim().min(1).max(200),
  lines: reversalRequest,
});

/** Umbuchen: Storno beim bisherigen Mitglied + gleiche Positionen beim neuen (in einem Schritt). */
export const moveOpSchema = z.object({
  type: z.literal("move"),
  id: uuid,
  newSaleId: uuid,
  saleId: uuid,
  toMemberId: uuid,
  createdAt: isoDate,
  lines: reversalRequest,
});

/** Zahlung (bar/PayPal). amountCents mindert den offenen Betrag, tipCents ist Trinkgeld. */
export const paymentOpSchema = z.object({
  type: z.literal("payment"),
  id: uuid,
  memberId: uuid,
  createdAt: isoDate,
  methodId: z.string().trim().min(1).max(40),
  amountCents: z.number().int().min(0).max(1_000_000),
  tipCents: z.number().int().min(0).max(100_000),
  /** Nur für den Beleg: wie viel Bargeld gegeben wurde */
  cashGivenCents: z.number().int().min(0).max(1_000_000).nullable(),
  /** „Sofort bezahlen“: gehört zu diesem Bon */
  saleId: uuid.nullable(),
});

/** Zahlungs-Storno: immer die ganze Zahlung (inkl. Trinkgeld). */
export const paymentReversalOpSchema = z.object({
  type: z.literal("payment-reversal"),
  id: uuid,
  paymentId: uuid,
  createdAt: isoDate,
  reason: z.string().trim().min(1).max(200),
});

export const thekeOpSchema = z.discriminatedUnion("type", [
  saleOpSchema,
  reversalOpSchema,
  moveOpSchema,
  paymentOpSchema,
  paymentReversalOpSchema,
]);
export const syncRequestSchema = z.object({
  deviceId: z.string().trim().min(1).max(64),
  ops: z.array(thekeOpSchema).min(1).max(100),
});

export type SaleOp = z.infer<typeof saleOpSchema>;
export type ReversalOp = z.infer<typeof reversalOpSchema>;
export type MoveOp = z.infer<typeof moveOpSchema>;
export type PaymentOp = z.infer<typeof paymentOpSchema>;
export type PaymentReversalOp = z.infer<typeof paymentReversalOpSchema>;
export type ThekeOp = z.infer<typeof thekeOpSchema>;
export type ReversalRequest = z.infer<typeof reversalRequest>;

/** Antwort je Vorgang. „rejected“ = dauerhaft abgelehnt (nicht erneut senden). */
export type OpResult = { id: string; status: "ok" | "duplicate" | "rejected"; message?: string };

export const moveReason = (toName: string) => `Umgebucht auf ${toName}`;

// ---------------------------------------------------------------------------
// Storno-Planung (gleiche Regeln auf Tablet und Server)
// ---------------------------------------------------------------------------

export interface BookedLine {
  id: string;
  articleId: string;
  articleName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  isGuest: boolean;
  reversesLineId: string | null;
}

export type PlannedReversalLine = Omit<BookedLine, "id"> & { reversesLineId: string };

/** Bereits stornierte Mengen je Position (als positive Zahl). */
export function reversedQuantities(lines: readonly BookedLine[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of lines) {
    if (l.reversesLineId) map.set(l.reversesLineId, (map.get(l.reversesLineId) ?? 0) - l.quantity);
  }
  return map;
}

/**
 * Storno-Positionen für einen Bon. „all“ = alles, was noch nicht storniert ist.
 * Wirft einen Fehler mit deutscher Meldung, wenn nichts (mehr) storniert werden kann.
 */
export function planSaleReversal(
  original: readonly BookedLine[],
  reversed: ReadonlyMap<string, number>,
  request: ReversalRequest,
): PlannedReversalLine[] {
  const byId = new Map(original.map((l) => [l.id, l]));
  const wanted =
    request === "all"
      ? original.map((l) => ({ lineId: l.id, quantity: l.quantity - (reversed.get(l.id) ?? 0) })).filter((r) => r.quantity > 0)
      : request;
  if (wanted.length === 0) throw new Error("Dieser Bon ist schon vollständig storniert");
  // Jede Position nur einmal – sonst würde die Höchstmenge je Eintrag geprüft, nicht insgesamt.
  if (new Set(wanted.map((w) => w.lineId)).size !== wanted.length) throw new Error("Position doppelt angegeben");

  return wanted.map(({ lineId, quantity }) => {
    const line = byId.get(lineId);
    if (!line) throw new Error("Position gehört nicht zu diesem Bon");
    const plan = planLineReversal(
      { id: line.id, quantity: line.quantity, unitPriceCents: line.unitPriceCents },
      [-(reversed.get(line.id) ?? 0)],
      quantity,
    );
    return { ...plan, articleId: line.articleId, articleName: line.articleName, isGuest: line.isGuest };
  });
}

// ---------------------------------------------------------------------------
// Stand der Theke (vom Server) + Ansicht inkl. noch nicht bestätigter Vorgänge
// ---------------------------------------------------------------------------

export interface ThekeArticle {
  id: string;
  name: string;
  categoryId: string;
  icon: string;
  priceCents: number;
  /**
   * Bestandsführung: aus welchem Bestand (Artikel-ID) und wie viel ein Verkauf davon verbraucht
   * (1 Stück bzw. die Portion in ml). null/fehlt = unbegrenzt verkaufbar.
   */
  stock?: { pool: string; perUnit: number } | null;
}

export interface ThekeMember {
  id: string;
  name: string;
  openCents: number;
}

export interface ThekeSale {
  id: string;
  memberId: string;
  kind: "sale" | "reversal";
  reversesSaleId: string | null;
  reason: string | null;
  createdAt: string;
  lines: BookedLine[];
}

export interface ThekePayment {
  id: string;
  memberId: string;
  methodId: string;
  amountCents: number;
  tipCents: number;
  cashGivenCents: number | null;
  reversesPaymentId: string | null;
  reason: string | null;
  saleId: string | null;
  createdAt: string;
}

export interface ThekeSnapshot {
  generatedAt: string;
  clubName: string;
  warnLimitCents: number;
  /** PayPal.me-Name (leer = PayPal nicht eingerichtet) */
  paypalName: string | null;
  paymentMethods: { id: string; label: string }[];
  cutoffHour: number;
  businessDate: string;
  categories: { id: string; name: string }[];
  articles: ThekeArticle[];
  members: ThekeMember[];
  /** Mitglieder-IDs, zuletzt bedient zuerst (über alle Abende) */
  recentMemberIds: string[];
  /** Bons und Stornos des aktuellen Abends, älteste zuerst */
  todaySales: ThekeSale[];
  /** Zahlungen und Zahlungs-Stornos des aktuellen Abends, älteste zuerst */
  todayPayments: ThekePayment[];
  /** Offene Posten früherer Abende je Mitglied (nur Mitglieder mit offenem Betrag) */
  carried: Record<string, CarriedDeckel>;
  /** Bestand je Bestands-Artikel (Stück bzw. ml) zum Zeitpunkt des Stands */
  stock?: Record<string, number>;
}

/** Ein Posten von einem früheren Abend, der noch „auf dem Deckel“ steht. */
export interface CarriedLine {
  at: string;
  businessDate: string;
  articleName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  isGuest: boolean;
}

export interface CarriedDeckel {
  lines: CarriedLine[];
  /** Teilzahlungen auf diese Posten (vor dem heutigen Abend) */
  paidCents: number;
}

export interface PendingOp {
  op: ThekeOp;
  /** Server hat den Vorgang bestätigt, der neue Stand ist aber noch nicht da */
  acked?: boolean;
}

export interface ThekeView {
  members: ThekeMember[];
  membersById: Map<string, ThekeMember>;
  presentIds: Set<string>;
  recentMemberIds: string[];
  /** inkl. noch nicht bestätigter Vorgänge (pending = true) */
  todaySales: (ThekeSale & { pending?: boolean })[];
  todayPayments: (ThekePayment & { pending?: boolean })[];
  /** Bestand je Bestands-Artikel abzüglich noch nicht bestätigter Verkäufe */
  stockLeft: Map<string, number>;
}

const saleTotal = (lines: readonly { totalCents: number }[]) => lines.reduce((s, l) => s + l.totalCents, 0);

/**
 * Wendet noch nicht bestätigte Vorgänge auf den Server-Stand an, damit die Theke sofort
 * den richtigen offenen Betrag zeigt. Vorgänge, die schon im Stand enthalten sind, zählen nicht doppelt.
 * Fehlerhafte Vorgänge (z. B. doppeltes Storno) werden hier still übergangen – der Server lehnt sie ab.
 */
export function buildThekeView(snapshot: ThekeSnapshot, pending: readonly PendingOp[]): ThekeView {
  const open = new Map(snapshot.members.map((m) => [m.id, m.openCents]));
  const sales: (ThekeSale & { pending?: boolean })[] = [...snapshot.todaySales];
  const payments: (ThekePayment & { pending?: boolean })[] = [...snapshot.todayPayments];
  const known = new Set([...sales.map((s) => s.id), ...payments.map((p) => p.id)]);
  const present = new Set([...sales.map((s) => s.memberId), ...payments.map((p) => p.memberId)]);
  const recent = [...snapshot.recentMemberIds];
  const addOpen = (memberId: string, cents: number) => open.set(memberId, (open.get(memberId) ?? 0) + cents);
  // Noch nicht bestätigte Verkäufe mindern den Bestand (Stornos sind negative Mengen und geben zurück)
  const stockLeft = new Map(Object.entries(snapshot.stock ?? {}));
  const articleStock = new Map(snapshot.articles.map((a) => [a.id, a.stock ?? null]));
  const pushSale = (s: ThekeSale & { pending?: boolean }) => {
    sales.push(s);
    for (const l of s.lines) {
      const st = articleStock.get(l.articleId);
      if (st) stockLeft.set(st.pool, (stockLeft.get(st.pool) ?? 0) - l.quantity * st.perUnit);
    }
  };
  const touch = (memberId: string) => {
    present.add(memberId);
    const i = recent.indexOf(memberId);
    if (i >= 0) recent.splice(i, 1);
    recent.unshift(memberId);
  };

  const reverse = (id: string, saleId: string, request: ReversalRequest, reason: string, createdAt: string) => {
    const original = sales.find((s) => s.id === saleId && s.kind === "sale");
    if (!original) return null;
    const related = sales.filter((s) => s.reversesSaleId === saleId).flatMap((s) => s.lines);
    try {
      const lines = planSaleReversal(original.lines, reversedQuantities(related), request).map((l, i) => ({
        ...l,
        id: `${id}:${i}`,
      }));
      const s = { id, memberId: original.memberId, kind: "reversal" as const, reversesSaleId: saleId, reason, createdAt, lines, pending: true };
      pushSale(s);
      addOpen(original.memberId, saleTotal(lines));
      return { original, lines };
    } catch {
      return null;
    }
  };

  for (const { op } of pending) {
    if (known.has(op.id)) continue;
    if (op.type === "sale") {
      const lines = op.lines.map((l) => ({ ...l, totalCents: l.quantity * l.unitPriceCents, reversesLineId: null }));
      pushSale({ id: op.id, memberId: op.memberId, kind: "sale", reversesSaleId: null, reason: null, createdAt: op.createdAt, lines, pending: true });
      addOpen(op.memberId, saleTotal(lines));
      touch(op.memberId);
    } else if (op.type === "reversal") {
      reverse(op.id, op.saleId, op.lines, op.reason, op.createdAt);
    } else if (op.type === "payment") {
      // Zu viel bezahlt wird Trinkgeld (wie auf dem Server) – nie Guthaben.
      const openNow = open.get(op.memberId) ?? 0;
      const amountCents = Math.min(op.amountCents, Math.max(openNow, 0));
      const tipCents = op.tipCents + op.amountCents - amountCents;
      payments.push({
        id: op.id,
        memberId: op.memberId,
        methodId: op.methodId,
        amountCents,
        tipCents,
        cashGivenCents: op.cashGivenCents,
        reversesPaymentId: null,
        reason: null,
        saleId: op.saleId,
        createdAt: op.createdAt,
        pending: true,
      });
      addOpen(op.memberId, -amountCents);
      touch(op.memberId);
    } else if (op.type === "payment-reversal") {
      const original = payments.find((p) => p.id === op.paymentId);
      if (!original) continue;
      try {
        const plan = planPaymentReversal(original, payments.some((p) => p.reversesPaymentId === original.id));
        payments.push({ ...original, ...plan, id: op.id, reason: op.reason, saleId: null, createdAt: op.createdAt, pending: true });
        addOpen(original.memberId, -plan.amountCents);
      } catch {
        // doppeltes Storno: der Server lehnt ab
      }
    } else {
      const to = snapshot.members.find((m) => m.id === op.toMemberId);
      const done = reverse(op.id, op.saleId, op.lines, moveReason(to?.name ?? "anderes Mitglied"), op.createdAt);
      if (done && !known.has(op.newSaleId)) {
        const lines = done.lines.map((l, i) => ({
          ...l,
          id: `${op.newSaleId}:${i}`,
          quantity: -l.quantity,
          totalCents: -l.totalCents,
          reversesLineId: null,
        }));
        pushSale({ id: op.newSaleId, memberId: op.toMemberId, kind: "sale", reversesSaleId: null, reason: null, createdAt: op.createdAt, lines, pending: true });
        addOpen(op.toMemberId, saleTotal(lines));
        touch(op.toMemberId);
      }
    }
  }

  const members = snapshot.members.map((m) => ({ ...m, openCents: open.get(m.id) ?? m.openCents }));
  return {
    members,
    membersById: new Map(members.map((m) => [m.id, m])),
    presentIds: present,
    recentMemberIds: recent,
    todaySales: sales,
    todayPayments: payments,
    stockLeft,
  };
}

/**
 * Wie viele Stück bzw. Portionen eines Artikels noch verkauft werden können –
 * abzüglich dessen, was schon im Warenkorb liegt (auch andere Artikel aus demselben Bestand,
 * z. B. Glas und ganze Flasche). Infinity = ohne Bestandsführung.
 */
export function availableUnits(
  article: Pick<ThekeArticle, "stock">,
  stockLeft: ReadonlyMap<string, number>,
  cart: readonly { article: Pick<ThekeArticle, "stock">; quantity: number }[],
): number {
  const st = article.stock;
  if (!st) return Number.POSITIVE_INFINITY;
  const inCart = cart.reduce((sum, l) => sum + (l.article.stock?.pool === st.pool ? l.quantity * l.article.stock.perUnit : 0), 0);
  return Math.max(Math.floor(((stockLeft.get(st.pool) ?? 0) - inCart) / st.perUnit), 0);
}

// ---------------------------------------------------------------------------
// Mitgliederauswahl
// ---------------------------------------------------------------------------

/** Anfangsbuchstabe für die A–Z-Leiste (Ä → A, Ziffern/Sonstiges → #). */
export function memberLetter(name: string): string {
  const c = name.trim().charAt(0).toLocaleUpperCase("de").normalize("NFD").charAt(0);
  return /[A-Z]/.test(c) ? c : "#";
}

/** Für die Suche: klein, ohne Akzente/Umlaut-Punkte. */
export function searchKey(s: string): string {
  return s.toLocaleLowerCase("de").normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss");
}

export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "de");

/**
 * Suche: Treffer, deren Name (oder ein Namensteil) mit der Eingabe beginnt, zuerst;
 * danach Treffer irgendwo im Namen. Anwesende werden innerhalb gleicher Güte bevorzugt.
 */
export function searchMembers<T extends { id: string; name: string }>(
  members: readonly T[],
  query: string,
  presentIds: ReadonlySet<string>,
): T[] {
  const q = searchKey(query.trim());
  if (!q) return [];
  const scored: { m: T; score: number }[] = [];
  for (const m of members) {
    const key = searchKey(m.name);
    const score = key.startsWith(q) ? 0 : key.split(/[\s-]+/).some((p) => p.startsWith(q)) ? 1 : key.includes(q) ? 2 : -1;
    if (score >= 0) scored.push({ m, score: score * 2 + (presentIds.has(m.id) ? 0 : 1) });
  }
  return scored.sort((a, b) => a.score - b.score || byName(a.m, b.m)).map((s) => s.m);
}

/** Zuletzt bediente (höchstens `limit`), dann Anwesende und übrige – jeweils alphabetisch. */
export function groupMembers<T extends { id: string; name: string }>(
  members: readonly T[],
  presentIds: ReadonlySet<string>,
  recentIds: readonly string[],
  limit = 8,
): { recent: T[]; present: T[]; others: T[] } {
  const byId = new Map(members.map((m) => [m.id, m]));
  const recent = recentIds.map((id) => byId.get(id)).filter((m): m is T => !!m).slice(0, limit);
  const sorted = [...members].sort(byName);
  return {
    recent,
    present: sorted.filter((m) => presentIds.has(m.id)),
    others: sorted.filter((m) => !presentIds.has(m.id)),
  };
}

// ---------------------------------------------------------------------------
// Bons des Abends (Liste „Heute“, Storno, Umbuchen)
// ---------------------------------------------------------------------------

export interface SaleLineSummary extends BookedLine {
  /** davon schon storniert */
  reversed: number;
  /** noch stornierbar */
  remaining: number;
}

export interface SaleSummary {
  sale: ThekeSale & { pending?: boolean };
  lines: SaleLineSummary[];
  /** aktueller Betrag nach Stornos */
  totalCents: number;
  status: "booked" | "partly-reversed" | "reversed";
  /** Begründungen der Stornos zu diesem Bon */
  reasons: string[];
}

/** Bons (ohne Storno-Bons) mit dem, was davon noch übrig ist – neueste zuerst. */
export function summarizeSales(sales: readonly (ThekeSale & { pending?: boolean })[]): SaleSummary[] {
  const reversalsBySale = new Map<string, ThekeSale[]>();
  for (const s of sales) {
    if (s.kind === "reversal" && s.reversesSaleId) {
      reversalsBySale.set(s.reversesSaleId, [...(reversalsBySale.get(s.reversesSaleId) ?? []), s]);
    }
  }
  return sales
    .filter((s) => s.kind === "sale")
    .map((sale) => {
      const reversals = reversalsBySale.get(sale.id) ?? [];
      const reversed = reversedQuantities(reversals.flatMap((r) => r.lines));
      const lines = sale.lines.map((l) => {
        const r = reversed.get(l.id) ?? 0;
        return { ...l, reversed: r, remaining: l.quantity - r };
      });
      const totalCents = lines.reduce((sum, l) => sum + l.remaining * l.unitPriceCents, 0);
      const anyReversed = lines.some((l) => l.reversed > 0);
      const allReversed = lines.every((l) => l.remaining === 0);
      return {
        sale,
        lines,
        totalCents,
        status: allReversed ? "reversed" : anyReversed ? "partly-reversed" : "booked",
        reasons: reversals.map((r) => r.reason ?? "").filter(Boolean),
      } satisfies SaleSummary;
    })
    .reverse();
}

// ---------------------------------------------------------------------------
// Zahlungen des Abends
// ---------------------------------------------------------------------------

export interface PaymentSummary {
  payment: ThekePayment & { pending?: boolean };
  /** Storno dazu (falls storniert) */
  reversal: (ThekePayment & { pending?: boolean }) | null;
}

/** Zahlungen (ohne Storno-Zeilen) mit ihrem Storno, neueste zuerst. */
export function summarizePayments(payments: readonly (ThekePayment & { pending?: boolean })[]): PaymentSummary[] {
  const reversals = new Map(payments.filter((p) => p.reversesPaymentId).map((p) => [p.reversesPaymentId!, p]));
  return payments
    .filter((p) => !p.reversesPaymentId)
    .map((payment) => ({ payment, reversal: reversals.get(payment.id) ?? null }))
    .reverse();
}

/** Hat das Mitglied heute bezahlt (und nicht storniert)? Für die Markierung „beglichen“. */
export function paidToday(view: Pick<ThekeView, "todayPayments">, memberId: string): boolean {
  return summarizePayments(view.todayPayments).some((p) => p.payment.memberId === memberId && !p.reversal);
}

// ---------------------------------------------------------------------------
// „Auf dem Deckel“: offene Posten eines Mitglieds (wie der Bierdeckel auf dem Handy)
// ---------------------------------------------------------------------------

export interface DeckelItem {
  articleName: string;
  quantity: number;
  totalCents: number;
  isGuest: boolean;
}

export interface MemberDeckel {
  /** neuester Abend zuerst */
  evenings: { businessDate: string; items: DeckelItem[] }[];
  /** davon schon bezahlt (Teilzahlungen) */
  paidCents: number;
}

/**
 * Was steht gerade auf dem Deckel? Alles seit dem letzten Mal, an dem das Konto beglichen war –
 * Posten früherer Abende (vom Server) plus die Bons und Zahlungen von heute (inkl. noch nicht gesendeter).
 * Stornos werden verrechnet, gleiche Artikel je Abend zusammengefasst.
 */
export function memberDeckel(
  snapshot: Pick<ThekeSnapshot, "carried" | "businessDate">,
  view: Pick<ThekeView, "todaySales" | "todayPayments" | "membersById">,
  memberId: string,
): MemberDeckel {
  const dateOf = new Map<string, string>();
  const entries: AccountEntry[] = [];
  const carried = snapshot.carried?.[memberId];
  if (carried) {
    carried.lines.forEach((l, i) => {
      const id = `carried:${i}`;
      dateOf.set(id, l.businessDate);
      entries.push({ ...l, kind: "line", id, at: new Date(l.at), articleId: "" });
    });
    if (carried.paidCents > 0) {
      // Teilzahlungen gehören zu genau diesen Posten: direkt nach dem letzten einordnen
      const last = Math.max(...carried.lines.map((l) => Date.parse(l.at)));
      entries.push({ kind: "payment", id: "carried:paid", at: new Date(last + 1), methodId: "", amountCents: carried.paidCents, tipCents: 0 });
    }
  }
  for (const s of view.todaySales) {
    if (s.memberId !== memberId) continue;
    for (const l of s.lines) {
      dateOf.set(l.id, snapshot.businessDate);
      entries.push({ ...l, kind: "line", at: new Date(s.createdAt) });
    }
  }
  for (const p of view.todayPayments) {
    if (p.memberId === memberId) entries.push({ kind: "payment", id: p.id, at: new Date(p.createdAt), methodId: p.methodId, amountCents: p.amountCents, tipCents: p.tipCents });
  }

  const open = openLines(entries);
  const byDate = new Map<string, Map<string, DeckelItem>>();
  for (const l of open) {
    const date = dateOf.get(l.id) ?? snapshot.businessDate;
    const items = byDate.get(date) ?? new Map<string, DeckelItem>();
    byDate.set(date, items);
    const key = `${l.articleName}|${l.unitPriceCents}|${l.isGuest}`;
    const item = items.get(key) ?? { articleName: l.articleName, quantity: 0, totalCents: 0, isGuest: l.isGuest };
    item.quantity += l.quantity;
    item.totalCents += l.totalCents;
    items.set(key, item);
  }
  const evenings = [...byDate.entries()]
    .map(([businessDate, items]) => ({ businessDate, items: [...items.values()].filter((i) => i.quantity > 0) }))
    .filter((e) => e.items.length > 0)
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  const linesCents = open.reduce((sum, l) => sum + l.totalCents, 0);
  const openCents = view.membersById.get(memberId)?.openCents ?? 0;
  return { evenings, paidCents: evenings.length ? Math.max(0, linesCents - openCents) : 0 };
}
