import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import { findMemberByToken, getMemberReceipts } from "@/server/member-view";
import { BackLink } from "../back-link";
import { ReceiptList } from "./receipt-list";

export const metadata: Metadata = { title: "Meine Kassenzettel" };

export default function ZettelPage({ params }: PageProps<"/m/[token]/zettel">) {
  return (
    <Suspense fallback={<p className="py-16 text-center text-muted-foreground">Kassenzettel werden geholt …</p>}>
      <Zettel params={params} />
    </Suspense>
  );
}

async function Zettel({ params }: Pick<PageProps<"/m/[token]/zettel">, "params">) {
  await connection();
  const { token } = await params;
  const db = getDb();
  const m = await findMemberByToken(db, token);
  if (!m) notFound();
  const [[s], first] = await Promise.all([db.select({ clubName: settings.clubName }).from(settings), getMemberReceipts(db, m.id)]);
  return (
    <div className="flex flex-col items-center">
      <BackLink token={token} />
      <h1 className="mb-6 self-start font-heading text-3xl font-bold">Meine Kassenzettel</h1>
      <ReceiptList token={token} clubName={s?.clubName ?? "Verein"} initial={first} />
    </div>
  );
}
