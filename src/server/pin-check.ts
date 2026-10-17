import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import { verifyPin } from "@/lib/pin";
import { clearAttempts, failedAttemptText, lockTime, reserveAttempt } from "./attempt-lock";

/** PIN prüfen – mit Zählung der Fehlversuche und Sperre (gemeinsam für Entsperren und PIN-Ändern). */
export async function checkPinWithLockout(pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const slot = await reserveAttempt(db, "pin", Date.now());
  if (!slot.ok) return { ok: false, error: `Zu viele Fehlversuche – gesperrt bis ${lockTime(slot.lockedUntil)} Uhr` };

  const [s] = await db.select({ pinHash: settings.pinHash }).from(settings).where(eq(settings.id, 1));
  if (!verifyPin(pin, s.pinHash)) return { ok: false, error: failedAttemptText("PIN falsch", slot) };

  await clearAttempts(db, "pin");
  return { ok: true };
}
