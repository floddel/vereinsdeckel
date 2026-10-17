"use server";

import { APIError } from "better-auth/api";
import { getSessionCookie } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "@/lib/z";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import {
  authSecret,
  hashPin,
  isValidPin,
  PIN_LOCK_COOKIE,
  PIN_UNLOCK_MINUTES,
  pinCookieName,
  pinCookieOptions,
  pinLockCookieOptions,
  signPinCookie,
} from "@/lib/pin";
import { safeNextPath } from "@/lib/safe-next";
import { clearAttempts, failedAttemptText, lockTime, reserveAttempt } from "./attempt-lock";
import { adminExists, getAuth } from "./auth";
import { isSecureRequest, unlockPinForNewSession } from "./pin-carry";
import { checkPinWithLockout } from "./pin-check";
import { hit } from "./rate-limit";
import { setupCodeMatches } from "./setup-code";
import { requireAdmin } from "./session";

export type FormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
      /** Eingaben zurück ans Formular, damit sie nach einem Fehler stehen bleiben. */
      values?: Record<string, string>;
    }
  | undefined;

const setupSchema = z
  .object({
    name: z.string().trim().min(2, "Bitte einen Namen eingeben"),
    email: z.email("Bitte eine gültige E-Mail-Adresse eingeben"),
    password: z.string().min(10, "Mindestens 10 Zeichen"),
    password2: z.string(),
    pin: z.string().refine(isValidPin, "4 bis 8 Ziffern"),
    pin2: z.string(),
  })
  .refine((d) => d.password === d.password2, { path: ["password2"], message: "Passwörter stimmen nicht überein" })
  .refine((d) => d.pin === d.pin2, { path: ["pin2"], message: "PINs stimmen nicht überein" });

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

/** Ersteinrichtung: Admin-Konto + PIN. Nur möglich, solange es noch kein Konto gibt. */
export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (await adminExists()) redirect("/login");
  const values = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") };
  // Erst der Einrichtungs-Code (gebremst gegen Durchprobieren), dann alles andere
  if (!hit("setup-code", 10, 15 * 60_000).ok) return { error: "Zu viele Versuche – bitte in 15 Minuten noch einmal.", values };
  if (!setupCodeMatches(String(formData.get("setupCode") ?? ""))) {
    return { fieldErrors: { setupCode: "Einrichtungs-Code stimmt nicht" }, values };
  }
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const { name, email, password, pin } = parsed.data;

  try {
    await getAuth().api.signUpEmail({ body: { name, email, password }, headers: await headers() });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Konto konnte nicht angelegt werden", values };
  }
  await getDb().update(settings).set({ pinHash: hashPin(pin), updatedAt: new Date() }).where(eq(settings.id, 1));
  // Weiter mit dem Einrichtungsassistenten (die PIN wurde eben gewählt – nicht gleich nochmal fragen)
  await unlockPinForNewSession();
  redirect("/verwaltung/einrichtung");
}

/** Anmelden – mit Sperre nach zu vielen Fehlversuchen (Schutz gegen Passwort-Raten). */
export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const db = getDb();
  const slot = await reserveAttempt(db, "login", Date.now());
  if (!slot.ok) {
    return { error: `Zu viele Fehlversuche – Anmeldung gesperrt bis ${lockTime(slot.lockedUntil)} Uhr`, values: { email } };
  }
  let result: Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["signInEmail"]>>;
  try {
    result = await getAuth().api.signInEmail({ body: { email, password, rememberMe: true }, headers: await headers() });
  } catch {
    return { error: failedAttemptText("E-Mail oder Passwort ist falsch", slot), values: { email } };
  }
  const next = safeNextPath(formData.get("next"), "/theke");
  // Zweiter Faktor eingeschaltet: Passwort stimmt, jetzt noch der Code aus der App.
  // Der Fehlversuch-Zähler wird erst nach dem Code zurückgesetzt.
  if ("twoFactorRedirect" in result && result.twoFactorRedirect) redirect(`/login/code?next=${encodeURIComponent(next)}`);
  await clearAttempts(db, "login");
  redirect(next);
}

/** Zweiter Schritt der Anmeldung: Code aus der Authenticator-App oder ein Notfall-Code. */
export async function verifyCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!code) return { fieldErrors: { code: "Bitte den Code eingeben" } };
  try {
    if (/^\d{6}$/.test(code)) await getAuth().api.verifyTOTP({ body: { code }, headers: await headers() });
    // Notfall-Codes bestehen nur aus Kleinbuchstaben und Ziffern – Großschreibung vom Abtippen egal
    else await getAuth().api.verifyBackupCode({ body: { code: code.toLowerCase() }, headers: await headers() });
  } catch (e) {
    return { error: twoFactorError(e) };
  }
  await clearAttempts(getDb(), "login");
  redirect(safeNextPath(formData.get("next"), "/theke"));
}

function twoFactorError(e: unknown): string {
  const code = e instanceof APIError ? (e.body as { code?: string } | undefined)?.code : undefined;
  if (code === "INVALID_CODE" || code === "INVALID_BACKUP_CODE") return "Code stimmt nicht";
  if (code === "ACCOUNT_TEMPORARILY_LOCKED") return "Zu viele falsche Codes – bitte in 15 Minuten noch einmal.";
  return "Die Anmeldung ist abgelaufen – bitte noch einmal mit Passwort anmelden.";
}

export async function logoutAction(): Promise<void> {
  const sessionCookie = getSessionCookie(await headers());
  await getAuth().api.signOut({ headers: await headers() });
  if (sessionCookie) (await cookies()).delete(pinCookieName(sessionCookie));
  redirect("/login");
}

/** Verwaltung mit PIN entsperren (mit Sperre nach zu vielen Fehlversuchen). */
export async function unlockAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const check = await checkPinWithLockout(String(formData.get("pin") ?? ""));
  if (!check.ok) return { error: check.error };

  const now = Date.now();
  const sessionCookie = getSessionCookie(await headers());
  if (!sessionCookie) redirect("/login");
  (await cookies()).set(
    pinCookieName(sessionCookie),
    signPinCookie(sessionCookie, now, now + PIN_UNLOCK_MINUTES * 60_000, authSecret()),
    pinCookieOptions(await isSecureRequest()),
  );
  redirect(safeNextPath(formData.get("next"), "/verwaltung"));
}

/** Verwaltung sofort wieder sperren (Theke bleibt angemeldet). */
export async function lockAction(): Promise<void> {
  const jar = await cookies();
  const sessionCookie = getSessionCookie(await headers());
  if (sessionCookie) jar.delete(pinCookieName(sessionCookie));
  // Auch Freigaben ungültig machen, die eine vorgeladene Seite gleich noch verlängert.
  jar.set(PIN_LOCK_COOKIE, String(Date.now()), pinLockCookieOptions(await isSecureRequest()));
  redirect("/theke");
}
