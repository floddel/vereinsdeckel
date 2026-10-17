"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "@/lib/z";
import { getDb } from "@/db/client";
import { businessDate } from "@/domain/business-date";
import { isPlausiblePurchaseDate, purchaseInputSchema } from "@/domain/purchase";
import { detectImageType, MAX_IMAGE_BYTES } from "@/lib/image";
import { inArray } from "drizzle-orm";
import { article } from "@/db/schema";
import { aliasFromLine } from "@/domain/receipt-recognition";
import { createPurchase, reversePurchase } from "./purchases";
import { learnAliases, recognizeReceipt, type RecognitionResult } from "./receipt-recognition";
import { requireVerwaltung } from "./session";

export type PurchaseActionResult = { ok: false; error: string } | undefined;

/**
 * Einkauf speichern. Formular: „data“ (JSON mit Datum, Quelle, Notiz, Positionen) und optional
 * „receipt“ (Belegfoto, im Browser verkleinert). Danach zur Einkaufsliste.
 */
export async function savePurchaseAction(formData: FormData): Promise<PurchaseActionResult> {
  await requireVerwaltung();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("data") ?? ""));
  } catch {
    return { ok: false, error: "Ungültige Eingabe" };
  }
  const parsed = purchaseInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen" };
  if (!isPlausiblePurchaseDate(parsed.data.purchasedOn, businessDate(new Date(), 0))) {
    return { ok: false, error: "Das Datum liegt in der Zukunft" };
  }

  let receipt = null;
  const upload = formData.get("receipt");
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > MAX_IMAGE_BYTES) return { ok: false, error: "Das Foto ist zu groß" };
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const mimeType = detectImageType(bytes);
    if (!mimeType) return { ok: false, error: "Beleg bitte als Foto (JPEG, PNG oder WebP)" };
    receipt = { mimeType, bytes };
  }

  const db = getDb();
  const result = await createPurchase(db, parsed.data, receipt);
  if (!result.ok) return result;
  await learnFromPurchase(db, raw);
  revalidatePath("/verwaltung/einkaeufe");
  redirect("/verwaltung/einkaeufe");
}

/** Einkauf stornieren (Begründung Pflicht). */
export async function reversePurchaseAction(id: string, reason: string): Promise<PurchaseActionResult> {
  await requireVerwaltung();
  const r = z.string().trim().min(1).max(200).safeParse(reason);
  if (!z.uuid().safeParse(id).success || !r.success) return { ok: false, error: "Bitte eine Begründung angeben" };
  const result = await reversePurchase(getDb(), id, r.data);
  if (!result.ok) return result;
  revalidatePath("/verwaltung/einkaeufe");
  revalidatePath(`/verwaltung/einkaeufe/${id}`);
}

const learnSchema = z
  .array(
    z.object({
      receiptText: z.string().trim().min(1).max(120),
      receiptQty: z.number().int().min(1).max(10_000),
      articleId: z.uuid().nullable(),
      quantity: z.number().int().min(1).max(100_000),
      bottleMl: z.number().int().min(1).max(50_000).nullable(),
    }),
  )
  .max(80);

/** Vom Bon erkannte und bestätigte Zeilen als Zuordnung „Bon-Text → Artikel“ merken. */
async function learnFromPurchase(db: ReturnType<typeof getDb>, raw: unknown) {
  const parsed = learnSchema.safeParse((raw as { learn?: unknown })?.learn ?? []);
  if (!parsed.success || parsed.data.length === 0) return;
  const ids = [...new Set(parsed.data.map((l) => l.articleId).filter((x): x is string => !!x))];
  if (ids.length === 0) return;
  const served = new Map(
    (await db.select({ id: article.id, servingMl: article.servingMl }).from(article).where(inArray(article.id, ids))).map((a) => [a.id, !!a.servingMl]),
  );
  const aliases = parsed.data
    .filter((l) => l.articleId && served.has(l.articleId))
    .map((l) => aliasFromLine({ ...l, served: served.get(l.articleId!)! }))
    .filter((a): a is NonNullable<typeof a> => !!a);
  await learnAliases(db, aliases);
}

/** Foto eines Kassenbons erkennen lassen (nur wenn eingeschaltet). Liefert Vorschläge fürs Formular. */
export async function recognizeReceiptAction(formData: FormData): Promise<RecognitionResult> {
  await requireVerwaltung();
  const upload = formData.get("image");
  if (!(upload instanceof File) || upload.size === 0) return { ok: false, error: "Bitte ein Foto wählen" };
  if (upload.size > MAX_IMAGE_BYTES) return { ok: false, error: "Das Foto ist zu groß" };
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const mimeType = detectImageType(bytes);
  if (!mimeType) return { ok: false, error: "Bitte ein Foto (JPEG, PNG oder WebP)" };
  return recognizeReceipt(getDb(), { mimeType, base64: Buffer.from(bytes).toString("base64") });
}
