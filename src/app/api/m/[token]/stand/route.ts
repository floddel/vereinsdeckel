import { connection } from "next/server";
import { getDb } from "@/db/client";
import { findMemberByToken, getMemberStand } from "@/server/member-view";

/**
 * Live-Bierdeckel: Stand eines Mitglieds, ermittelt ausschließlich über den Link.
 * Mit ETag – unverändert → 304 ohne Inhalt (wenig Last, wenn viele Handys nachfragen).
 */
export async function GET(request: Request, ctx: RouteContext<"/api/m/[token]/stand">) {
  await connection();
  const { token } = await ctx.params;
  const db = getDb();
  const m = await findMemberByToken(db, token);
  if (!m) return Response.json({ error: "Link ungültig" }, { status: 404 });

  const stand = await getMemberStand(db, m);
  const etag = `"${stand.version}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return Response.json(stand, { headers });
}
