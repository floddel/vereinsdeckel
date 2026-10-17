import { asc } from "drizzle-orm";
import type { Db } from "@/db/client";
import { pot } from "@/db/schema";
import { buildCashBook, type CashBook } from "@/domain/cash-book";
import { getCashBookEntries } from "./cash";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Filter aus der Adresse (?topf=cash&von=2026-01-01&bis=2026-12-31), Unsinn wird ignoriert. */
export async function loadCashBook(
  db: Db,
  params: { topf?: string | string[]; von?: string | string[]; bis?: string | string[] },
  today: string,
): Promise<{ pots: { id: string; name: string }[]; potId: string; from: string; to: string; book: CashBook }> {
  const pots = await db.select({ id: pot.id, name: pot.name }).from(pot).orderBy(asc(pot.sortOrder));
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? "";
  const potId = pots.some((p) => p.id === one(params.topf)) ? one(params.topf) : (pots[0]?.id ?? "cash");
  // Standard: das laufende Jahr
  const from = DAY.test(one(params.von)) ? one(params.von) : `${today.slice(0, 4)}-01-01`;
  const to = DAY.test(one(params.bis)) ? one(params.bis) : today;
  return { pots, potId, from, to, book: buildCashBook(await getCashBookEntries(db, potId), from, to) };
}
