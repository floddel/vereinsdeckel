import { connection } from "next/server";
import { getDb } from "@/db/client";
import { memberOrderSchema } from "@/domain/food-order";
import { createFoodOrder, getMemberOrders } from "@/server/food-orders";
import { findMemberByToken } from "@/server/member-view";
import { isSameOrigin } from "@/server/same-origin";

const invalid = () => Response.json({ error: "Link ungültig" }, { status: 404 });

/** Speisekarte, „Küche offen“ und die eigenen Bestellungen des Abends (mit ETag). */
export async function GET(request: Request, ctx: RouteContext<"/api/m/[token]/bestellungen">) {
  await connection();
  const db = getDb();
  const m = await findMemberByToken(db, (await ctx.params).token);
  if (!m) return invalid();

  const orders = await getMemberOrders(db, m.id);
  const etag = `"${orders.version}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return Response.json(orders, { headers });
}

/** Neue Bestellung. Antwort: neuer Stand – oder eine Meldung (z. B. „Küche ist zu“). */
export async function POST(request: Request, ctx: RouteContext<"/api/m/[token]/bestellungen">) {
  if (!isSameOrigin(request)) return Response.json({ error: "Nicht erlaubt" }, { status: 403 });
  const db = getDb();
  const m = await findMemberByToken(db, (await ctx.params).token);
  if (!m) return invalid();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Bestellung" }, { status: 400 });
  }
  const parsed = memberOrderSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Bestellung" }, { status: 400 });
  }
  const result = await createFoodOrder(db, m.id, parsed.data);
  const orders = await getMemberOrders(db, m.id);
  if (!result.ok) return Response.json({ error: result.message, ...orders }, { status: 409 });
  return Response.json(orders, { status: 201 });
}
