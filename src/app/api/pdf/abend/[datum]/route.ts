import { renderToBuffer } from "@react-pdf/renderer";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { EveningPdf } from "@/server/pdf/documents";
import { forbidden, verwaltungAllowed } from "@/server/pdf/guard";
import { loadBrand, pdfResponse } from "@/server/pdf/parts";
import { getEveningReport } from "@/server/reports";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Abendabschluss als PDF. */
export async function GET(_request: Request, ctx: RouteContext<"/api/pdf/abend/[datum]">) {
  await connection();
  if (!(await verwaltungAllowed())) return forbidden();
  const { datum } = await ctx.params;
  if (!DAY.test(datum)) return new Response("Nicht gefunden", { status: 404 });
  const db = getDb();
  const [report, brand] = await Promise.all([getEveningReport(db, datum), loadBrand(db)]);
  if (!report) return new Response("Nicht gefunden", { status: 404 });
  return pdfResponse(await renderToBuffer(EveningPdf({ brand, r: report })), `abendabschluss-${datum}.pdf`);
}
