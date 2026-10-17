import { and, asc, desc, eq, isNull, sql, sum } from "drizzle-orm";
import { type Db, getDb } from "@/db/client";
import { member, memberToken, payment, sale, saleLine } from "@/db/schema";

export type MemberRow = typeof member.$inferSelect;
export type MemberListRow = MemberRow & { token: string | null };

/** Alle (nicht anonymisierten) Mitglieder mit ihrem aktiven Link. */
export async function listMembers(): Promise<MemberListRow[]> {
  const rows = await getDb()
    .select({ member, token: memberToken.token })
    .from(member)
    .leftJoin(memberToken, and(eq(memberToken.memberId, member.id), isNull(memberToken.revokedAt)))
    .where(isNull(member.anonymizedAt))
    .orderBy(asc(member.name));
  return rows.map((r) => ({ ...r.member, token: r.token }));
}

export async function getMember(id: string) {
  const db = getDb();
  const [m] = await db.select().from(member).where(eq(member.id, id));
  if (!m) return null;
  const tokens = await db
    .select()
    .from(memberToken)
    .where(eq(memberToken.memberId, id))
    .orderBy(desc(memberToken.createdAt));
  return { member: m, activeToken: tokens.find((t) => !t.revokedAt) ?? null, tokens };
}

/** Hat das Mitglied Buchungen oder Zahlungen? Dann darf es nicht gelöscht werden (Kasse muss stimmen). */
export async function memberHasBookings(memberId: string): Promise<boolean> {
  const db = getDb();
  const [[s], [p]] = await Promise.all([
    db.select({ id: sale.id }).from(sale).where(eq(sale.memberId, memberId)).limit(1),
    db.select({ id: payment.id }).from(payment).where(eq(payment.memberId, memberId)).limit(1),
  ]);
  return !!s || !!p;
}

/** Mitglieder mit offenem Betrag, höchster zuerst (für die Übersicht der Verwaltung). */
export async function listOpenBalances(db: Db = getDb()): Promise<{ id: string; name: string; openCents: number }[]> {
  const lineSums = db
    .select({ memberId: sale.memberId, cents: sum(saleLine.totalCents).mapWith(Number).as("line_cents") })
    .from(saleLine)
    .innerJoin(sale, eq(saleLine.saleId, sale.id))
    .groupBy(sale.memberId)
    .as("line_sums");
  const paySums = db
    .select({ memberId: payment.memberId, cents: sum(payment.amountCents).mapWith(Number).as("pay_cents") })
    .from(payment)
    .groupBy(payment.memberId)
    .as("pay_sums");
  const open = sql<number>`coalesce(${lineSums.cents}, 0) - coalesce(${paySums.cents}, 0)`.mapWith(Number);
  return db
    .select({ id: member.id, name: member.name, openCents: open })
    .from(member)
    .leftJoin(lineSums, eq(lineSums.memberId, member.id))
    .leftJoin(paySums, eq(paySums.memberId, member.id))
    .where(and(isNull(member.anonymizedAt), sql`${open} > 0`))
    .orderBy(desc(open));
}
