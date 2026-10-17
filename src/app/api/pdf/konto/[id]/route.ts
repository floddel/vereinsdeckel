import { renderToBuffer } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { member } from "@/db/schema";
import { businessDate } from "@/domain/business-date";
import { getMemberStatement } from "@/server/member-view";
import { StatementPdf } from "@/server/pdf/documents";
import { forbidden, verwaltungAllowed } from "@/server/pdf/guard";
import { fileSlug, loadBrand, pdfResponse } from "@/server/pdf/parts";

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Kontoauszug eines Mitglieds (?von=&bis=, Standard: laufendes Jahr). */
export async function GET(request: Request, ctx: RouteContext<"/api/pdf/konto/[id]">) {
  await connection();
  if (!(await verwaltungAllowed())) return forbidden();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const db = getDb();
  const [m] = await db.select({ name: member.name }).from(member).where(eq(member.id, id));
  if (!m) return new Response("Nicht gefunden", { status: 404 });
  const q = new URL(request.url).searchParams;
  const today = businessDate(new Date(), 0);
  const from = DAY.test(q.get("von") ?? "") ? q.get("von")! : `${today.slice(0, 4)}-01-01`;
  const to = DAY.test(q.get("bis") ?? "") ? q.get("bis")! : today;
  const [statement, brand] = await Promise.all([getMemberStatement(db, id, from, to), loadBrand(db)]);
  return pdfResponse(
    await renderToBuffer(StatementPdf({ brand, st: { memberName: m.name, from, to, ...statement } })),
    `kontoauszug-${fileSlug(m.name)}-${from}-bis-${to}.pdf`,
  );
}
