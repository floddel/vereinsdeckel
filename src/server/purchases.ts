import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { article, file, purchase, purchaseLine } from "@/db/schema";
import type { ImageMime } from "@/lib/image";
import { planPurchaseReversal, type PurchaseInput, type PurchaseSource, purchaseTotal, REST_LINE, withReceiptRest } from "@/domain/purchase";

export interface PurchaseLineView {
  articleId: string | null;
  description: string;
  quantity: number;
  /** Ausschank: Größe je Flasche in ml */
  bottleMl: number | null;
  /** leer = Einzelpreis nicht bekannt */
  totalCents: number | null;
}

export interface PurchaseView {
  id: string;
  purchasedOn: string;
  source: PurchaseSource;
  note: string | null;
  receiptFileId: string | null;
  createdAt: Date;
  lines: PurchaseLineView[];
  totalCents: number;
  /** Storno-Einkauf: verweist auf den stornierten Einkauf */
  reversesPurchaseId: string | null;
  reason: string | null;
  /** Wurde dieser Einkauf storniert? (Begründung) */
  reversedReason: string | null;
}

/** Einkauf speichern – Belegfoto (schon im Browser verkleinert) optional. */
/** Wie PurchaseInput, aber Flaschengröße und Bon-Summe dürfen fehlen. */
export type NewPurchase = Omit<PurchaseInput, "lines" | "receiptTotalCents"> & {
  lines: (Omit<PurchaseInput["lines"][number], "bottleMl"> & { bottleMl?: number | null })[];
  receiptTotalCents?: number | null;
};

export async function createPurchase(
  db: Db,
  { receiptTotalCents = null, ...input }: NewPurchase,
  receipt: { mimeType: ImageMime; bytes: Uint8Array } | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const rest = withReceiptRest(input.lines, receiptTotalCents);
  if (!rest.ok) return rest;
  return db.transaction(async (tx) => {
    // Artikel-Namen ergänzen, wo keine Beschreibung eingegeben wurde
    const ids = [...new Set(input.lines.map((l) => l.articleId).filter((id): id is string => !!id))];
    const articles = new Map(
      ids.length
        ? (await tx.select({ id: article.id, name: article.name, servingMl: article.servingMl, bottleMl: article.bottleMl }).from(article).where(inArray(article.id, ids))).map((a) => [a.id, a])
        : [],
    );
    if (articles.size !== ids.length) throw new Error("Artikel nicht gefunden");
    // Ausschank-Artikel brauchen eine Flaschengröße (sonst die übliche des Artikels); Stückartikel nie
    const lines = input.lines.map((l) => {
      const a = l.articleId ? articles.get(l.articleId) : undefined;
      const bottleMl = a?.servingMl ? (l.bottleMl ?? a.bottleMl) : null;
      return { ...l, bottleMl, description: l.description || a?.name || "" };
    });
    const missing = lines.find((l) => l.articleId && articles.get(l.articleId)?.servingMl && !l.bottleMl);
    if (missing) return { ok: false as const, error: `${missing.description}: bitte die Flaschengröße angeben` };

    const receiptFileId = receipt
      ? (await tx.insert(file).values(receipt).returning({ id: file.id }))[0].id
      : null;
    const [p] = await tx
      .insert(purchase)
      .values({ purchasedOn: input.purchasedOn, source: input.source, note: input.note, receiptFileId })
      .returning({ id: purchase.id });
    await tx.insert(purchaseLine).values([
      ...lines.map((l) => ({
        purchaseId: p.id,
        articleId: l.articleId,
        description: l.description,
        quantity: l.quantity,
        bottleMl: l.bottleMl,
        totalCents: l.totalCents,
      })),
      ...(rest.rest > 0 ? [{ purchaseId: p.id, articleId: null, description: REST_LINE, quantity: 1, bottleMl: null, totalCents: rest.rest }] : []),
    ]);
    return { ok: true as const, id: p.id };
  });
}

/** Storno: neuer Einkauf mit negativen Positionen, gleiche Quelle, Begründung Pflicht. Nur einmal. */
export async function reversePurchase(db: Db, id: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return db.transaction(async (tx) => {
    const [original] = await tx.select().from(purchase).where(eq(purchase.id, id)).for("update");
    if (!original) return { ok: false, error: "Einkauf nicht gefunden" };
    if (original.reversesPurchaseId) return { ok: false, error: "Ein Storno kann nicht storniert werden" };
    const [already] = await tx.select({ id: purchase.id }).from(purchase).where(eq(purchase.reversesPurchaseId, id));
    if (already) return { ok: false, error: "Dieser Einkauf ist schon storniert" };

    const lines = await tx.select().from(purchaseLine).where(eq(purchaseLine.purchaseId, id));
    const [rev] = await tx
      .insert(purchase)
      .values({ purchasedOn: original.purchasedOn, source: original.source, reversesPurchaseId: id, reason })
      .returning({ id: purchase.id });
    await tx.insert(purchaseLine).values(planPurchaseReversal(lines).map((l) => ({ ...l, purchaseId: rev.id })));
    return { ok: true };
  });
}

/** Einkäufe, neueste zuerst (ohne die Storno-Einträge selbst; storniert wird am Original vermerkt). */
export async function listPurchases(db: Db, limit = 200): Promise<PurchaseView[]> {
  const rows = await db
    .select()
    .from(purchase)
    .where(isNull(purchase.reversesPurchaseId))
    .orderBy(desc(purchase.purchasedOn), desc(purchase.createdAt))
    .limit(limit);
  return withDetails(db, rows);
}

export async function getPurchase(db: Db, id: string): Promise<PurchaseView | null> {
  const [row] = await db.select().from(purchase).where(eq(purchase.id, id));
  return row ? (await withDetails(db, [row]))[0] : null;
}

async function withDetails(db: Db, rows: (typeof purchase.$inferSelect)[]): Promise<PurchaseView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [lines, reversals] = await Promise.all([
    db.select().from(purchaseLine).where(inArray(purchaseLine.purchaseId, ids)),
    db
      .select({ reversesPurchaseId: purchase.reversesPurchaseId, reason: purchase.reason })
      .from(purchase)
      .where(inArray(purchase.reversesPurchaseId, ids)),
  ]);
  const byPurchase = Map.groupBy(lines, (l) => l.purchaseId);
  const reversedReason = new Map(reversals.map((r) => [r.reversesPurchaseId!, r.reason]));
  return rows.map((r) => {
    const l = (byPurchase.get(r.id) ?? []).map(({ articleId, description, quantity, bottleMl, totalCents }) => ({ articleId, description, quantity, bottleMl, totalCents }));
    return {
      id: r.id,
      purchasedOn: r.purchasedOn,
      source: r.source,
      note: r.note,
      receiptFileId: r.receiptFileId,
      createdAt: r.createdAt,
      lines: l,
      totalCents: purchaseTotal(l),
      reversesPurchaseId: r.reversesPurchaseId,
      reason: r.reason,
      reversedReason: reversedReason.get(r.id) ?? null,
    };
  });
}

/** Belegfoto nur ausliefern, wenn es wirklich zu einem Einkauf gehört. */
export async function getReceiptFile(db: Db, fileId: string) {
  const [row] = await db
    .select({ mimeType: file.mimeType, bytes: file.bytes })
    .from(purchase)
    .innerJoin(file, eq(file.id, purchase.receiptFileId))
    .where(and(eq(purchase.receiptFileId, fileId)));
  return row ?? null;
}
