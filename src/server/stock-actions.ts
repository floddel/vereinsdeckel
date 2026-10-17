"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { inventoryInputSchema, recordInventory } from "./stock";
import { requireVerwaltung } from "./session";

/** Inventur speichern (nur gezählte Artikel), danach zurück zum Bestand. */
export async function saveInventoryAction(input: unknown): Promise<{ ok: false; error: string } | undefined> {
  await requireVerwaltung();
  const parsed = inventoryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen" };
  await recordInventory(getDb(), parsed.data);
  revalidatePath("/verwaltung/bestand");
  redirect("/verwaltung/bestand");
}
