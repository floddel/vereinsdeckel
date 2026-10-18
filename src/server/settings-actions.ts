"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "@/lib/z";
import { getDb } from "@/db/client";
import { file, settings } from "@/db/schema";
import { isAccent } from "@/lib/accent";
import { DEMO_DISABLED, isDemo } from "@/lib/demo";
import { type ActionResult, zodFieldErrors } from "@/lib/form-utils";
import { detectImageType, MAX_IMAGE_BYTES } from "@/lib/image";
import { parseEuroToCents } from "@/lib/money";
import { isValidPaypalName } from "@/lib/paypal";
import { hashPin, isValidPin } from "@/lib/pin";
import { checkApiKey, getAiSettings, sealApiKey } from "./anthropic";
import { checkPinWithLockout } from "./pin-check";
import { requireVerwaltung } from "./session";

const settingsSchema = z.object({
  clubName: z.string().trim().min(2, "Bitte den Vereinsnamen eingeben").max(60, "Höchstens 60 Zeichen"),
  paypalName: z
    .string()
    .trim()
    .transform((v) => v.replace(/^https?:\/\/(www\.)?paypal\.me\//i, "").replace(/\/.*$/, "") || null)
    .refine((v) => v === null || isValidPaypalName(v), "Nur Buchstaben und Ziffern, z. B. TSVMusterstadt"),
  warnLimit: z
    .string()
    .transform((v) => (v.trim() === "" ? 0 : parseEuroToCents(v)))
    .refine((v): v is number => v !== null && v >= 0 && v <= 100_000, "Bitte einen Betrag eingeben, z. B. 30"),
  cutoffHour: z.coerce.number().int().min(0).max(12),
  lowStockEvenings: z.coerce.number().int().min(1, "Mindestens 1").max(30, "Höchstens 30"),
});

export async function saveSettingsAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await requireVerwaltung();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;
  await getDb()
    .update(settings)
    .set({
      clubName: d.clubName,
      paypalName: d.paypalName,
      warnLimitCents: d.warnLimit,
      businessDayCutoffHour: d.cutoffHour,
      lowStockEvenings: d.lowStockEvenings,
      updatedAt: new Date(),
    })
    .where(eq(settings.id, 1));
  refresh();
  return { ok: true, message: "Einstellungen gespeichert" };
}

/** Vereinsfarbe für die ganze App (Theke, Verwaltung, Mitglieder). */
export async function saveAccentAction(accent: string): Promise<ActionResult> {
  await requireVerwaltung();
  if (!isAccent(accent)) return { ok: false, error: "Unbekannte Farbe" };
  await getDb().update(settings).set({ accent, updatedAt: new Date() }).where(eq(settings.id, 1));
  refresh();
  return { ok: true, message: "Vereinsfarbe gespeichert" };
}

export async function uploadLogoAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await requireVerwaltung();
  if (isDemo()) return { ok: false, error: DEMO_DISABLED };
  const upload = formData.get("logo");
  if (!(upload instanceof File) || upload.size === 0) return { ok: false, error: "Bitte ein Bild wählen" };
  if (upload.size > MAX_IMAGE_BYTES) return { ok: false, error: "Bild ist zu groß" };
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const mimeType = detectImageType(bytes);
  if (!mimeType) return { ok: false, error: "Nur PNG-, JPEG- oder WebP-Bilder" };

  const db = getDb();
  await db.transaction(async (tx) => {
    const [f] = await tx.insert(file).values({ mimeType, bytes }).returning({ id: file.id });
    const [old] = await tx.select({ logoFileId: settings.logoFileId }).from(settings).where(eq(settings.id, 1));
    await tx.update(settings).set({ logoFileId: f.id, updatedAt: new Date() }).where(eq(settings.id, 1));
    if (old?.logoFileId) await tx.delete(file).where(eq(file.id, old.logoFileId));
  });
  refresh();
  return { ok: true, message: "Logo gespeichert" };
}

export async function removeLogoAction(): Promise<void> {
  await requireVerwaltung();
  const db = getDb();
  await db.transaction(async (tx) => {
    const [old] = await tx.select({ logoFileId: settings.logoFileId }).from(settings).where(eq(settings.id, 1));
    await tx.update(settings).set({ logoFileId: null, updatedAt: new Date() }).where(eq(settings.id, 1));
    if (old?.logoFileId) await tx.delete(file).where(eq(file.id, old.logoFileId));
  });
  refresh();
}

export async function changePinAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await requireVerwaltung();
  if (isDemo()) return { ok: false, error: DEMO_DISABLED };
  const current = String(formData.get("currentPin") ?? "");
  const pin = String(formData.get("newPin") ?? "");
  const pin2 = String(formData.get("newPin2") ?? "");
  if (!isValidPin(pin)) return { ok: false, fieldErrors: { newPin: "4 bis 8 Ziffern" } };
  if (pin !== pin2) return { ok: false, fieldErrors: { newPin2: "PINs stimmen nicht überein" } };
  const check = await checkPinWithLockout(current);
  if (!check.ok) return { ok: false, fieldErrors: { currentPin: check.error } };
  await getDb().update(settings).set({ pinHash: hashPin(pin), updatedAt: new Date() }).where(eq(settings.id, 1));
  return { ok: true, message: "PIN geändert" };
}

// ---------------------------------------------------------------------------
// Kassenbon-Erkennung (KI)
// ---------------------------------------------------------------------------

const apiKeySchema = z
  .string()
  .trim()
  .min(20, "Das sieht nicht nach einem API-Schlüssel aus")
  .max(300)
  .regex(/^[A-Za-z0-9_-]+$/, "Der Schlüssel enthält ungültige Zeichen");

/** Ein-/Ausschalten. Einschalten nur mit Schlüssel (in der App oder als Umgebungsvariable). */
export async function setAiEnabledAction(enabled: boolean): Promise<ActionResult> {
  await requireVerwaltung();
  if (isDemo()) return { ok: false, error: DEMO_DISABLED };
  const db = getDb();
  if (enabled && !(await getAiSettings(db)).keyHint) return { ok: false, error: "Bitte zuerst einen API-Schlüssel hinterlegen" };
  await db.update(settings).set({ aiReceiptsEnabled: enabled, updatedAt: new Date() }).where(eq(settings.id, 1));
  refresh();
  return { ok: true, message: enabled ? "Kassenbon-Erkennung eingeschaltet" : "Kassenbon-Erkennung ausgeschaltet" };
}

/** Schlüssel prüfen und verschlüsselt speichern. Er wird danach nie wieder vollständig angezeigt. */
export async function saveApiKeyAction(key: string): Promise<ActionResult> {
  await requireVerwaltung();
  if (isDemo()) return { ok: false, error: DEMO_DISABLED };
  const parsed = apiKeySchema.safeParse(key);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const check = await checkApiKey(parsed.data);
  if (!check.ok) return { ok: false, error: check.error };
  await getDb().update(settings).set({ anthropicKeyEnc: sealApiKey(parsed.data), updatedAt: new Date() }).where(eq(settings.id, 1));
  refresh();
  return { ok: true, message: "Schlüssel geprüft und gespeichert" };
}

/** Schlüssel entfernen – schaltet die Erkennung aus, falls kein anderer Schlüssel da ist. */
export async function removeApiKeyAction(): Promise<ActionResult> {
  await requireVerwaltung();
  const db = getDb();
  await db.update(settings).set({ anthropicKeyEnc: null, updatedAt: new Date() }).where(eq(settings.id, 1));
  if (!(await getAiSettings(db)).keyHint) await db.update(settings).set({ aiReceiptsEnabled: false }).where(eq(settings.id, 1));
  refresh();
  return { ok: true, message: "Schlüssel entfernt" };
}
