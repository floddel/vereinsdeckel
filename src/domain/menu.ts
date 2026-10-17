import { stockRef } from "./stock";

/** Symbole für selbst Gekochtes („Heute frisch gekocht“) */
export const SPECIAL_ICONS = ["soup", "sausage", "drumstick", "fish", "sandwich", "burger", "pizza", "cake", "other"] as const;

/** Ab wie wenig Stück die Karte „nur noch …“ zeigt. */
export const FEW_LEFT = 3;

export interface MenuItem {
  id: string;
  name: string;
  icon: string;
  priceCents: number;
  /** Beschreibung für Gäste (nicht die interne Notiz) */
  description: string | null;
  /** wie viele noch verkauft werden können; null = unbegrenzt (ohne Bestandsführung) */
  left: number | null;
}

export interface MenuSection {
  id: string;
  title: string;
  items: MenuItem[];
}

export interface MenuContent {
  /** „Heute frisch gekocht“ – nur, was für heute eingeschaltet ist */
  specials: MenuItem[];
  /** „Tipp des Hauses“ – nur, wenn der Artikel heute da ist */
  tip: { item: MenuItem; text: string | null } | null;
  sections: MenuSection[];
}

export interface MenuArticleRow {
  id: string;
  name: string;
  icon: string;
  categoryId: string;
  priceCents: number;
  description: string | null;
  servingMl: number | null;
  stockArticleId: string | null;
  dailySpecial: boolean;
  offeredOn: string | null;
}

/** Gruppen für Gäste – nach dem Symbol des Artikels (die Kategorien sind dafür zu grob). */
const GROUPS: { id: string; title: string; icons: string[] }[] = [
  { id: "bier", title: "Bier", icons: ["beer", "wheat-beer"] },
  { id: "wein", title: "Wein & Sekt", icons: ["wine", "cocktail"] },
  { id: "schnaps", title: "Schnaps & Likör", icons: ["shot"] },
  { id: "alkoholfrei", title: "Ohne Alkohol", icons: ["soda", "water", "milk", "coffee"] },
];
/** Eintritt und Spenden gehören nicht auf die Karte. */
const HIDDEN_ICONS = new Set(["ticket", "gift"]);

/**
 * Die Karte aus den aktiven Artikeln (in Reihenfolge) und dem Bestand: nur, was da ist.
 * Selbst gekochtes nur an dem Abend, für den es eingeschaltet ist (`today` = Geschäftstag).
 */
export function buildMenu(
  rows: readonly MenuArticleRow[],
  stock: Readonly<Record<string, number>>,
  today: string,
  tip: { articleId: string | null; text: string | null },
): MenuContent {
  const sections: MenuSection[] = [
    ...GROUPS.map((g) => ({ id: g.id, title: g.title, items: [] as MenuItem[] })),
    { id: "essen", title: "Essen", items: [] },
    { id: "sonstiges", title: "Sonstiges", items: [] },
  ];
  const byId = new Map(sections.map((x) => [x.id, x]));
  const specials: MenuItem[] = [];
  const all = new Map<string, MenuItem>();

  for (const a of rows) {
    if (HIDDEN_ICONS.has(a.icon)) continue;
    if (a.dailySpecial && a.offeredOn !== today) continue;
    const ref = stockRef({ id: a.id, servingMl: a.servingMl, stockArticleId: a.stockArticleId }, stock);
    const left = ref ? Math.max(Math.floor((stock[ref.pool] ?? 0) / ref.perUnit), 0) : null;
    if (left === 0) continue; // nur zeigen, was da ist
    const item: MenuItem = { id: a.id, name: a.name, icon: a.icon, priceCents: a.priceCents, description: a.description, left };
    all.set(a.id, item);
    if (a.dailySpecial) {
      specials.push(item);
      continue;
    }
    const group = a.categoryId === "essen" ? "essen" : (GROUPS.find((g) => g.icons.includes(a.icon))?.id ?? "sonstiges");
    byId.get(group)!.items.push(item);
  }
  const tipItem = tip.articleId ? all.get(tip.articleId) : undefined;
  return {
    specials,
    tip: tipItem ? { item: tipItem, text: tip.text } : null,
    sections: sections.filter((x) => x.items.length > 0),
  };
}
