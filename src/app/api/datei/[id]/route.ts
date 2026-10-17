import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { file, settings } from "@/db/schema";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Liefert das Vereinslogo aus. Nur das aktuelle Logo ist öffentlich
 * (die Mitgliederansicht braucht es); Belegfotos liefert die geschützte Route /api/beleg.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/datei/[id]">) {
  await connection();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const db = getDb();
  const [s] = await db.select({ logoFileId: settings.logoFileId }).from(settings);
  if (s?.logoFileId !== id) return new Response("Nicht gefunden", { status: 404 });
  const [f] = await db.select().from(file).where(eq(file.id, id));
  if (!f) return new Response("Nicht gefunden", { status: 404 });
  return new Response(Buffer.from(f.bytes), {
    headers: {
      "Content-Type": f.mimeType,
      // Die ID ändert sich bei jedem neuen Logo → darf lange zwischengespeichert werden.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
