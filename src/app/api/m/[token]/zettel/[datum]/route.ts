import { renderToBuffer } from "@react-pdf/renderer";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { findMemberByToken, getMemberReceipt } from "@/server/member-view";
import { ReceiptPdf } from "@/server/pdf/documents";
import { loadClubName, pdfResponse } from "@/server/pdf/parts";
import { hit, tooManyRequests } from "@/server/rate-limit";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** PDFs sind aufwendig: je Mitglied 10 in 5 Minuten, insgesamt 30 pro Minute (Theke bleibt flott). */
const PDF_LIMIT_PER_MEMBER = { max: 10, windowMs: 5 * 60_000 };
const PDF_LIMIT_TOTAL = { max: 30, windowMs: 60_000 };

/** Kassenzettel eines Abends als PDF – nur über den persönlichen Link, nur eigene Daten. */
export async function GET(_request: Request, ctx: RouteContext<"/api/m/[token]/zettel/[datum]">) {
  await connection();
  const { token, datum } = await ctx.params;
  if (!DAY.test(datum)) return new Response("Nicht gefunden", { status: 404 });
  const db = getDb();
  const m = await findMemberByToken(db, token);
  if (!m) return new Response("Link ungültig", { status: 404 });
  for (const [key, { max, windowMs }] of [[`zettel-pdf:${m.id}`, PDF_LIMIT_PER_MEMBER], ["zettel-pdf", PDF_LIMIT_TOTAL]] as const) {
    const limit = hit(key, max, windowMs);
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);
  }
  const [receipt, clubName] = await Promise.all([getMemberReceipt(db, m.id, datum), loadClubName(db)]);
  if (!receipt) return new Response("Nicht gefunden", { status: 404 });
  return pdfResponse(await renderToBuffer(ReceiptPdf({ clubName, memberName: m.name, receipt })), `kassenzettel-${datum}.pdf`, true);
}
