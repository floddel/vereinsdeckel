"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "@/lib/z";
import { getDb } from "@/db/client";
import { foodOrder, member, memberToken, payment, sale } from "@/db/schema";
import { cleanName, type MemberCsvResult, nameKey, parseMemberCsv } from "@/domain/member-csv";
import { type ActionResult, checkbox, zodFieldErrors } from "@/lib/form-utils";
import { generateMemberToken } from "@/lib/token";
import { requireVerwaltung } from "./session";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

const memberSchema = z.object({
  name: z
    .string()
    .transform(cleanName)
    .pipe(z.string().min(2, "Bitte einen Namen eingeben").max(80, "Höchstens 80 Zeichen")),
});

const DUPLICATE_NAME = "Diesen Namen gibt es schon. Bitte unterscheidbar machen, z. B. „Klaus Müller (sen.)“.";

/** Vergleichswerte aller vorhandenen Namen (ggf. ohne das gerade bearbeitete Mitglied). */
async function existingNameKeys(exceptId?: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ name: member.name })
    .from(member)
    .where(exceptId ? ne(member.id, exceptId) : undefined);
  return new Set(rows.map((r) => nameKey(r.name)));
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

async function issueToken(tx: Tx, memberId: string) {
  await tx.insert(memberToken).values({ memberId, token: generateMemberToken() });
}

export async function saveMemberAction(
  _prev: (ActionResult & { id?: string }) | undefined,
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  await requireVerwaltung();
  const parsed = memberSchema.safeParse({ name: String(formData.get("name") ?? "") });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const values = { ...parsed.data, active: checkbox(formData, "active") };
  const id = String(formData.get("id") ?? "");
  const db = getDb();
  if ((await existingNameKeys(id || undefined)).has(nameKey(values.name))) {
    return { ok: false, fieldErrors: { name: DUPLICATE_NAME } };
  }

  try {
    if (id) {
      await db.update(member).set(values).where(and(eq(member.id, id), isNull(member.anonymizedAt)));
      refresh();
      return { ok: true, message: `„${values.name}“ gespeichert`, id };
    }
    const newId = await db.transaction(async (tx) => {
      const [m] = await tx.insert(member).values(values).returning({ id: member.id });
      await issueToken(tx, m.id);
      return m.id;
    });
    refresh();
    return { ok: true, message: `„${values.name}“ angelegt`, id: newId };
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { ok: false, fieldErrors: { name: DUPLICATE_NAME } };
    }
    throw e;
  }
}

/**
 * Mitglied ganz löschen – nur ohne Buchungen (z. B. vertippt angelegt).
 * Mit Buchungen: stattdessen inaktiv setzen (später: anonymisieren).
 */
export async function deleteMemberAction(memberId: string): Promise<{ ok: false; error: string }> {
  await requireVerwaltung();
  const db = getDb();
  const done = await db.transaction(async (tx) => {
    // Sperre: Während des Löschens kann an der Theke nichts dazukommen.
    const [m] = await tx.select({ id: member.id }).from(member).where(eq(member.id, memberId)).for("update");
    if (!m) return false;
    const [[s], [p]] = await Promise.all([
      tx.select({ id: sale.id }).from(sale).where(eq(sale.memberId, memberId)).limit(1),
      tx.select({ id: payment.id }).from(payment).where(eq(payment.memberId, memberId)).limit(1),
    ]);
    if (s || p) return false;
    await tx.delete(foodOrder).where(eq(foodOrder.memberId, memberId));
    await tx.delete(memberToken).where(eq(memberToken.memberId, memberId));
    await tx.delete(member).where(eq(member.id, memberId));
    return true;
  });
  if (!done) return { ok: false, error: "Das Mitglied hat Buchungen und kann deshalb nicht gelöscht werden." };
  // Gemerkte Mitgliederliste verwerfen, sonst stünde das gelöschte Mitglied dort noch.
  revalidatePath("/verwaltung/mitglieder");
  redirect("/verwaltung/mitglieder");
}

/** Aktiv/inaktiv setzen (inaktive Mitglieder erscheinen nicht an der Theke). */
export async function setMemberActiveAction(memberId: string, active: boolean): Promise<void> {
  await requireVerwaltung();
  await getDb()
    .update(member)
    .set({ active })
    .where(and(eq(member.id, memberId), isNull(member.anonymizedAt)));
  refresh();
}

/** Link sperren: Der bisherige Link zeigt danach nichts mehr an. */
export async function revokeLinkAction(memberId: string): Promise<void> {
  await requireVerwaltung();
  await getDb()
    .update(memberToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(memberToken.memberId, memberId), isNull(memberToken.revokedAt)));
  refresh();
}

/** Neuen Link erzeugen (der alte wird dabei gesperrt). */
export async function renewLinkAction(memberId: string): Promise<void> {
  await requireVerwaltung();
  await getDb().transaction(async (tx) => {
    await tx
      .update(memberToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(memberToken.memberId, memberId), isNull(memberToken.revokedAt)));
    await issueToken(tx, memberId);
  });
  refresh();
}

export type ImportState =
  | { step: "preview"; csv: string; result: MemberCsvResult; existing: number[] }
  | { step: "done"; imported: number; skipped: number }
  | { step: "error"; error: string }
  | undefined;

/**
 * CSV-Import in zwei Schritten: erst Vorschau, dann (mit confirm=1) wirklich importieren.
 * Namen, die es schon gibt, werden übersprungen – so kann man dieselbe Liste gefahrlos erneut importieren.
 */
export async function importMembersAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireVerwaltung();
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { step: "error", error: "Bitte eine CSV-Datei wählen oder den Inhalt einfügen" };
  if (csv.length > 500_000) return { step: "error", error: "Datei ist zu groß" };

  const result = parseMemberCsv(csv);
  const known = await existingNameKeys();
  /** Zeilennummern der Namen, die es schon gibt */
  const existing = result.rows.filter((r) => known.has(nameKey(r.name))).map((r) => r.line);

  if (formData.get("confirm") !== "1") return { step: "preview", csv, result, existing };

  const toImport = result.rows.filter((r) => !existing.includes(r.line));
  let imported = 0;
  await getDb().transaction(async (tx) => {
    for (const r of toImport) {
      // Falls jemand gleichzeitig denselben Namen anlegt: überspringen statt abbrechen.
      const [m] = await tx.insert(member).values({ name: r.name }).onConflictDoNothing().returning({ id: member.id });
      if (!m) continue;
      await issueToken(tx, m.id);
      imported++;
    }
  });
  refresh();
  return { step: "done", imported, skipped: result.rows.length - imported + result.errors.length };
}
