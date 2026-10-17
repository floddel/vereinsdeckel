import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "@/lib/z";
import type { Db } from "@/db/client";
import { article, category, event, inventoryCount, inventoryLine, purchase, purchaseLine, sale, saleLine, settings } from "@/db/schema";
import {
  type ArticleUnit,
  averagePerEvening,
  averageUnitCost,
  inventoryDifference,
  isServed,
  needsRestock,
  reachEvenings,
  soldPerEvening,
  type StockInputs,
  stockLevel,
  stockValueCents,
  toBase,
} from "@/domain/stock";

export interface StockRow extends ArticleUnit {
  articleId: string;
  name: string;
  /** Notiz für die Verwaltung (z. B. welche Marken dazugehören) */
  note: string | null;
  categoryName: string;
  /** Bestand in Stück bzw. bei Ausschank in ml */
  stock: number;
  /** Ø Verkauf je Abend (letzte 10 Abende mit Verkauf) */
  avgPerEvening: number | null;
  /** reicht noch ca. X Abende (null = keine Verkäufe bekannt) */
  reach: number | null;
  restock: boolean;
  /** Warenwert zum Ø Einkaufspreis (null = kein Einkaufspreis bekannt) */
  valueCents: number | null;
}

export interface StockOverview {
  rows: StockRow[];
  /** Summe aller bekannten Warenwerte */
  valueCents: number;
  /** Artikel mit Bestand, aber ohne bekannten Einkaufspreis */
  unpricedCount: number;
  thresholdEvenings: number;
  lastInventoryAt: Date | null;
}

/**
 * Alle Vorgänge in der Bestandseinheit des jeweiligen Artikels (Stück bzw. ml bei Ausschank).
 * Artikel mit „Bestand aus“ (z. B. ganze Flasche) werden dem anderen Artikel zugerechnet.
 * `sold` zählt Portionen bzw. Stück je Abend (für Ø und Reichweite).
 */
async function loadStockInputs(db: Db): Promise<{
  inputs: StockInputs;
  sold: Map<string, number[]>;
  units: Map<string, ArticleUnit>;
  unitCost: Map<string, number | null>;
}> {
  const [units, links, purchases, sales, counts, lines] = await Promise.all([
    db
      .select({ id: article.id, servingMl: article.servingMl, bottleMl: article.bottleMl, packSize: article.packSize })
      .from(article)
      .then((rows) => new Map(rows.map(({ id, ...u }) => [id, u]))),
    db
      .select({ id: article.id, to: article.stockArticleId })
      .from(article)
      .where(isNotNull(article.stockArticleId))
      .then((rows) => new Map(rows.map((r) => [r.id, r.to!]))),
    db
      .select({
        articleId: purchaseLine.articleId,
        quantity: purchaseLine.quantity,
        bottleMl: purchaseLine.bottleMl,
        totalCents: purchaseLine.totalCents,
        at: purchase.createdAt,
      })
      .from(purchaseLine)
      .innerJoin(purchase, eq(purchase.id, purchaseLine.purchaseId))
      .where(isNotNull(purchaseLine.articleId)),
    db
      .select({ articleId: saleLine.articleId, quantity: saleLine.quantity, at: sale.createdAt, businessDate: event.businessDate })
      .from(saleLine)
      .innerJoin(sale, eq(sale.id, saleLine.saleId))
      .innerJoin(event, eq(event.id, sale.eventId)),
    db.select().from(inventoryCount).orderBy(asc(inventoryCount.countedAt)),
    db.select().from(inventoryLine),
  ]);
  const linesByCount = Map.groupBy(lines, (l) => l.inventoryCountId);
  const unit = (id: string): ArticleUnit => units.get(id) ?? { servingMl: null, bottleMl: null, packSize: null };
  // „Bestand aus“ nur zwischen Ausschank-Artikeln (beide in ml)
  const stockOf = (id: string): string => {
    const to = links.get(id);
    return to && isServed(unit(id)) && isServed(unit(to)) ? to : id;
  };
  const basePurchases = purchases.map((p) => ({
    articleId: stockOf(p.articleId!),
    quantity: toBase.purchase(unit(p.articleId!), p.quantity, p.bottleMl),
    totalCents: p.totalCents,
    at: p.at,
  }));
  const baseSales = sales.map((x) => ({ ...x, articleId: stockOf(x.articleId), quantity: toBase.sale(unit(x.articleId), x.quantity) }));
  const unitCost = new Map([...Map.groupBy(basePurchases, (p) => p.articleId)].map(([id, rows]) => [id, averageUnitCost(rows)]));
  return {
    inputs: {
      purchases: basePurchases,
      sales: baseSales,
      inventories: counts.map((c) => ({
        at: c.countedAt,
        lines: (linesByCount.get(c.id) ?? []).map((l) => ({ articleId: l.articleId, countedQty: toBase.inventory(unit(l.articleId), l.countedQty, l.inMl) })),
      })),
    },
    // Portionen bzw. Stück des Bestandsartikels
    sold: soldPerEvening(baseSales.map((x) => ({ ...x, quantity: isServed(unit(x.articleId)) ? x.quantity / unit(x.articleId).servingMl! : x.quantity }))),
    units,
    unitCost,
  };
}

/** Bestand aller Artikel mit Bestandsführung (aktiv), mit Reichweite und Nachkauf-Hinweis. */
export async function getStockOverview(db: Db): Promise<StockOverview> {
  const [[s], articles, stockInputs] = await Promise.all([
    db.select({ low: settings.lowStockEvenings }).from(settings),
    db
      .select({ id: article.id, name: article.name, note: article.note, categoryName: category.name, servingMl: article.servingMl, bottleMl: article.bottleMl, packSize: article.packSize })
      .from(article)
      .innerJoin(category, eq(category.id, article.categoryId))
      .where(and(eq(article.active, true), eq(article.trackStock, true), isNull(article.stockArticleId)))
      .orderBy(asc(category.sortOrder), asc(article.sortOrder), asc(article.name)),
    loadStockInputs(db),
  ]);
  const { inputs, sold, unitCost } = stockInputs;
  const thresholdEvenings = s?.low ?? 2;
  const rows = articles.map((a) => {
    const stock = stockLevel(a.id, inputs);
    const perEvening = sold.get(a.id) ?? [];
    // Reichweite in Portionen bzw. Stück
    const units = isServed(a) ? Math.floor(stock / a.servingMl!) : stock;
    const reach = reachEvenings(units, perEvening);
    return {
      articleId: a.id,
      name: a.name,
      note: a.note,
      categoryName: a.categoryName,
      servingMl: a.servingMl,
      bottleMl: a.bottleMl,
      packSize: a.packSize,
      stock,
      avgPerEvening: averagePerEvening(perEvening),
      reach,
      restock: needsRestock(reach, units, thresholdEvenings),
      valueCents: stockValueCents(stock, unitCost.get(a.id) ?? null),
    };
  });
  const last = inputs.inventories.at(-1)?.at ?? null;
  return {
    rows,
    thresholdEvenings,
    lastInventoryAt: last,
    valueCents: rows.reduce((sum, r) => sum + (r.valueCents ?? 0), 0),
    unpricedCount: rows.filter((r) => r.valueCents === null && r.stock > 0).length,
  };
}

/**
 * Einkaufspreis je verkaufter Einheit (Cent, ungerundet) für alle Artikel – für Wareneinsatz und Gewinn.
 * Stück: Ø Preis je Stück; Ausschank: Ø Preis je ml × Portion; „Bestand aus“: Preis des anderen Artikels.
 */
export async function getSaleUnitCosts(db: Db): Promise<Map<string, number | null>> {
  const [{ unitCost, units }, rows] = await Promise.all([
    loadStockInputs(db),
    db.select({ id: article.id, servingMl: article.servingMl, stockArticleId: article.stockArticleId }).from(article),
  ]);
  return new Map(
    rows.map((a) => {
      const pool = a.stockArticleId && a.servingMl && units.get(a.stockArticleId)?.servingMl ? a.stockArticleId : a.id;
      const perBase = unitCost.get(pool) ?? null;
      return [a.id, perBase === null ? null : perBase * (a.servingMl ?? 1)];
    }),
  );
}

export const inventoryInputSchema = z.object({
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
  lines: z
    // Stück bzw. ml bei Ausschank-Artikeln
    .array(z.object({ articleId: z.uuid(), countedQty: z.number().int().min(0).max(1_000_000) }))
    .min(1, "Bitte mindestens einen Artikel zählen")
    .max(500),
});
export type InventoryInput = z.output<typeof inventoryInputSchema>;

/** Inventur: gezählter Bestand ersetzt den berechneten, Differenzen bleiben protokolliert. */
export async function recordInventory(db: Db, input: InventoryInput, now = new Date()): Promise<{ id: string; differences: number }> {
  const { inputs, units } = await loadStockInputs(db);
  return db.transaction(async (tx) => {
    const ids = input.lines.map((l) => l.articleId);
    const known = await tx.select({ id: article.id }).from(article).where(inArray(article.id, ids));
    if (known.length !== new Set(ids).size) throw new Error("Artikel nicht gefunden");
    const [c] = await tx.insert(inventoryCount).values({ countedAt: now, note: input.note }).returning({ id: inventoryCount.id });
    const rows = input.lines.map((l) => {
      const expectedQty = stockLevel(l.articleId, inputs, now);
      // Ausschank-Artikel werden in ml gezählt (volle + angebrochene Flaschen, im Browser umgerechnet)
      const inMl = isServed(units.get(l.articleId) ?? { servingMl: null, bottleMl: null, packSize: null });
      return { inventoryCountId: c.id, articleId: l.articleId, countedQty: l.countedQty, expectedQty, differenceQty: inventoryDifference(l.countedQty, expectedQty), inMl };
    });
    await tx.insert(inventoryLine).values(rows);
    return { id: c.id, differences: rows.filter((r) => r.differenceQty !== 0).length };
  });
}

export async function listInventories(db: Db, limit = 10) {
  const counts = await db.select().from(inventoryCount).orderBy(desc(inventoryCount.countedAt)).limit(limit);
  if (counts.length === 0) return [];
  const lines = await db
    .select({ line: inventoryLine, name: article.name })
    .from(inventoryLine)
    .innerJoin(article, eq(article.id, inventoryLine.articleId))
    .where(inArray(inventoryLine.inventoryCountId, counts.map((c) => c.id)));
  const byCount = Map.groupBy(lines, (l) => l.line.inventoryCountId);
  return counts.map((c) => ({
    ...c,
    lines: (byCount.get(c.id) ?? []).map((l) => ({ name: l.name, ...l.line })).sort((a, b) => a.name.localeCompare(b.name, "de")),
  }));
}
