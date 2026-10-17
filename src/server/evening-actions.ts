"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "@/lib/z";
import { getDb } from "@/db/client";
import { event } from "@/db/schema";
import { type ActionResult, zodFieldErrors } from "@/lib/form-utils";
import { requireVerwaltung } from "./session";

const eveningSchema = z.object({
  id: z.uuid(),
  title: z
    .string()
    .trim()
    .max(60, "Höchstens 60 Zeichen")
    .transform((v) => v || null),
  note: z
    .string()
    .trim()
    .max(500, "Höchstens 500 Zeichen")
    .transform((v) => v || null),
});

/** Abend benennen (z. B. „Sommerfest“) und eine Notiz dazu. Buchungen bleiben unberührt. */
export async function saveEveningAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await requireVerwaltung();
  const parsed = eveningSchema.safeParse({ id: formData.get("id"), title: formData.get("title") ?? "", note: formData.get("note") ?? "" });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const { id, title, note } = parsed.data;
  const updated = await getDb().update(event).set({ title, note }).where(eq(event.id, id)).returning({ id: event.id });
  if (updated.length === 0) return { ok: false, error: "Abend nicht gefunden" };
  refresh();
  return { ok: true, message: "Gespeichert" };
}
