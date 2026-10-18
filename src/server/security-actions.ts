"use server";

import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import { DEMO_DISABLED, isDemo } from "@/lib/demo";
import { qrSvg } from "@/lib/qr";
import { type ActionResult, zodFieldErrors } from "@/lib/form-utils";
import { z } from "@/lib/z";
import { getAuth } from "./auth";
import { signOutDevice, signOutOtherDevices } from "./devices";
import { carryPinUnlock, currentSessionCookie } from "./pin-carry";
import { requireVerwaltung } from "./session";

/** Ein anderes Gerät abmelden (z. B. das verlorene Tablet). */
export async function signOutDeviceAction(sessionId: string): Promise<ActionResult> {
  const { session } = await requireVerwaltung();
  if (typeof sessionId !== "string" || !(await signOutDevice(getDb(), sessionId, session.id))) {
    return { ok: false, error: "Gerät nicht gefunden" };
  }
  refresh();
  return { ok: true, message: "Gerät abgemeldet" };
}

/** Alle Geräte außer diesem abmelden. */
export async function signOutOtherDevicesAction(): Promise<ActionResult> {
  const { session } = await requireVerwaltung();
  const n = await signOutOtherDevices(getDb(), session.id);
  refresh();
  return { ok: true, message: n === 0 ? "Kein anderes Gerät angemeldet" : `${n} ${n === 1 ? "Gerät" : "Geräte"} abgemeldet` };
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Bitte das aktuelle Passwort eingeben"),
    newPassword: z.string().min(10, "Mindestens 10 Zeichen"),
    newPassword2: z.string(),
  })
  .refine((d) => d.newPassword === d.newPassword2, { path: ["newPassword2"], message: "Passwörter stimmen nicht überein" })
  .refine((d) => d.newPassword !== d.currentPassword, { path: ["newPassword"], message: "Das ist das bisherige Passwort" });

/** Passwort ändern – und dabei alle anderen Geräte abmelden (dieses bleibt angemeldet). */
export async function changePasswordAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { session } = await requireVerwaltung();
  if (isDemo()) return { ok: false, error: DEMO_DISABLED };
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await getAuth().api.changePassword({
      body: { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword, revokeOtherSessions: false },
      headers: await headers(),
    });
  } catch {
    return { ok: false, fieldErrors: { currentPassword: "Aktuelles Passwort stimmt nicht" } };
  }
  const n = await signOutOtherDevices(getDb(), session.id);
  refresh();
  return { ok: true, message: n > 0 ? `Passwort geändert – ${n} ${n === 1 ? "anderes Gerät" : "andere Geräte"} abgemeldet` : "Passwort geändert" };
}

// ---------------------------------------------------------------------------
// Zweiter Faktor (Authenticator-App)
// ---------------------------------------------------------------------------

const passwordError = (e: unknown) =>
  e instanceof APIError && (e.body as { code?: string } | undefined)?.code === "INVALID_PASSWORD" ? "Passwort stimmt nicht" : "Das hat nicht geklappt";

export type TwoFactorSetup =
  | { ok: true; qrSvg: string; secret: string; backupCodes: string[] }
  | { ok: false; error: string };

/**
 * Schritt 1: Geheimnis für die App erzeugen (noch nicht aktiv). Liefert den QR-Code zum Scannen,
 * das Geheimnis zum Abtippen und die Notfall-Codes. Aktiv wird es erst mit dem ersten richtigen Code.
 */
export async function startTwoFactorAction(password: string): Promise<TwoFactorSetup> {
  await requireVerwaltung();
  if (isDemo()) return { ok: false, error: DEMO_DISABLED };
  if (typeof password !== "string" || !password) return { ok: false, error: "Bitte das Passwort eingeben" };
  const [s] = await getDb().select({ clubName: settings.clubName }).from(settings).where(eq(settings.id, 1));
  try {
    const r = await getAuth().api.enableTwoFactor({
      body: { password, issuer: s?.clubName ? `${s.clubName} (Vereinsdeckel)` : "Vereinsdeckel" },
      headers: await headers(),
    });
    if (!("totpURI" in r) || !r.totpURI) return { ok: false, error: "Das hat nicht geklappt" };
    const secret = new URL(r.totpURI).searchParams.get("secret") ?? "";
    return { ok: true, qrSvg: await qrSvg(r.totpURI), secret, backupCodes: r.backupCodes ?? [] };
  } catch (e) {
    return { ok: false, error: passwordError(e) };
  }
}

/** Schritt 2: erster Code aus der App – danach ist der zweite Faktor eingeschaltet. */
export async function confirmTwoFactorAction(code: string): Promise<ActionResult> {
  await requireVerwaltung();
  const clean = typeof code === "string" ? code.replace(/\s+/g, "") : "";
  if (!/^\d{6}$/.test(clean)) return { ok: false, error: "Bitte den 6-stelligen Code aus der App eingeben" };
  const before = await currentSessionCookie();
  try {
    await getAuth().api.verifyTOTP({ body: { code: clean }, headers: await headers() });
  } catch {
    return { ok: false, error: "Code stimmt nicht – Uhrzeit am Handy prüfen und den aktuellen Code nehmen" };
  }
  // Kein refresh() hier: Better Auth hat die Anmeldung erneuert, diese Anfrage hat noch das alte
  // Login-Cookie. Die Seite lädt der Browser danach neu (mit dem neuen Cookie).
  await carryPinUnlock(before);
  return { ok: true, message: "Zweiter Faktor eingeschaltet" };
}

/** Ausschalten (mit Passwort). */
export async function disableTwoFactorAction(password: string): Promise<ActionResult> {
  await requireVerwaltung();
  if (typeof password !== "string" || !password) return { ok: false, error: "Bitte das Passwort eingeben" };
  const before = await currentSessionCookie();
  try {
    await getAuth().api.disableTwoFactor({ body: { password }, headers: await headers() });
  } catch (e) {
    return { ok: false, error: passwordError(e) };
  }
  await carryPinUnlock(before); // Seite lädt der Browser neu (siehe confirmTwoFactorAction)
  return { ok: true, message: "Zweiter Faktor ausgeschaltet" };
}

/** Neue Notfall-Codes (die alten gelten dann nicht mehr). */
export async function newBackupCodesAction(password: string): Promise<{ ok: true; backupCodes: string[] } | { ok: false; error: string }> {
  await requireVerwaltung();
  if (typeof password !== "string" || !password) return { ok: false, error: "Bitte das Passwort eingeben" };
  try {
    const r = await getAuth().api.generateBackupCodes({ body: { password }, headers: await headers() });
    return { ok: true, backupCodes: r.backupCodes };
  } catch (e) {
    return { ok: false, error: passwordError(e) };
  }
}
