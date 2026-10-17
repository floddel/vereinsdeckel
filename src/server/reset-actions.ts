"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import { describeDeleted, isResetArea, planReset, RESET_CONFIRM_WORD } from "@/domain/reset";
import type { ActionResult } from "@/lib/form-utils";
import { invalidatePublicMenu } from "./menu";
import { endTestPhase, resetData } from "./reset";
import { requireVerwaltung } from "./session";

/** Daten zurücksetzen (nur Testphase, mit PIN und eingetipptem „LÖSCHEN“). */
export async function resetDataAction(input: { areas: unknown; keepOpening: unknown; confirm: unknown }): Promise<ActionResult> {
  await requireVerwaltung();
  if (typeof input.confirm !== "string" || input.confirm.trim().toUpperCase() !== RESET_CONFIRM_WORD) {
    return { ok: false, error: `Zum Bestätigen bitte „${RESET_CONFIRM_WORD}“ eintippen.` };
  }
  if (!Array.isArray(input.areas) || !input.areas.every(isResetArea)) return { ok: false, error: "Unbekannte Auswahl" };
  const result = await resetData(getDb(), planReset(input.areas, input.keepOpening === true));
  if (!result.ok) return { ok: false, error: result.error };
  invalidatePublicMenu();
  refresh();
  return { ok: true, message: describeDeleted(result.deleted) };
}

/** Testphase beenden – endgültig. */
export async function endTestPhaseAction(): Promise<ActionResult> {
  await requireVerwaltung();
  await endTestPhase(getDb());
  refresh();
  return { ok: true, message: "Testphase beendet – viel Spaß beim ersten echten Abend!" };
}
