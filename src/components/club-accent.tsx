import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import { DEFAULT_ACCENT, isAccent } from "@/lib/accent";
import { AccentSync } from "./accent-sync";

/** Vereinsfarbe aus den Einstellungen – im Wurzel-Layout, in Suspense (die Seite selbst bleibt statisch). */
export async function ClubAccent() {
  await connection();
  let accent: string = DEFAULT_ACCENT;
  try {
    const [s] = await getDb().select({ accent: settings.accent }).from(settings).where(eq(settings.id, 1));
    if (s) accent = s.accent;
  } catch {
    // Datenbank (noch) nicht erreichbar: zuletzt gemerkte Farbe im Browser bleibt
    return null;
  }
  return <AccentSync accent={isAccent(accent) ? accent : DEFAULT_ACCENT} />;
}
