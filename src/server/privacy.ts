import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { foodOrder, foodOrderLine, article, member, memberToken, payment, sale, settings } from "@/db/schema";
import { csvDate, csvEuro, yesNo } from "@/domain/csv";
import { anonymousName, type Hosting, isHostingKind, type PrivacySettings } from "@/domain/privacy";
import { moveReason } from "@/domain/theke";
import { getMemberReceipts, getMemberStatement } from "./member-view";
import { openCents } from "./theke/apply-ops";

export async function getPrivacySettings(
  db: Db,
): Promise<PrivacySettings & { hosting: Hosting; checks: Record<string, boolean>; aiEnabled: boolean }> {
  const [s] = await db.select().from(settings);
  return {
    hosting: {
      kind: isHostingKind(s?.hostingKind) ? s.hostingKind : "vercel-neon",
      name: s?.hostingName ?? null,
      location: s?.hostingLocation ?? null,
      contract: s?.hostingContract ?? null,
    },
    controller: s?.privacyController ?? null,
    address: s?.privacyAddress ?? null,
    email: s?.privacyEmail ?? null,
    authority: s?.privacyAuthority ?? null,
    checks: s?.privacyChecks ?? {},
    aiEnabled: s?.aiReceiptsEnabled ?? false,
  };
}

const METHOD: Record<string, string> = { cash: "bar", paypal: "PayPal" };

/**
 * Alle Daten eines Mitglieds (Auskunft nach Art. 15 DSGVO, maschinenlesbar nach Art. 20).
 * Der geheime Link selbst wird nicht ausgegeben (er ist ein Zugangsschlüssel), nur wann er angelegt bzw. gesperrt wurde.
 */
export async function exportMemberData(db: Db, memberId: string, now = new Date()) {
  const [m] = await db.select().from(member).where(and(eq(member.id, memberId), isNull(member.anonymizedAt)));
  if (!m) return null;
  const [tokens, statement, orders] = await Promise.all([
    db.select({ createdAt: memberToken.createdAt, revokedAt: memberToken.revokedAt }).from(memberToken).where(eq(memberToken.memberId, memberId)).orderBy(asc(memberToken.createdAt)),
    getMemberStatement(db, memberId, "0000-01-01", "9999-12-31"),
    db
      .select({ order: foodOrder, articleName: article.name, quantity: foodOrderLine.quantity })
      .from(foodOrder)
      .innerJoin(foodOrderLine, eq(foodOrderLine.foodOrderId, foodOrder.id))
      .innerJoin(article, eq(article.id, foodOrderLine.articleId))
      .where(eq(foodOrder.memberId, memberId))
      .orderBy(asc(foodOrder.createdAt)),
  ]);
  const euro = (c: number) => c / 100;
  return {
    erstellt: now.toISOString(),
    hinweis: "Alle Daten, die in der Bierdeckel-App zu dieser Person gespeichert sind. Beträge in Euro.",
    mitglied: { name: m.name, aktiv: m.active, angelegt: m.createdAt.toISOString() },
    persoenlicheLinks: tokens.map((t) => ({ angelegt: t.createdAt.toISOString(), gesperrt: t.revokedAt?.toISOString() ?? null })),
    offenerBetrag: euro(statement.closingCents),
    abende: statement.receipts.map((r) => ({
      datum: r.businessDate,
      abend: r.title,
      positionen: r.lines.map((l) => ({ artikel: l.articleName, menge: l.quantity, betrag: euro(l.totalCents), gast: l.isGuest, storno: l.reversal, grund: l.reason })),
      zahlungen: r.payments.map((p) => ({ art: METHOD[p.methodId] ?? p.methodId, betrag: euro(p.amountCents), trinkgeld: euro(p.tipCents), storno: p.reversal, grund: p.reason })),
      summe: euro(r.totalCents),
      bezahlt: euro(r.paidCents),
      offenDanach: euro(r.openAfterCents),
    })),
    bestellungen: [...Map.groupBy(orders, (o) => o.order.id).values()].map((rows) => ({
      bestellt: rows[0].order.createdAt.toISOString(),
      status: rows[0].order.status,
      wunsch: rows[0].order.note,
      positionen: rows.map((r) => ({ artikel: r.articleName, menge: r.quantity })),
    })),
  };
}

/** Dieselben Buchungen als Tabelle (CSV) zum Lesen in Excel. */
export async function memberBookingRows(db: Db, memberId: string): Promise<(string | number)[][]> {
  const { receipts } = await getMemberReceipts(db, memberId, { limit: 100_000 });
  const rows: (string | number)[][] = [["Abend", "Art", "Artikel / Zahlungsart", "Menge", "Betrag", "Trinkgeld", "Gast", "Storno", "Grund"]];
  for (const r of [...receipts].reverse()) {
    for (const l of r.lines) rows.push([csvDate(r.businessDate), "Verzehr", l.articleName, l.quantity, csvEuro(l.totalCents), "", yesNo(l.isGuest), yesNo(l.reversal), l.reason ?? ""]);
    for (const p of r.payments) rows.push([csvDate(r.businessDate), "Zahlung", METHOD[p.methodId] ?? p.methodId, "", csvEuro(p.amountCents), csvEuro(p.tipCents), "", yesNo(p.reversal), p.reason ?? ""]);
  }
  return rows;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type AnonymizeResult = { ok: true; newName: string } | { ok: false; error: string };

/**
 * Anonymisieren (Art. 17 DSGVO): Name → „Ehemaliges Mitglied #n“, Links gesperrt, Bestellungen gelöscht,
 * Name auch in Storno-Gründen anderer Bons ersetzt („Umgebucht auf …“). Buchungen bleiben anonym für die Kasse.
 * Nur wenn nichts mehr offen ist.
 */
export async function anonymizeMember(db: Db, memberId: string, now = new Date()): Promise<AnonymizeResult> {
  return db.transaction(async (tx): Promise<AnonymizeResult> => {
    // Sperre auf das Mitglied, dann erst prüfen: Eine Buchung der Theke, die gleichzeitig kommt,
    // wartet (requireMember) – der offene Betrag kann sich zwischen Prüfen und Anonymisieren nicht ändern.
    const [m] = await tx
      .select()
      .from(member)
      .where(and(eq(member.id, memberId), isNull(member.anonymizedAt)))
      .for("update");
    if (!m) return { ok: false, error: "Mitglied nicht gefunden" };
    if ((await openCents(tx, memberId)) !== 0) {
      return { ok: false, error: "Erst den offenen Betrag begleichen – sonst ginge er beim Anonymisieren verloren." };
    }

    const names = (await tx.select({ name: member.name }).from(member)).map((r) => r.name);
    const newName = anonymousName(names);
    // Nur für diesen Vorgang: Storno-Gründe dürfen geändert werden (Migration 0009)
    await tx.execute(sql`select set_config('app.anonymize', 'on', true)`);
    // „Umgebucht auf …“: gezielt über das gespeicherte Ziel – trifft auch frühere Namen des Mitglieds
    await tx.update(sale).set({ reason: moveReason(newName) }).where(eq(sale.movedToMemberId, memberId));
    // Freitext-Gründe: Name als ganzes Wort ersetzen (nicht „Peter Weiß“ in „Peter Weißmann“).
    // Umbuchungen auf andere Mitglieder bleiben unberührt (nicht „Peter Weiß (sen.)“).
    const pattern = `(^|[^[:alnum:]])${escapeRegex(m.name)}($|[^[:alnum:]])`;
    await tx.execute(
      sql`update ${sale} set reason = regexp_replace(reason, ${pattern}, ${`\\1${newName}\\2`}, 'g') where reason ~ ${pattern} and ${sale.movedToMemberId} is null`,
    );
    await tx.execute(sql`update ${payment} set reason = regexp_replace(reason, ${pattern}, ${`\\1${newName}\\2`}, 'g') where reason ~ ${pattern}`);
    await tx.update(member).set({ name: newName, active: false, anonymizedAt: now }).where(eq(member.id, memberId));
    await tx.update(memberToken).set({ revokedAt: now }).where(and(eq(memberToken.memberId, memberId), isNull(memberToken.revokedAt)));
    await tx.delete(foodOrder).where(eq(foodOrder.memberId, memberId));
    return { ok: true, newName };
  });
}
