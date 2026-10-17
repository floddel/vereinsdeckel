import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";
import { PIN_LOCK_MINUTES, PIN_MAX_ATTEMPTS } from "@/lib/pin";

/** Anmeldung mit Passwort: nach 5 Fehlversuchen 15 Minuten gesperrt. */
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCK_MINUTES = 15;

/**
 * Zwei getrennte Sperren gegen Durchprobieren: PIN (Verwaltung) und Passwort (Anmeldung).
 * Es gibt nur ein Admin-Konto, deshalb zählt jede Sperre für alle Geräte gemeinsam.
 */
const LOCKS = {
  pin: {
    failedKey: "pinFailedAttempts",
    untilKey: "pinLockedUntil",
    failed: settings.pinFailedAttempts,
    until: settings.pinLockedUntil,
    max: PIN_MAX_ATTEMPTS,
    minutes: PIN_LOCK_MINUTES,
  },
  login: {
    failedKey: "loginFailedAttempts",
    untilKey: "loginLockedUntil",
    failed: settings.loginFailedAttempts,
    until: settings.loginLockedUntil,
    max: LOGIN_MAX_ATTEMPTS,
    minutes: LOGIN_LOCK_MINUTES,
  },
} as const;

export type AttemptKind = keyof typeof LOCKS;

export type AttemptSlot =
  | { ok: true; /** Der wievielte Versuch (1 … max); beim letzten ist die Sperre schon gesetzt. */ attempt: number; max: number; lockMinutes: number }
  | { ok: false; lockedUntil: Date };

/**
 * Meldet einen Versuch an, BEVOR PIN oder Passwort geprüft werden – in einem einzigen
 * UPDATE, damit gleichzeitige Versuche nicht mehr als `max` Prüfungen bekommen.
 * Der letzte erlaubte Versuch setzt die Sperre gleich mit; ist er richtig, hebt
 * clearAttempts sie wieder auf. Bei falscher Eingabe muss danach nichts mehr gespeichert werden.
 */
export async function reserveAttempt(db: Db, kind: AttemptKind, nowMs: number): Promise<AttemptSlot> {
  const l = LOCKS[kind];
  const lockUntil = new Date(nowMs + l.minutes * 60_000).toISOString();
  // Eine abgelaufene Sperre beginnt wieder bei Versuch 1.
  const next = sql`(CASE WHEN ${l.until} IS NOT NULL THEN 1 ELSE ${l.failed} + 1 END)`;
  const [row] = await db
    .update(settings)
    .set({
      [l.failedKey]: next,
      [l.untilKey]: sql`(CASE WHEN ${next} >= ${l.max} THEN ${lockUntil}::timestamptz ELSE NULL END)`,
    })
    .where(and(eq(settings.id, 1), or(isNull(l.until), lte(l.until, new Date(nowMs)))))
    .returning({ attempt: l.failed });
  if (row) return { ok: true, attempt: row.attempt, max: l.max, lockMinutes: l.minutes };

  const [s] = await db.select({ until: l.until }).from(settings).where(eq(settings.id, 1));
  return { ok: false, lockedUntil: s?.until ?? new Date(nowMs) };
}

/** Nach richtiger Eingabe: Zähler und Sperre zurücksetzen. */
export async function clearAttempts(db: Db, kind: AttemptKind): Promise<void> {
  const l = LOCKS[kind];
  await db
    .update(settings)
    .set({ [l.failedKey]: 0, [l.untilKey]: null })
    .where(eq(settings.id, 1));
}

/** „21:05“ für Meldungen wie „gesperrt bis 21:05 Uhr“. */
export function lockTime(d: Date): string {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}

/** Text für einen falschen Versuch: wie viele noch übrig sind oder dass jetzt gesperrt ist. */
export function failedAttemptText(what: string, slot: Extract<AttemptSlot, { ok: true }>): string {
  const left = slot.max - slot.attempt;
  if (left <= 0) return `${what} – für ${slot.lockMinutes} Minuten gesperrt`;
  return `${what} (noch ${left} ${left === 1 ? "Versuch" : "Versuche"})`;
}
