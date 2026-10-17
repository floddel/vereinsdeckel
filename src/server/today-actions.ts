"use server";

import { and, eq, max } from "drizzle-orm";
import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import { article, settings } from "@/db/schema";
import { businessDate } from "@/domain/business-date";
import { SPECIAL_ICONS } from "@/domain/menu";
import { type ActionResult, checkbox, zodFieldErrors } from "@/lib/form-utils";
import { parseEuroToCents } from "@/lib/money";
import { z } from "@/lib/z";
import { invalidatePublicMenu } from "./menu";
import { requireVerwaltung } from "./session";

async function today(): Promise<string> {
  const [s] = await getDb().select({ cutoffHour: settings.businessDayCutoffHour }).from(settings).where(eq(settings.id, 1));
  return businessDate(new Date(), s?.cutoffHour ?? 6);
}

/** Selbst Gekochtes für heute an- oder ausschalten (gilt bis zum Ende des Abends). */
export async function offerSpecialTodayAction(articleId: string, on: boolean): Promise<ActionResult> {
  await requireVerwaltung();
  if (!z.uuid().safeParse(articleId).success) return { ok: false, error: "Unbekanntes Gericht" };
  const updated = await getDb()
    .update(article)
    .set({ offeredOn: on ? await today() : null, ...(on ? { active: true } : {}), updatedAt: new Date() })
    .where(and(eq(article.id, articleId), eq(article.dailySpecial, true)))
    .returning({ name: article.name });
  if (updated.length === 0) return { ok: false, error: "Unbekanntes Gericht" };
  invalidatePublicMenu();
  refresh();
  return { ok: true, message: on ? `${updated[0].name} gibt es heute` : `${updated[0].name} ist für heute raus` };
}

const specialSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  name: z.string().trim().min(1, "Bitte einen Namen eingeben").max(40, "Höchstens 40 Zeichen"),
  price: z
    .string()
    .transform((v) => parseEuroToCents(v))
    .refine((v): v is number => v !== null && v > 0 && v <= 100_00, "Bitte einen Preis eingeben, z. B. 4,50"),
  description: z
    .string()
    .trim()
    .max(100, "Höchstens 100 Zeichen")
    .transform((v) => v || null),
  icon: z.enum(SPECIAL_ICONS),
});

/** Selbst gekochtes Gericht anlegen oder ändern (Name, Preis, Beschreibung) – optional gleich für heute anbieten. */
export async function saveSpecialAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await requireVerwaltung();
  const parsed = specialSchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name") ?? "",
    price: formData.get("price") ?? "",
    description: formData.get("description") ?? "",
    icon: formData.get("icon") ?? "soup",
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const { id, name, price, description, icon } = parsed.data;
  const db = getDb();
  const values = { name, priceCents: price, description, icon, orderable: checkbox(formData, "orderable"), updatedAt: new Date() };
  if (id) {
    const updated = await db
      .update(article)
      .set(values)
      .where(and(eq(article.id, id), eq(article.dailySpecial, true)))
      .returning({ id: article.id });
    if (updated.length === 0) return { ok: false, error: "Unbekanntes Gericht" };
  } else {
    const [{ last }] = await db.select({ last: max(article.sortOrder) }).from(article).where(eq(article.categoryId, "essen"));
    await db.insert(article).values({
      ...values,
      categoryId: "essen",
      // Selbst gekocht: kein Einkauf, kein Bestand – nur an einzelnen Tagen
      trackStock: false,
      dailySpecial: true,
      offeredOn: checkbox(formData, "today") ? await today() : null,
      sortOrder: (last ?? 0) + 1,
    });
  }
  invalidatePublicMenu();
  refresh();
  return { ok: true, message: id ? "Gespeichert" : `${name} angelegt` };
}

const tipSchema = z.object({
  articleId: z.union([z.uuid(), z.literal("")]),
  text: z
    .string()
    .trim()
    .max(80, "Höchstens 80 Zeichen")
    .transform((v) => v || null),
});

/** „Tipp des Hauses“ setzen oder entfernen (leere Auswahl). */
export async function saveTipAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await requireVerwaltung();
  const parsed = tipSchema.safeParse({ articleId: formData.get("articleId") ?? "", text: formData.get("text") ?? "" });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const { articleId, text } = parsed.data;
  const db = getDb();
  if (articleId) {
    const [a] = await db.select({ id: article.id }).from(article).where(and(eq(article.id, articleId), eq(article.active, true)));
    if (!a) return { ok: false, fieldErrors: { articleId: "Unbekannter Artikel" } };
  }
  await db
    .update(settings)
    .set({ tipArticleId: articleId || null, tipText: articleId ? text : null, updatedAt: new Date() })
    .where(eq(settings.id, 1));
  invalidatePublicMenu();
  refresh();
  return { ok: true, message: articleId ? "Tipp des Hauses gespeichert" : "Kein Tipp mehr auf der Karte" };
}
