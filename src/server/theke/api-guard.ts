import { isSameOrigin } from "@/server/same-origin";
import { getAdminSession } from "@/server/session";

/**
 * Schutz für die Theke-Schnittstellen: nur mit gültiger Anmeldung und – bei Änderungen –
 * nur von der eigenen Seite aus (fremde Webseiten können so nicht im Namen des Tablets buchen).
 * Liefert eine Fehler-Antwort oder null, wenn alles passt.
 */
export async function guardThekeRequest(request: Request, { write = false } = {}): Promise<Response | null> {
  if (write) {
    if (!isSameOrigin(request)) return Response.json({ error: "Nicht erlaubt" }, { status: 403 });
  }
  if (!(await getAdminSession())) return Response.json({ error: "Bitte anmelden" }, { status: 401 });
  return null;
}
