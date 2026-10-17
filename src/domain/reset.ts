/**
 * Daten zurücksetzen (nur in der Testphase): Was angehakt ist, und was deshalb mit weg muss.
 * Die Abhängigkeiten folgen den Verweisen in der Datenbank – ein Bon ohne Mitglied oder
 * eine Inventurzeile ohne Artikel kann es so nicht geben.
 */
export const RESET_AREAS = ["buchungen", "kasse", "einkaeufe", "inventuren", "mitglieder", "artikel"] as const;
export type ResetArea = (typeof RESET_AREAS)[number];

/** Was zusätzlich gelöscht werden muss, wenn ein Bereich gelöscht wird */
export const RESET_REQUIRES: Record<ResetArea, readonly ResetArea[]> = {
  buchungen: [],
  kasse: [],
  einkaeufe: [],
  inventuren: [],
  // Bons, Zahlungen und Handy-Bestellungen gehören zu Mitgliedern
  mitglieder: ["buchungen"],
  // Bons, Einkäufe und Inventuren verweisen auf Artikel
  artikel: ["buchungen", "einkaeufe", "inventuren"],
};

export interface ResetPlan {
  areas: ResetArea[];
  /** Anfangsbestand (Einkäufe „Anfangsbestand“) behalten – geht nicht, wenn die Artikel gelöscht werden */
  keepOpening: boolean;
}

/** Ausgewählte Bereiche samt allem, was dafür nötig ist (in fester Reihenfolge). */
export function planReset(selected: readonly ResetArea[], keepOpening: boolean): ResetPlan {
  const set = new Set<ResetArea>();
  const add = (a: ResetArea) => {
    if (set.has(a)) return;
    set.add(a);
    RESET_REQUIRES[a].forEach(add);
  };
  selected.forEach(add);
  return { areas: RESET_AREAS.filter((a) => set.has(a)), keepOpening: keepOpening && !set.has("artikel") };
}

/** Warum ist ein Bereich zwangsweise dabei? (für die Anzeige: „nötig für Mitglieder“) */
export function requiredBy(area: ResetArea, selected: readonly ResetArea[]): ResetArea | null {
  return selected.find((s) => s !== area && planReset([s], false).areas.includes(area)) ?? null;
}

export function isResetArea(v: unknown): v is ResetArea {
  return typeof v === "string" && (RESET_AREAS as readonly string[]).includes(v);
}

export const RESET_LABELS: Record<ResetArea, { title: string; text: string }> = {
  buchungen: { title: "Buchungen", text: "Bons, Zahlungen, Trinkgeld, Handy-Bestellungen und alle Abende" },
  kasse: { title: "Kasse", text: "Einlagen, Entnahmen, Umbuchungen und Kassenzählungen (Handkasse und PayPal)" },
  einkaeufe: { title: "Einkäufe", text: "samt Belegfotos und Auslagen" },
  inventuren: { title: "Inventuren", text: "alle Zählungen" },
  mitglieder: { title: "Mitglieder", text: "samt Links – ausgedruckte QR-Karten gelten danach nicht mehr" },
  artikel: { title: "Artikel", text: "samt Preisen und Symbolen (die Kategorien bleiben)" },
};

/** „2 Buchungen, 1 Mitglieder“ → für die Rückmeldung nach dem Löschen */
export function describeDeleted(deleted: Partial<Record<ResetArea, number>>): string {
  const parts = RESET_AREAS.filter((a) => deleted[a] !== undefined).map((a) => `${RESET_LABELS[a].title}: ${deleted[a]}`);
  return parts.length ? `Gelöscht – ${parts.join(", ")}` : "Nichts gelöscht";
}

/** Muss zum Bestätigen eingetippt werden */
export const RESET_CONFIRM_WORD = "LÖSCHEN";
