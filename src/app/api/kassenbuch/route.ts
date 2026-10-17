import { connection } from "next/server";
import { getDb } from "@/db/client";
import { businessDate } from "@/domain/business-date";
import { cashBookCsv } from "@/domain/cash-book";
import { loadCashBook } from "@/server/cash-book-query";
import { getAdminSession, isPinUnlocked } from "@/server/session";

/** Kassenbuch als CSV (für den Kassenwart, Excel/LibreOffice). Nur angemeldet und mit PIN. */
export async function GET(request: Request) {
  await connection();
  if (!(await getAdminSession()) || !(await isPinUnlocked())) return new Response("Nicht erlaubt", { status: 401 });
  const q = new URL(request.url).searchParams;
  const { pots, potId, from, to, book } = await loadCashBook(
    getDb(),
    { topf: q.get("topf") ?? undefined, von: q.get("von") ?? undefined, bis: q.get("bis") ?? undefined },
    businessDate(new Date(), 0),
  );
  const name = pots.find((p) => p.id === potId)?.name ?? potId;
  const file = `kassenbuch-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${from}-bis-${to}.csv`;
  return new Response(cashBookCsv(book, name), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
