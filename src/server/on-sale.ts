import { and, eq, or } from "drizzle-orm";
import { article } from "@/db/schema";

/**
 * Heute im Verkauf: alle verfügbaren normalen Artikel, selbst gekochte („Heute frisch gekocht“) nur an dem
 * Abend, für den sie eingeschaltet wurden. `today` = Geschäftstag (businessDate).
 */
export const onSale = (today: string) =>
  and(eq(article.available, true), or(eq(article.dailySpecial, false), eq(article.offeredOn, today)));
