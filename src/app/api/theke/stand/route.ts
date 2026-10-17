import { getDb } from "@/db/client";
import { guardThekeRequest } from "@/server/theke/api-guard";
import { getThekeSnapshot } from "@/server/theke/snapshot";

/** Aktueller Stand für die Theke: Mitglieder mit offenem Betrag, Artikel, Bons des Abends. */
export async function GET(request: Request) {
  const denied = await guardThekeRequest(request);
  if (denied) return denied;
  return Response.json(await getThekeSnapshot(getDb()), { headers: { "Cache-Control": "no-store" } });
}
