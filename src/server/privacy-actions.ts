"use server";

import { eq } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { z } from "@/lib/z";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import { isCheckId, isHostingKind } from "@/domain/privacy";
import { type ActionResult, zodFieldErrors } from "@/lib/form-utils";
import { anonymizeMember } from "./privacy";
import { requireVerwaltung } from "./session";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen`)
    .transform((v) => v || null);

const privacySchema = z.object({
  controller: optional(120),
  address: optional(300),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Bitte eine gültige E-Mail-Adresse eingeben")
    .transform((v) => v || null),
  authority: optional(300),
});

/** Angaben für den Datenschutzhinweis (Verantwortlicher, Anschrift, E-Mail, Aufsichtsbehörde). */
export async function savePrivacySettingsAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await requireVerwaltung();
  const parsed = privacySchema.safeParse({
    controller: formData.get("controller") ?? "",
    address: formData.get("address") ?? "",
    email: formData.get("email") ?? "",
    authority: formData.get("authority") ?? "",
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;
  await getDb()
    .update(settings)
    .set({ privacyController: d.controller, privacyAddress: d.address, privacyEmail: d.email, privacyAuthority: d.authority, updatedAt: new Date() })
    .where(eq(settings.id, 1));
  revalidatePath("/datenschutz");
  refresh();
  return { ok: true, message: "Gespeichert – der Datenschutzhinweis ist aktualisiert" };
}

const hostingSchema = z.object({
  kind: z.string().refine(isHostingKind, "Bitte wählen"),
  name: optional(120),
  location: optional(120),
  contract: optional(200),
});

/** Wo die App läuft – Datenschutzhinweis, Auftragsverarbeiter und Checkliste passen sich an. */
export async function saveHostingAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await requireVerwaltung();
  const parsed = hostingSchema.safeParse({
    kind: formData.get("kind") ?? "",
    name: formData.get("name") ?? "",
    location: formData.get("location") ?? "",
    contract: formData.get("contract") ?? "",
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;
  if (d.kind === "provider" && !d.name) return { ok: false, fieldErrors: { name: "Bitte den Anbieter angeben" } };
  const provider = d.kind === "provider";
  await getDb()
    .update(settings)
    .set({
      hostingKind: d.kind,
      hostingName: provider ? d.name : null,
      hostingLocation: provider ? d.location : null,
      hostingContract: provider ? d.contract : null,
      updatedAt: new Date(),
    })
    .where(eq(settings.id, 1));
  revalidatePath("/datenschutz");
  refresh();
  return { ok: true, message: "Gespeichert – Datenschutzhinweis und Checkliste sind angepasst" };
}

/** Punkt der Checkliste ab- bzw. anhaken. */
export async function setPrivacyCheckAction(id: string, checked: boolean): Promise<void> {
  await requireVerwaltung();
  if (!isCheckId(id)) return;
  const db = getDb();
  const [s] = await db.select({ checks: settings.privacyChecks }).from(settings);
  await db
    .update(settings)
    .set({ privacyChecks: { ...(s?.checks ?? {}), [id]: checked } })
    .where(eq(settings.id, 1));
  refresh();
}

/** Mitglied anonymisieren (nicht rückgängig zu machen). */
export async function anonymizeMemberAction(memberId: string): Promise<{ ok: true; newName: string } | { ok: false; error: string }> {
  await requireVerwaltung();
  if (!z.uuid().safeParse(memberId).success) return { ok: false, error: "Mitglied nicht gefunden" };
  const result = await anonymizeMember(getDb(), memberId);
  if (result.ok) revalidatePath("/verwaltung/mitglieder");
  return result;
}
