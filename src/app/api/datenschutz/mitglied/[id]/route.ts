import { connection } from "next/server";
import { getDb } from "@/db/client";
import { toCsv } from "@/domain/csv";
import { fileSlug } from "@/server/pdf/parts";
import { forbidden, verwaltungAllowed } from "@/server/pdf/guard";
import { exportMemberData, memberBookingRows } from "@/server/privacy";

const UUID = /^[0-9a-f-]{36}$/i;

/** Datenauskunft eines Mitglieds: ?format=json (alles) oder ?format=csv (Buchungen). Nur Verwaltung. */
export async function GET(request: Request, ctx: RouteContext<"/api/datenschutz/mitglied/[id]">) {
  await connection();
  if (!(await verwaltungAllowed())) return forbidden();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const db = getDb();
  const data = await exportMemberData(db, id);
  if (!data) return new Response("Nicht gefunden", { status: 404 });
  const base = `daten-${fileSlug(data.mitglied.name)}-${data.erstellt.slice(0, 10)}`;
  const csv = new URL(request.url).searchParams.get("format") === "csv";
  return new Response(csv ? toCsv(await memberBookingRows(db, id)) : JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.${csv ? "csv" : "json"}"`,
      "Cache-Control": "no-store",
    },
  });
}
