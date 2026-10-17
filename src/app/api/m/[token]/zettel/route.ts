import { connection } from "next/server";
import { getDb } from "@/db/client";
import { findMemberByToken, getMemberReceipts } from "@/server/member-view";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Kassenzettel eines Mitglieds, seitenweise (?before=JJJJ-MM-TT). */
export async function GET(request: Request, ctx: RouteContext<"/api/m/[token]/zettel">) {
  await connection();
  const { token } = await ctx.params;
  const db = getDb();
  const m = await findMemberByToken(db, token);
  if (!m) return Response.json({ error: "Link ungültig" }, { status: 404 });

  const before = new URL(request.url).searchParams.get("before");
  const page = await getMemberReceipts(db, m.id, { before: before && DAY.test(before) ? before : undefined });
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
}
