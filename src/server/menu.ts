import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { article, category, settings } from "@/db/schema";
import { businessDate } from "@/domain/business-date";
import { buildMenu, type MenuContent } from "@/domain/menu";
import { getStockOverview } from "./stock";

export interface Menu extends MenuContent {
  clubName: string;
  logoUrl: string | null;
  /** Geschäftstag, z. B. "2026-10-16" */
  today: string;
}

/** Was es gerade an der Theke gibt (öffentliche Karte). Keine persönlichen Daten. */
export async function getMenu(db: Db, now = new Date()): Promise<Menu> {
  const [[s], rows, stockOverview] = await Promise.all([
    db
      .select({
        clubName: settings.clubName,
        logoFileId: settings.logoFileId,
        cutoffHour: settings.businessDayCutoffHour,
        tipArticleId: settings.tipArticleId,
        tipText: settings.tipText,
      })
      .from(settings),
    db
      .select({
        id: article.id,
        name: article.name,
        icon: article.icon,
        categoryId: article.categoryId,
        priceCents: article.priceCents,
        description: article.description,
        servingMl: article.servingMl,
        stockArticleId: article.stockArticleId,
        dailySpecial: article.dailySpecial,
        offeredOn: article.offeredOn,
      })
      .from(article)
      .innerJoin(category, eq(article.categoryId, category.id))
      .where(and(eq(article.active, true), eq(article.available, true)))
      .orderBy(asc(category.sortOrder), asc(article.sortOrder), asc(article.name)),
    getStockOverview(db),
  ]);
  const today = businessDate(now, s?.cutoffHour ?? 6);
  const stock = Object.fromEntries(stockOverview.rows.map((r) => [r.articleId, r.stock]));
  return {
    clubName: s?.clubName ?? "Verein",
    logoUrl: s?.logoFileId ? `/api/datei/${s.logoFileId}` : null,
    today,
    ...buildMenu(rows, stock, today, { articleId: s?.tipArticleId ?? null, text: s?.tipText ?? null }),
  };
}

const globalForMenu = globalThis as unknown as { __vereinsdeckelMenu?: { at: number; menu: Menu } };

/**
 * Für die öffentliche Karte: höchstens alle 15 Sekunden neu berechnet. Viele Handys gleichzeitig
 * (oder jemand, der ständig neu lädt) belasten so die Datenbank nicht.
 */
export async function getPublicMenu(db: Db, now = Date.now()): Promise<Menu> {
  const cached = globalForMenu.__vereinsdeckelMenu;
  if (cached && now - cached.at < 15_000) return cached.menu;
  const menu = await getMenu(db, new Date(now));
  globalForMenu.__vereinsdeckelMenu = { at: now, menu };
  return menu;
}

/** Nach Änderungen in der Verwaltung: die Karte gleich neu berechnen (nicht erst nach 15 Sekunden). */
export function invalidatePublicMenu(): void {
  globalForMenu.__vereinsdeckelMenu = undefined;
}
