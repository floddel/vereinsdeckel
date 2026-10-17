import { openBalanceCents, openLines } from "./account";
import { groupTally } from "./tally";
import type { AccountEntry, LineEntry, PaymentEntry } from "./types";

/**
 * Mitgliederansicht: Was steht auf dem Bierdeckel, wie viele Deckel braucht es,
 * und welche Kassenzettel gab es an den Abenden?
 */

export interface CoasterGroup {
  key: string;
  label: string;
  icon: string;
  count: number;
  /** davon für Gäste */
  guests: number;
}

/** Striche je Zeile auf dem runden Deckel (3 Fünferblöcke) und Zeilen je Deckel. */
export const STROKES_PER_ROW = 15;
export const ROWS_PER_COASTER = 4;

const rowsFor = (count: number) => Math.max(1, Math.ceil(count / STROKES_PER_ROW));

/**
 * Verteilt die Strich-Gruppen auf Deckel: Ein Deckel hat Platz für `maxRows` Zeilen.
 * Auf dem letzten Deckel steht zusätzlich die Summe – dort ist eine Zeile weniger Platz.
 * Eine sehr große Gruppe (z. B. 40 Bier) wird über mehrere Deckel fortgesetzt.
 */
export function splitCoasters(groups: readonly CoasterGroup[], maxRows = ROWS_PER_COASTER): CoasterGroup[][] {
  const coasters: CoasterGroup[][] = [[]];
  let used = 0;
  for (const g of groups) {
    let left = g.count;
    let guestsLeft = g.guests;
    while (left > 0) {
      if (used >= maxRows) {
        coasters.push([]);
        used = 0;
      }
      const n = Math.min(left, (maxRows - used) * STROKES_PER_ROW);
      // Gäste zuletzt verteilen (die Zahl steht beim letzten Teil der Gruppe)
      const guests = Math.max(0, guestsLeft - (left - n));
      coasters[coasters.length - 1].push({ ...g, count: n, guests });
      guestsLeft -= guests;
      used += rowsFor(n);
      left -= n;
    }
  }
  // Letzter Deckel randvoll? Dann wandert seine letzte Zeile auf einen neuen Deckel (für die Summe).
  const last = coasters[coasters.length - 1];
  if (last.reduce((s, g) => s + rowsFor(g.count), 0) >= maxRows) {
    const g = last.pop()!;
    const keep = (rowsFor(g.count) - 1) * STROKES_PER_ROW;
    const moved = g.count - keep;
    const movedGuests = Math.min(g.guests, moved);
    if (keep > 0) last.push({ ...g, count: keep, guests: g.guests - movedGuests });
    coasters.push([{ ...g, count: moved, guests: movedGuests }]);
  }
  return coasters;
}

export type CoasterStatus = "empty" | "open" | "settled";

export interface CoasterState {
  openCents: number;
  status: CoasterStatus;
  coasters: CoasterGroup[][];
  /** Anzahl Striche insgesamt (für die Animation neuer Striche) */
  strokes: number;
}

/** Aktueller Deckel aus allen Positionen und Zahlungen eines Mitglieds. */
export function coasterState(entries: readonly AccountEntry[]): CoasterState {
  const openCents = openBalanceCents(entries);
  const groups = groupTally(openLines(entries)).map((g) => ({
    key: g.key,
    label: g.label,
    icon: g.icon,
    count: g.count,
    guests: g.guestCount,
  }));
  const status: CoasterStatus = groups.length > 0 && openCents > 0 ? "open" : entries.length > 0 ? "settled" : "empty";
  return {
    openCents,
    status,
    coasters: status === "open" ? splitCoasters(groups) : [],
    strokes: groups.reduce((s, g) => s + g.count, 0),
  };
}

// ---------------------------------------------------------------------------
// Kassenzettel je Abend
// ---------------------------------------------------------------------------

export interface ReceiptLine {
  articleName: string;
  quantity: number;
  totalCents: number;
  isGuest: boolean;
  /** Storno-Position (negative Menge) */
  reversal: boolean;
  reason: string | null;
}

export interface ReceiptPayment {
  methodId: string;
  amountCents: number;
  tipCents: number;
  cashGivenCents: number | null;
  reversal: boolean;
  reason: string | null;
}

export interface Receipt {
  businessDate: string;
  title: string | null;
  /** erster und letzter Vorgang des Abends */
  from: string;
  to: string;
  lines: ReceiptLine[];
  payments: ReceiptPayment[];
  totalCents: number;
  paidCents: number;
  tipCents: number;
  /** offener Betrag nach diesem Abend (alle Abende bis einschließlich diesem) */
  openAfterCents: number;
}

export interface EventEntries {
  businessDate: string;
  title: string | null;
  lines: (LineEntry & { reason?: string | null })[];
  payments: (PaymentEntry & { cashGivenCents?: number | null; reason?: string | null })[];
}

/**
 * Kassenzettel je Abend, neuester zuerst. `events` müssen alle Abende des Mitglieds enthalten
 * (für den offenen Betrag danach), werden hier aber nicht verändert.
 */
export function buildReceipts(events: readonly EventEntries[]): Receipt[] {
  const sorted = [...events].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  let running = 0;
  const receipts: Receipt[] = [];
  for (const e of sorted) {
    if (e.lines.length === 0 && e.payments.length === 0) continue;
    const totalCents = e.lines.reduce((s, l) => s + l.totalCents, 0);
    const paidCents = e.payments.reduce((s, p) => s + p.amountCents, 0);
    const tipCents = e.payments.reduce((s, p) => s + p.tipCents, 0);
    running += totalCents - paidCents;
    const times = [...e.lines.map((l) => l.at.getTime()), ...e.payments.map((p) => p.at.getTime())];
    receipts.push({
      businessDate: e.businessDate,
      title: e.title,
      from: new Date(Math.min(...times)).toISOString(),
      to: new Date(Math.max(...times)).toISOString(),
      lines: e.lines.map((l) => ({
        articleName: l.articleName,
        quantity: l.quantity,
        totalCents: l.totalCents,
        isGuest: l.isGuest,
        reversal: l.quantity < 0,
        reason: l.reason ?? null,
      })),
      payments: e.payments.map((p) => ({
        methodId: p.methodId,
        amountCents: p.amountCents,
        tipCents: p.tipCents,
        cashGivenCents: p.cashGivenCents ?? null,
        reversal: !!p.reversesPaymentId,
        reason: p.reason ?? null,
      })),
      totalCents,
      paidCents,
      tipCents,
      openAfterCents: running,
    });
  }
  return receipts.reverse();
}

/** Daten für den Live-Bierdeckel (Antwort von /api/m/[token]/stand). */
export interface MemberStand {
  clubName: string;
  logoUrl: string | null;
  memberName: string;
  paypalName: string | null;
  openCents: number;
  status: CoasterStatus;
  coasters: CoasterGroup[][];
  strokes: number;
  /** Küche offen und Essen per Handy bestellbar */
  kitchenOpen: boolean;
  /** am weitesten fortgeschrittene offene Handy-Bestellung des Abends */
  orderStatus: "new" | "accepted" | "ready" | null;
  /** ändert sich bei jeder Änderung (für ETag und Animation) */
  version: string;
}

// ---------------------------------------------------------------------------
// Persönliche Übersicht (nur für das Mitglied selbst – keine Ranglisten)
// ---------------------------------------------------------------------------

export interface MemberOverview {
  monthCents: number;
  yearCents: number;
  totalCents: number;
  evenings: number;
  eveningsThisYear: number;
  /** meistgebuchte Artikel (Stornos verrechnet) */
  favorites: { name: string; quantity: number }[];
}

/** Ausgaben nach Abenden (Geschäftstag) – `today` als "JJJJ-MM-TT". */
export function memberOverview(events: readonly EventEntries[], today: string): MemberOverview {
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const favorites = new Map<string, number>();
  let monthCents = 0;
  let yearCents = 0;
  let totalCents = 0;
  let evenings = 0;
  let eveningsThisYear = 0;
  for (const e of events) {
    const spent = e.lines.reduce((s, l) => s + l.totalCents, 0);
    totalCents += spent;
    if (e.businessDate.startsWith(month)) monthCents += spent;
    if (e.businessDate.startsWith(year)) yearCents += spent;
    if (e.lines.some((l) => l.quantity > 0)) {
      evenings++;
      if (e.businessDate.startsWith(year)) eveningsThisYear++;
    }
    for (const l of e.lines) favorites.set(l.articleName, (favorites.get(l.articleName) ?? 0) + l.quantity);
  }
  return {
    monthCents,
    yearCents,
    totalCents,
    evenings,
    eveningsThisYear,
    favorites: [...favorites.entries()]
      .filter(([, q]) => q > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"))
      .slice(0, 3)
      .map(([name, quantity]) => ({ name, quantity })),
  };
}
