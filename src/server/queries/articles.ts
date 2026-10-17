import { asc, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { article, category } from "@/db/schema";

/** inUse: schon gebucht, eingekauft, gezählt oder bestellt → nicht löschbar (nur inaktiv setzen). */
export type ArticleRow = typeof article.$inferSelect & { inUse: boolean };
export type CategoryRow = typeof category.$inferSelect;

/** Alle Kategorien mit ihren Artikeln in Kachel-Reihenfolge. */
export async function getArticlesByCategory(): Promise<{ category: CategoryRow; articles: ArticleRow[] }[]> {
  const db = getDb();
  const [categories, articles] = await Promise.all([
    db.select().from(category).orderBy(asc(category.sortOrder)),
    db
      .select({
        article,
        // Tabellenname ausdrücklich: Drizzle lässt ihn bei Abfragen über nur eine Tabelle weg,
        // dann würde in den Unterabfragen die falsche Spalte „id“ verglichen.
        inUse: sql<boolean>`exists (select 1 from sale_line s where s.article_id = "article"."id")
          or exists (select 1 from purchase_line p where p.article_id = "article"."id")
          or exists (select 1 from inventory_line i where i.article_id = "article"."id")
          or exists (select 1 from food_order_line f where f.article_id = "article"."id")`,
      })
      .from(article)
      .orderBy(asc(article.sortOrder), asc(article.name))
      .then((rows) => rows.map((r) => ({ ...r.article, inUse: !!r.inUse }))),
  ]);
  return categories.map((c) => ({ category: c, articles: articles.filter((a) => a.categoryId === c.id) }));
}
