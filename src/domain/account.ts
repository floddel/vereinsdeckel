import type { AccountEntry, LineEntry } from "./types";

/** Offener Betrag = Summe aller Positionen − Summe aller Zahlungen (ohne Trinkgeld). */
export function openBalanceCents(entries: readonly AccountEntry[]): number {
  let sum = 0;
  for (const e of entries) sum += e.kind === "line" ? e.totalCents : -e.amountCents;
  return sum;
}

/** Chronologisch; bei gleicher Zeit Positionen vor Zahlungen ("Sofort bezahlen"). */
export function sortEntries<T extends AccountEntry>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      a.at.getTime() - b.at.getTime() ||
      (a.kind === b.kind ? 0 : a.kind === "line" ? -1 : 1),
  );
}

/**
 * Positionen, die aktuell "auf dem Deckel" stehen: alles seit dem letzten Zeitpunkt,
 * an dem das Konto durch eine Zahlung beglichen war (offener Betrag ≤ 0).
 * Bei Teilzahlungen bleiben die Striche stehen, nur der Betrag sinkt.
 */
export function openLines(entries: readonly AccountEntry[]): LineEntry[] {
  let balance = 0;
  let collected: LineEntry[] = [];
  for (const e of sortEntries(entries)) {
    if (e.kind === "line") {
      balance += e.totalCents;
      collected.push(e);
    } else {
      balance -= e.amountCents;
      if (balance <= 0) collected = [];
    }
  }
  return collected;
}

export type AccountStatus = "settled" | "open" | "over-limit";

export function accountStatus(openCents: number, warnLimitCents: number): AccountStatus {
  if (openCents <= 0) return "settled";
  if (warnLimitCents > 0 && openCents >= warnLimitCents) return "over-limit";
  return "open";
}
