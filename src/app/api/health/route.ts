import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db/client";

/** Lebenszeichen für Docker und Überwachung: App und Datenbank antworten. Keine Daten. */
export async function GET() {
  await connection();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
