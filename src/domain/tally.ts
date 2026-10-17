import type { LineEntry } from "./types";

/**
 * Strichliste wie auf dem echten Bierdeckel: Fünferblöcke (4 Striche + Querstrich) plus Rest.
 * 7 → 1 Block + 2 Striche.
 */
export function tallyBlocks(count: number): { blocks: number; rest: number } {
  const n = Math.max(Math.trunc(count), 0);
  return { blocks: Math.floor(n / 5), rest: n % 5 };
}

export interface TallyGroup {
  key: string;
  label: string;
  icon: string;
  count: number;
  /** davon für Gäste */
  guestCount: number;
  totalCents: number;
}

/**
 * Fasst Positionen zu Strich-Gruppen zusammen (z. B. Pils + Radler → "Bier").
 * Stornos (negative Mengen) werden verrechnet; leere Gruppen fallen weg.
 * Reihenfolge: wie zuerst gebucht.
 */
export function groupTally(lines: readonly LineEntry[]): TallyGroup[] {
  const groups = new Map<string, TallyGroup>();
  for (const l of lines) {
    const label = l.tallyGroup?.trim() || l.articleName;
    const key = label.toLocaleLowerCase("de");
    let g = groups.get(key);
    if (!g) {
      g = { key, label, icon: l.icon ?? "other", count: 0, guestCount: 0, totalCents: 0 };
      groups.set(key, g);
    }
    g.count += l.quantity;
    if (l.isGuest) g.guestCount += l.quantity;
    g.totalCents += l.totalCents;
  }
  return [...groups.values()]
    .filter((g) => g.count > 0)
    .map((g) => ({ ...g, guestCount: Math.max(g.guestCount, 0) }));
}

/** Wie viele Bierdeckel nötig sind, wenn einer höchstens `maxStrokes` Striche fassen soll. */
export function coastersNeeded(groups: readonly TallyGroup[], maxStrokes = 60): number {
  const strokes = groups.reduce((sum, g) => sum + g.count, 0);
  return Math.max(1, Math.ceil(strokes / maxStrokes));
}
