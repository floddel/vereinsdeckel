import { connection } from "next/server";
import { getDb } from "@/db/client";
import { businessDate } from "@/domain/business-date";
import { toCsv } from "@/domain/csv";
import { presetPeriod } from "@/domain/report";
import { buildExport, EXPORTS, type ExportKind } from "@/server/exports";
import { forbidden, verwaltungAllowed } from "@/server/pdf/guard";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** CSV-Export (?von=&bis=, Standard: laufendes Jahr). Nur angemeldet und mit PIN. */
export async function GET(request: Request, ctx: RouteContext<"/api/export/[art]">) {
  await connection();
  if (!(await verwaltungAllowed())) return forbidden();
  const { art } = await ctx.params;
  if (!(art in EXPORTS)) return new Response("Nicht gefunden", { status: 404 });
  const kind = art as ExportKind;
  const q = new URL(request.url).searchParams;
  const today = businessDate(new Date(), 0);
  const year = presetPeriod("jahr", today);
  const von = q.get("von") ?? "";
  const bis = q.get("bis") ?? "";
  const period = DAY.test(von) && DAY.test(bis) && von <= bis ? { from: von, to: bis } : year;
  const rows = await buildExport(getDb(), kind, period);
  const file = EXPORTS[kind].period ? `${kind}-${period.from}-bis-${period.to}.csv` : `${kind}-${today}.csv`;
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
