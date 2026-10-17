import { asc, eq, gt, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { authSession } from "@/db/schema";

export interface Device {
  id: string;
  createdAt: string;
  /** wird höchstens einmal am Tag aktualisiert (Verlängerung der Anmeldung) */
  lastActiveAt: string;
  expiresAt: string;
  current: boolean;
}

/** Angemeldete Geräte (gültige Sitzungen) – ohne IP-Adresse und Browser, die werden nicht gespeichert. */
export async function listDevices(db: Db, currentSessionId: string, now = new Date()): Promise<Device[]> {
  const rows = await db.select().from(authSession).where(gt(authSession.expiresAt, now)).orderBy(asc(authSession.createdAt));
  return rows.map((s) => ({
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    lastActiveAt: s.updatedAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    current: s.id === currentSessionId,
  }));
}

/** Ein anderes Gerät abmelden (das eigene nicht – dafür gibt es „Abmelden“). */
export async function signOutDevice(db: Db, sessionId: string, currentSessionId: string): Promise<boolean> {
  if (sessionId === currentSessionId) return false;
  const deleted = await db.delete(authSession).where(eq(authSession.id, sessionId)).returning({ id: authSession.id });
  return deleted.length > 0;
}

/** Alle Geräte außer diesem abmelden. Liefert die Anzahl. */
export async function signOutOtherDevices(db: Db, currentSessionId: string): Promise<number> {
  const deleted = await db.delete(authSession).where(ne(authSession.id, currentSessionId)).returning({ id: authSession.id });
  return deleted.length;
}
