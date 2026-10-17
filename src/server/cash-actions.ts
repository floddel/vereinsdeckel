"use server";

import { refresh } from "next/cache";
import { z } from "@/lib/z";
import { getDb } from "@/db/client";
import { countInputSchema, movementInputSchema } from "@/domain/cash";
import { addMovement, recordCount, reverseMovement } from "./cash";
import { requireVerwaltung } from "./session";

type Result = { ok: true; message?: string } | { ok: false; error: string };

export async function addMovementAction(input: unknown): Promise<Result> {
  await requireVerwaltung();
  const parsed = movementInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen" };
  const result = await addMovement(getDb(), parsed.data);
  if (result.ok) refresh();
  return result;
}

export async function reverseMovementAction(id: string, reason: string): Promise<Result> {
  await requireVerwaltung();
  const r = z.string().trim().min(1).max(200).safeParse(reason);
  if (!z.uuid().safeParse(id).success || !r.success) return { ok: false, error: "Bitte eine Begründung angeben" };
  const result = await reverseMovement(getDb(), id, r.data);
  if (result.ok) refresh();
  return result;
}

export async function recordCountAction(input: unknown): Promise<Result> {
  await requireVerwaltung();
  const parsed = countInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen" };
  const result = await recordCount(getDb(), parsed.data);
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: result.differenceCents === 0 ? "Gezählt – stimmt genau" : "Zählung gespeichert" };
}
