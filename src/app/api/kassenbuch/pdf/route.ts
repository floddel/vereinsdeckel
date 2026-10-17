import { renderToBuffer } from "@react-pdf/renderer";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { businessDate } from "@/domain/business-date";
import { loadCashBook } from "@/server/cash-book-query";
import { CashBookPdf } from "@/server/pdf/documents";
import { forbidden, verwaltungAllowed } from "@/server/pdf/guard";
import { fileSlug, loadBrand, pdfResponse } from "@/server/pdf/parts";

/** Kassenbuch als PDF (gleiche Auswahl wie die Seite: ?topf=&von=&bis=). */
export async function GET(request: Request) {
  await connection();
  if (!(await verwaltungAllowed())) return forbidden();
  const q = new URL(request.url).searchParams;
  const db = getDb();
  const [{ pots, potId, from, to, book }, brand] = await Promise.all([
    loadCashBook(db, { topf: q.get("topf") ?? undefined, von: q.get("von") ?? undefined, bis: q.get("bis") ?? undefined }, businessDate(new Date(), 0)),
    loadBrand(db),
  ]);
  const potName = pots.find((p) => p.id === potId)?.name ?? potId;
  return pdfResponse(await renderToBuffer(CashBookPdf({ brand, potName, from, to, book })), `kassenbuch-${fileSlug(potName)}-${from}-bis-${to}.pdf`);
}
