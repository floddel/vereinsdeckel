"use server";

import { and, asc, eq, max, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "@/lib/z";
import { ARTICLE_ICON_KEYS } from "@/components/article-icon";
import { getDb } from "@/db/client";
import { article, category, foodOrderLine, inventoryLine, purchaseLine, saleLine } from "@/db/schema";
import { type ActionResult, checkbox, zodFieldErrors } from "@/lib/form-utils";
import { parseEuroToCents } from "@/lib/money";
import { parseVolumeMl } from "@/domain/volume";
import { invalidatePublicMenu } from "./menu";
import { requireVerwaltung } from "./session";

const MAX_PRICE_CENTS = 100_00 * 10; // 1.000 €

const articleSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen eingeben").max(40, "Höchstens 40 Zeichen"),
  categoryId: z.string().min(1, "Bitte eine Kategorie wählen"),
  icon: z.string().refine((v) => ARTICLE_ICON_KEYS.includes(v), "Unbekanntes Symbol"),
  price: z
    .string()
    .transform((v) => parseEuroToCents(v))
    .refine((v): v is number => v !== null && v >= 0 && v <= MAX_PRICE_CENTS, "Bitte einen gültigen Preis eingeben, z. B. 2,50"),
  tallyGroup: z
    .string()
    .trim()
    .max(30, "Höchstens 30 Zeichen")
    .transform((v) => v || null),
  note: z
    .string()
    .trim()
    .max(300, "Höchstens 300 Zeichen")
    .transform((v) => v || null),
  description: z
    .string()
    .trim()
    .max(100, "Höchstens 100 Zeichen")
    .transform((v) => v || null),
});

function readArticleForm(formData: FormData) {
  return articleSchema.safeParse({
    name: formData.get("name") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    icon: formData.get("icon") ?? "other",
    price: formData.get("price") ?? "",
    tallyGroup: formData.get("tallyGroup") ?? "",
    note: formData.get("note") ?? "",
    description: formData.get("description") ?? "",
  });
}

/**
 * Verkauft als Stück (optional mit Kistengröße) oder als Ausschank (Portion + übliche Flaschengröße).
 * Liefert die Werte oder Fehlermeldungen je Feld.
 */
function readUnits(formData: FormData):
  | { ok: true; servingMl: number | null; bottleMl: number | null; packSize: number | null; stockArticleId: string | null }
  | { ok: false; fieldErrors: Record<string, string> } {
  if (formData.get("kind") === "ausschank") {
    const stockArticleId = String(formData.get("stockArticleId") ?? "") || null;
    const servingMl = parseVolumeMl(String(formData.get("serving") ?? ""));
    const bottleMl = parseVolumeMl(String(formData.get("bottle") ?? ""));
    const fieldErrors: Record<string, string> = {};
    if (!servingMl) fieldErrors.serving = "Bitte die Portion angeben, z. B. 4 cl oder 0,2 l";
    if (!bottleMl) fieldErrors.bottle = "Bitte die Flaschengröße angeben, z. B. 0,7 l";
    if (servingMl && bottleMl && servingMl > bottleMl) fieldErrors.serving = "Die Portion ist größer als die Flasche";
    if (stockArticleId && !z.uuid().safeParse(stockArticleId).success) fieldErrors.stockArticleId = "Unbekannter Artikel";
    return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true, servingMl, bottleMl, packSize: null, stockArticleId };
  }
  const raw = String(formData.get("packSize") ?? "").trim();
  if (!raw) return { ok: true, servingMl: null, bottleMl: null, packSize: null, stockArticleId: null };
  const packSize = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!(packSize >= 2 && packSize <= 1000)) return { ok: false, fieldErrors: { packSize: "Bitte eine Zahl zwischen 2 und 1000" } };
  return { ok: true, servingMl: null, bottleMl: null, packSize, stockArticleId: null };
}

/**
 * „Bestand aus“ prüfen: Der andere Artikel muss ein Ausschank-Artikel mit eigenem Bestand sein.
 * Umgekehrt darf ein Artikel, aus dessen Bestand andere ausschenken, selbst keinen „Bestand aus“ haben
 * und nicht auf Stück umgestellt werden.
 */
async function checkStockLink(id: string, servingMl: number | null, stockArticleId: string | null): Promise<string | null> {
  const db = getDb();
  if (id) {
    const users = await db.select({ name: article.name }).from(article).where(eq(article.stockArticleId, id));
    if (users.length > 0 && (stockArticleId || !servingMl)) {
      return `Aus diesem Bestand schenkt schon „${users.map((u) => u.name).join("“, „")}“ aus – er muss ein Ausschank-Artikel mit eigenem Bestand bleiben.`;
    }
  }
  if (!stockArticleId) return null;
  if (stockArticleId === id) return "Ein Artikel kann nicht aus seinem eigenen Bestand ausschenken.";
  const [target] = await db.select().from(article).where(eq(article.id, stockArticleId));
  if (!target) return "Unbekannter Artikel";
  if (!target.servingMl) return `„${target.name}“ ist kein Ausschank-Artikel.`;
  if (target.stockArticleId) return `„${target.name}“ schenkt selbst aus einem anderen Bestand aus.`;
  return null;
}

async function assertCategory(categoryId: string) {
  const [c] = await getDb().select().from(category).where(eq(category.id, categoryId));
  if (!c) throw new Error("Unbekannte Kategorie");
}

export async function saveArticleAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await requireVerwaltung();
  const parsed = readArticleForm(formData);
  const units = readUnits(formData);
  if (!parsed.success || !units.ok) {
    return { ok: false, fieldErrors: { ...(parsed.success ? {} : zodFieldErrors(parsed.error)), ...(units.ok ? {} : units.fieldErrors) } };
  }
  const { name, categoryId, icon, price, tallyGroup, note, description } = parsed.data;
  await assertCategory(categoryId);

  const db = getDb();
  const id = String(formData.get("id") ?? "");
  const linkError = await checkStockLink(id, units.servingMl, units.stockArticleId);
  if (linkError) return { ok: false, fieldErrors: { stockArticleId: linkError } };
  const values = {
    name,
    categoryId,
    icon,
    priceCents: price,
    tallyGroup,
    note,
    description,
    servingMl: units.servingMl,
    bottleMl: units.bottleMl,
    packSize: units.packSize,
    stockArticleId: units.stockArticleId,
    trackStock: checkbox(formData, "trackStock"),
    // Per Handy bestellbar ist nur Essen
    orderable: categoryId === "essen" && checkbox(formData, "orderable"),
    // Selbst gekocht: nur Essen; ohne Häkchen gilt es wieder jeden Tag (kein „heute“ mehr)
    dailySpecial: categoryId === "essen" && checkbox(formData, "dailySpecial"),
    // …und wird unter „Heute“ ein- und ausgeschaltet, nicht mit dem Schalter in der Liste (den hat es nicht)
    ...(categoryId === "essen" && checkbox(formData, "dailySpecial") ? { available: true } : { offeredOn: null }),
    active: checkbox(formData, "active"),
    updatedAt: new Date(),
  };

  if (id) {
    const [old] = await db.select().from(article).where(eq(article.id, id));
    if (!old) return { ok: false, error: "Artikel nicht gefunden" };
    // Neue Kategorie → ans Ende der neuen Kategorie
    const sortOrder = old.categoryId === categoryId ? old.sortOrder : await nextSortOrder(categoryId);
    await db.update(article).set({ ...values, sortOrder }).where(eq(article.id, id));
  } else {
    await db.insert(article).values({ ...values, sortOrder: await nextSortOrder(categoryId) });
  }
  invalidatePublicMenu();
  refresh();
  return { ok: true, message: `„${name}“ gespeichert` };
}

async function nextSortOrder(categoryId: string): Promise<number> {
  const [{ m }] = await getDb()
    .select({ m: max(article.sortOrder) })
    .from(article)
    .where(eq(article.categoryId, categoryId));
  return (m ?? 0) + 1;
}

/** Artikel innerhalb seiner Kategorie eine Position nach oben/unten schieben. */
export async function moveArticleAction(id: string, direction: "up" | "down"): Promise<void> {
  await requireVerwaltung();
  const db = getDb();
  const [a] = await db.select().from(article).where(eq(article.id, id));
  if (!a) return;
  const siblings = await db
    .select({ id: article.id })
    .from(article)
    .where(eq(article.categoryId, a.categoryId))
    .orderBy(asc(article.sortOrder), asc(article.name));
  const ids = siblings.map((s) => s.id);
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await writeOrder(a.categoryId, ids);
  invalidatePublicMenu();
  refresh();
}

/** Neue Reihenfolge einer Kategorie speichern (z. B. nach Ziehen mit der Maus). */
export async function reorderArticlesAction(categoryId: string, orderedIds: string[]): Promise<void> {
  await requireVerwaltung();
  await writeOrder(categoryId, orderedIds);
  invalidatePublicMenu();
  refresh();
}

async function writeOrder(categoryId: string, orderedIds: string[]) {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(article)
        .set({ sortOrder: index + 1 })
        .where(and(eq(article.id, id), eq(article.categoryId, categoryId)));
    }
  });
}

/**
 * Artikel endgültig löschen – nur, wenn er nie gebucht, eingekauft, gezählt oder bestellt wurde
 * (z. B. ein nicht benötigter Beispielartikel). Sonst: inaktiv setzen.
 */
export async function deleteArticleAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireVerwaltung();
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [a] = await tx.select({ id: article.id, name: article.name }).from(article).where(eq(article.id, id)).for("update");
    if (!a) return { ok: false as const, error: "Artikel nicht gefunden" };
    const used = await Promise.all(
      [saleLine, purchaseLine, inventoryLine, foodOrderLine].map((t) => tx.select({ id: t.id }).from(t).where(eq(t.articleId, id)).limit(1)),
    );
    const [linked] = await tx.select({ name: article.name }).from(article).where(and(eq(article.stockArticleId, id), ne(article.id, id))).limit(1);
    if (linked) return { ok: false as const, error: `Aus „${a.name}“ schenkt „${linked.name}“ aus. Bitte dort zuerst „Bestand aus“ entfernen.` };
    if (used.some((rows) => rows.length > 0)) {
      return { ok: false as const, error: `„${a.name}“ wurde schon verwendet und kann nur noch inaktiv gesetzt werden.` };
    }
    await tx.delete(article).where(eq(article.id, id));
    return { ok: true as const };
  });
  if (result.ok) refresh();
  return result;
}

/** Aktiv/inaktiv (inaktive Artikel erscheinen nicht an der Theke und nicht beim Bestellen). */
export async function setArticleActiveAction(id: string, active: boolean): Promise<void> {
  await requireVerwaltung();
  await getDb().update(article).set({ active, updatedAt: new Date() }).where(eq(article.id, id));
  invalidatePublicMenu();
  refresh();
}

/** Verfügbar ja/nein (Schalter in der Liste): nur Theke, Karte und Bestellen – Bestand und Einkauf bleiben. */
export async function setArticleAvailableAction(id: string, available: boolean): Promise<void> {
  await requireVerwaltung();
  await getDb()
    .update(article)
    .set({ available: available === true, updatedAt: new Date() })
    .where(eq(article.id, id));
  invalidatePublicMenu();
  refresh();
}
