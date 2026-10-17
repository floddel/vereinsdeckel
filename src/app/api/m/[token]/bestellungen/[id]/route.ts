import { z } from "@/lib/z";
import { getDb } from "@/db/client";
import { cancelFoodOrder, getMemberOrders } from "@/server/food-orders";
import { findMemberByToken } from "@/server/member-view";
import { isSameOrigin } from "@/server/same-origin";

/** Bestellung zurückziehen – nur die eigene und nur, solange sie noch nicht angenommen ist. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/m/[token]/bestellungen/[id]">) {
  if (!isSameOrigin(request)) return Response.json({ error: "Nicht erlaubt" }, { status: 403 });
  const { token, id } = await ctx.params;
  const db = getDb();
  const m = await findMemberByToken(db, token);
  if (!m) return Response.json({ error: "Link ungültig" }, { status: 404 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Bestellung nicht gefunden." }, { status: 404 });

  const result = await cancelFoodOrder(db, m.id, id);
  const orders = await getMemberOrders(db, m.id);
  if (!result.ok) return Response.json({ error: result.message, ...orders }, { status: 409 });
  return Response.json(orders);
}
