import { z } from "@/lib/z";
import { getDb } from "@/db/client";
import { thekeOrderActionSchema } from "@/domain/food-order";
import { getThekeOrders, setKitchenOpen, updateFoodOrderStatus } from "@/server/food-orders";
import { guardThekeRequest } from "@/server/theke/api-guard";

const noStore = { "Cache-Control": "no-store" };

/** Offene Handy-Bestellungen des Abends für die Bestell-Leiste der Theke. */
export async function GET(request: Request) {
  const denied = await guardThekeRequest(request);
  if (denied) return denied;
  return Response.json(await getThekeOrders(getDb()), { headers: noStore });
}

const postSchema = z.union([thekeOrderActionSchema, z.object({ kitchenOpen: z.boolean() })]);

/** Annehmen, Fertig, Ablehnen – oder „Küche offen“ umschalten. Antwort: neuer Stand der Bestellungen. */
export async function POST(request: Request) {
  const denied = await guardThekeRequest(request, { write: true });
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });

  const db = getDb();
  const input = parsed.data;
  if ("kitchenOpen" in input) {
    await setKitchenOpen(db, input.kitchenOpen);
  } else {
    const result = await updateFoodOrderStatus(db, input.orderId, input.action, input.action === "reject" ? input.reason : null);
    // Fachlicher Fehler (z. B. schon zurückgezogen): Meldung + aktueller Stand
    if (!result.ok) return Response.json({ error: result.message, ...(await getThekeOrders(db)) }, { status: 409, headers: noStore });
  }
  return Response.json(await getThekeOrders(db), { headers: noStore });
}
