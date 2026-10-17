"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import { insertStarterArticles } from "@/db/setup";
import type { ActionResult } from "@/lib/form-utils";
import { invalidatePublicMenu } from "./menu";
import { requireVerwaltung } from "./session";

/** Einrichtung: Startvorlage mit typischen Artikeln (nur, solange es noch keine gibt). Ohne Bestand. */
export async function applyStarterArticlesAction(): Promise<ActionResult> {
  await requireVerwaltung();
  const created = await insertStarterArticles(getDb());
  if (created.length === 0) return { ok: false, error: "Es gibt schon Artikel – die Vorlage wird nur bei einer leeren Artikelliste übernommen." };
  invalidatePublicMenu();
  refresh();
  return { ok: true, message: `${created.length} Artikel angelegt – Preise und Namen kannst du unter „Artikel“ anpassen` };
}

/** Einrichtung abschließen (die Übersicht zeigt dann nicht mehr „Einrichtung fortsetzen“). */
export async function finishSetupAction(): Promise<ActionResult> {
  await requireVerwaltung();
  await getDb().update(settings).set({ setupDoneAt: new Date() }).where(eq(settings.id, 1));
  refresh();
  return { ok: true, message: "Einrichtung abgeschlossen – viel Spaß an der Theke!" };
}
