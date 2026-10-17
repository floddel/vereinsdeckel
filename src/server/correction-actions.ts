"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "@/lib/z";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import { moveOpSchema, paymentReversalOpSchema, reversalOpSchema, type ThekeOp } from "@/domain/theke";
import type { ActionResult } from "@/lib/form-utils";
import { requireVerwaltung } from "./session";
import { applyOps } from "./theke/apply-ops";

/** Was die Verwaltung schickt; IDs und Zeit setzt der Server. */
const correctionSchema = z.discriminatedUnion("type", [
  reversalOpSchema.omit({ id: true, createdAt: true }),
  moveOpSchema.omit({ id: true, newSaleId: true, createdAt: true }),
  paymentReversalOpSchema.omit({ id: true, createdAt: true }),
]);

export type Correction = z.input<typeof correctionSchema>;

/**
 * Storno, Umbuchen oder Zahlungs-Storno aus der Verwaltung – auch für frühere Abende
 * (an der Theke ohne PIN geht nur der laufende Abend).
 */
export async function correctionAction(input: Correction): Promise<ActionResult> {
  await requireVerwaltung();
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Angaben" };
  const c = parsed.data;
  const createdAt = new Date().toISOString();
  const op: ThekeOp =
    c.type === "move" ? { ...c, id: randomUUID(), newSaleId: randomUUID(), createdAt } : { ...c, id: randomUUID(), createdAt };

  const db = getDb();
  const [s] = await db.select({ cutoffHour: settings.businessDayCutoffHour }).from(settings);
  const [result] = await applyOps(db, [op], { deviceId: "verwaltung", cutoffHour: s?.cutoffHour ?? 6, verwaltung: true });
  if (result.status === "rejected") return { ok: false, error: result.message ?? "Nicht möglich" };

  revalidatePath("/verwaltung", "layout");
  const message = { reversal: "Storniert", move: "Umgebucht", "payment-reversal": "Zahlung storniert" }[c.type];
  return { ok: true, message };
}
