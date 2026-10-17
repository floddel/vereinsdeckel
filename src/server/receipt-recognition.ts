import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { article, purchaseAlias } from "@/db/schema";
import {
  type Alias,
  buildPrompt,
  recognitionSchema,
  type RecognitionArticle,
  type Suggestion,
  TOOL_INPUT_SCHEMA,
  TOOL_NAME,
  toSuggestion,
} from "@/domain/receipt-recognition";
import { ANTHROPIC_BASE_URL, ANTHROPIC_MODEL, getActiveApiKey } from "./anthropic";

export type RecognitionResult = { ok: true; suggestion: Suggestion } | { ok: false; error: string };

async function loadContext(db: Db): Promise<{ articles: RecognitionArticle[]; aliases: Alias[] }> {
  const [articles, aliases] = await Promise.all([
    db
      .select({ id: article.id, name: article.name, servingMl: article.servingMl, bottleMl: article.bottleMl, packSize: article.packSize, note: article.note })
      .from(article)
      .where(and(eq(article.active, true), isNull(article.stockArticleId)))
      .orderBy(asc(article.name)),
    db
      .select({ text: purchaseAlias.text, articleId: purchaseAlias.articleId, unitsPerItem: purchaseAlias.unitsPerItem, bottleMl: purchaseAlias.bottleMl })
      .from(purchaseAlias),
  ]);
  return { articles, aliases };
}

/**
 * Foto eines Kassenbons (oder der Ware) von der KI lesen lassen.
 * Nur wenn die Funktion eingeschaltet ist; das Foto geht an Anthropic, sonst nichts Persönliches.
 */
export async function recognizeReceipt(db: Db, image: { mimeType: string; base64: string }): Promise<RecognitionResult> {
  const key = await getActiveApiKey(db);
  if (!key) return { ok: false, error: "Die Kassenbon-Erkennung ist ausgeschaltet (Einstellungen)." };
  const { articles, aliases } = await loadContext(db);

  let res: Response;
  try {
    res = await fetch(`${ANTHROPIC_BASE_URL()}/v1/messages`, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL(),
        max_tokens: 4096,
        tools: [{ name: TOOL_NAME, description: "Einkauf aus dem Kassenbon eintragen", input_schema: TOOL_INPUT_SCHEMA }],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } },
              { type: "text", text: buildPrompt(articles, aliases) },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    return { ok: false, error: "Anthropic ist gerade nicht erreichbar. Bitte später noch einmal oder von Hand eintragen." };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, error: "Der API-Schlüssel wird nicht mehr akzeptiert (Einstellungen prüfen)." };
  if (res.status === 429 || res.status === 529) return { ok: false, error: "Anthropic ist gerade überlastet. Bitte in einer Minute noch einmal." };
  if (!res.ok) return { ok: false, error: `Die Erkennung ist fehlgeschlagen (Fehler ${res.status}).` };

  const body = (await res.json().catch(() => null)) as { content?: { type: string; name?: string; input?: unknown }[] } | null;
  const call = body?.content?.find((c) => c.type === "tool_use" && c.name === TOOL_NAME);
  const parsed = recognitionSchema.safeParse(call?.input);
  if (!parsed.success) return { ok: false, error: "Der Bon konnte nicht gelesen werden. Bitte ein schärferes Foto versuchen." };
  if (parsed.data.positionen.length === 0) return { ok: false, error: "Auf dem Foto wurden keine Positionen erkannt." };
  return { ok: true, suggestion: toSuggestion(parsed.data, articles, aliases) };
}

/** Bestätigte Zuordnungen merken (neueste gewinnt). */
export async function learnAliases(db: Db, aliases: readonly Alias[]): Promise<void> {
  if (aliases.length === 0) return;
  await db
    .insert(purchaseAlias)
    .values(aliases.map((a) => ({ ...a, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: purchaseAlias.text,
      set: {
        articleId: sql`excluded.article_id`,
        unitsPerItem: sql`excluded.units_per_item`,
        bottleMl: sql`excluded.bottle_ml`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}
