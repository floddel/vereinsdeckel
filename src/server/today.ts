import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { article, settings } from "@/db/schema";
import { businessDate } from "@/domain/business-date";
import { getStockOverview } from "./stock";

export interface SpecialRow {
  id: string;
  name: string;
  priceCents: number;
  description: string | null;
  icon: string;
  orderable: boolean;
  offeredToday: boolean;
}

export interface TipSuggestion {
  id: string;
  name: string;
  /** reicht noch ca. so viele Abende; null = zuletzt nichts verkauft */
  reach: number | null;
}

/** Für die Seite „Heute“: selbst Gekochtes, Tipp des Hauses und Vorschläge gegen Ladenhüter. */
export async function getTodayAdmin(db: Db, now = new Date()) {
  const [[s], specials, articles, stock] = await Promise.all([
    db
      .select({ cutoffHour: settings.businessDayCutoffHour, tipArticleId: settings.tipArticleId, tipText: settings.tipText })
      .from(settings)
      .where(eq(settings.id, 1)),
    db
      .select({
        id: article.id,
        name: article.name,
        priceCents: article.priceCents,
        description: article.description,
        icon: article.icon,
        orderable: article.orderable,
        offeredOn: article.offeredOn,
        active: article.active,
      })
      .from(article)
      .where(eq(article.dailySpecial, true))
      .orderBy(asc(article.name)),
    db
      .select({ id: article.id, name: article.name, available: article.available })
      .from(article)
      .where(and(eq(article.active, true), eq(article.dailySpecial, false)))
      .orderBy(asc(article.name)),
    getStockOverview(db),
  ]);
  const today = businessDate(now, s?.cutoffHour ?? 6);
  // Ladenhüter zuerst: nie verkauft, dann die längste Reichweite – nur, was gerade verfügbar ist
  const unavailable = new Set(articles.filter((a) => !a.available).map((a) => a.id));
  const suggestions: TipSuggestion[] = stock.rows
    .filter((r) => r.stock > 0 && !unavailable.has(r.articleId))
    .sort((a, b) => (a.reach === null ? -1 : b.reach === null ? 1 : b.reach - a.reach))
    .slice(0, 5)
    .map((r) => ({ id: r.articleId, name: r.name, reach: r.reach }));
  return {
    today,
    specials: specials.map(({ offeredOn, active, ...x }): SpecialRow => ({ ...x, offeredToday: active && offeredOn === today })),
    tip: { articleId: s?.tipArticleId ?? null, text: s?.tipText ?? null },
    tipOptions: articles.map(({ id, name }) => ({ id, name })),
    suggestions,
  };
}
