import { z } from "@/lib/z";

/**
 * Handy-Bestellungen (Essen). Eine Bestellung ist noch keine Buchung:
 * Gebucht (immer angeschrieben) wird erst, wenn das Essen an der Theke abgeholt wird.
 *
 * Ablauf: new (eingegangen) → accepted (wird zubereitet) → ready (fertig) → picked_up (abgeholt)
 * Daneben: rejected (von der Theke abgelehnt) · cancelled (vom Mitglied zurückgezogen, nur solange „new“)
 */

export type FoodOrderStatus = "new" | "accepted" | "ready" | "picked_up" | "rejected" | "cancelled";

/** Bestellungen, um die sich die Theke noch kümmern muss. */
export const OPEN_STATUSES = ["new", "accepted", "ready"] as const satisfies readonly FoodOrderStatus[];
export const isOpenStatus = (s: FoodOrderStatus) => (OPEN_STATUSES as readonly string[]).includes(s);

/** Höchstmenge je Position und je Bestellung (Schutz vor Unfug über den Link). */
export const MAX_ORDER_LINE_QTY = 10;
export const MAX_ORDER_ITEMS = 10;
/** Höchstens so viele offene Bestellungen je Mitglied gleichzeitig. */
export const MAX_OPEN_ORDERS = 2;
/** Höchstens so viele Bestellungen je Mitglied und Abend (auch zurückgezogene zählen). */
export const MAX_ORDERS_PER_EVENING = 15;
export const MAX_NOTE_LENGTH = 200;
/** Abgeschlossene Bestellungen werden danach gelöscht (Datensparsamkeit; die Buchung bleibt). */
export const ORDER_RETENTION_DAYS = 30;

export const REJECT_REASONS = ["Ist leider aus", "Küche ist zu", "Bitte vorne bestellen"] as const;

/** Was das Mitglied per Handy schickt. Preise kommen nie vom Handy. */
export const memberOrderSchema = z
  .object({
    lines: z
      .array(z.object({ articleId: z.uuid(), quantity: z.number().int().min(1).max(MAX_ORDER_LINE_QTY) }))
      .min(1)
      .max(MAX_ORDER_ITEMS),
    note: z
      .string()
      .trim()
      .max(MAX_NOTE_LENGTH)
      .optional()
      .transform((v) => v || null),
  })
  .refine((o) => new Set(o.lines.map((l) => l.articleId)).size === o.lines.length, "Artikel doppelt")
  .refine((o) => o.lines.reduce((s, l) => s + l.quantity, 0) <= MAX_ORDER_ITEMS, `Höchstens ${MAX_ORDER_ITEMS} Stück je Bestellung`);
export type MemberOrderInput = z.output<typeof memberOrderSchema>;

/** Aktionen an der Theke (ohne „Abgeholt“ – das ist ein Bon im Postausgang). */
export type ThekeOrderAction = "accept" | "ready" | "reject";

export const thekeOrderActionSchema = z.discriminatedUnion("action", [
  z.object({ orderId: z.uuid(), action: z.literal("accept") }),
  z.object({ orderId: z.uuid(), action: z.literal("ready") }),
  z.object({ orderId: z.uuid(), action: z.literal("reject"), reason: z.string().trim().min(1).max(100) }),
]);

/**
 * Neuer Status nach einer Aktion – oder eine deutsche Fehlermeldung.
 * Großzügig, wo es an der Theke hilft (z. B. gleich „Fertig“ ohne vorher „Annehmen“).
 * Gleiche Aktion zweimal (z. B. zwei Tablets) ist kein Fehler.
 */
export function nextStatus(
  from: FoodOrderStatus,
  action: ThekeOrderAction | "cancel" | "pickup",
): { ok: true; status: FoodOrderStatus } | { ok: false; message: string } {
  const to: FoodOrderStatus = (
    { accept: "accepted", ready: "ready", reject: "rejected", cancel: "cancelled", pickup: "picked_up" } as const
  )[action];
  if (from === to) return { ok: true, status: to };
  const allowed: Record<typeof action, readonly FoodOrderStatus[]> = {
    accept: ["new"],
    ready: ["new", "accepted"],
    reject: ["new", "accepted", "ready"],
    pickup: ["new", "accepted", "ready"],
    cancel: ["new"],
  };
  if (allowed[action].includes(from)) return { ok: true, status: to };
  const why: Record<FoodOrderStatus, string> = {
    new: "Bestellung ist noch nicht angenommen",
    accepted: "Bestellung wird schon zubereitet",
    ready: "Bestellung ist schon fertig",
    picked_up: "Bestellung wurde schon abgeholt",
    rejected: "Bestellung wurde abgelehnt",
    cancelled: "Bestellung wurde zurückgezogen",
  };
  return { ok: false, message: why[from] };
}

/** Text für das Handy des Mitglieds. */
export function memberStatusText(o: { status: FoodOrderStatus; seen: boolean; rejectReason: string | null }): {
  title: string;
  detail: string;
} {
  switch (o.status) {
    case "new":
      return o.seen
        ? { title: "Eingegangen", detail: "Die Theke hat deine Bestellung." }
        : { title: "Gesendet", detail: "Noch nicht an der Theke angekommen – falls es dauert, sag vorne Bescheid." };
    case "accepted":
      return { title: "Wird zubereitet", detail: "Wir sagen Bescheid, wenn es fertig ist." };
    case "ready":
      return { title: "Fertig – bitte abholen!", detail: "Dein Essen wartet an der Theke." };
    case "picked_up":
      return { title: "Abgeholt", detail: "Steht auf deinem Bierdeckel. Guten Appetit!" };
    case "rejected":
      return { title: "Abgelehnt", detail: o.rejectReason ?? "Bitte vorne nachfragen." };
    case "cancelled":
      return { title: "Zurückgezogen", detail: "Die Bestellung kostet nichts." };
  }
}

/** Fortschritt für die Anzeige (0–3), abgelehnt/zurückgezogen = -1. */
export function statusStep(s: FoodOrderStatus): number {
  return { new: 0, accepted: 1, ready: 2, picked_up: 3, rejected: -1, cancelled: -1 }[s];
}
