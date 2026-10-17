import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import { syncRequestSchema } from "@/domain/theke";
import { guardThekeRequest } from "@/server/theke/api-guard";
import { applyOps } from "@/server/theke/apply-ops";

/**
 * Postausgang der Theke: nimmt Vorgänge (Bon, Storno, Umbuchen) entgegen und speichert jeden
 * genau einmal. Antwort je Vorgang: ok | duplicate | rejected (mit Meldung).
 */
export async function POST(request: Request) {
  const denied = await guardThekeRequest(request, { write: true });
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ungültige Vorgänge" }, { status: 400 });

  const db = getDb();
  const [s] = await db.select({ cutoffHour: settings.businessDayCutoffHour }).from(settings);
  const results = await applyOps(db, parsed.data.ops, {
    deviceId: parsed.data.deviceId,
    cutoffHour: s?.cutoffHour ?? 6,
  });
  return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
