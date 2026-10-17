import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { getMemberOrders } from "@/server/food-orders";
import { findMemberByToken } from "@/server/member-view";
import { BackLink } from "../back-link";
import { OrderApp } from "./order-app";

export const metadata: Metadata = { title: "Essen bestellen" };

export default function BestellenPage({ params }: PageProps<"/m/[token]/bestellen">) {
  return (
    <Suspense fallback={<p className="py-16 text-center text-muted-foreground">Speisekarte wird geholt …</p>}>
      <Bestellen params={params} />
    </Suspense>
  );
}

async function Bestellen({ params }: Pick<PageProps<"/m/[token]/bestellen">, "params">) {
  await connection();
  const { token } = await params;
  const db = getDb();
  // Das Mitglied ergibt sich ausschließlich aus dem Link.
  const m = await findMemberByToken(db, token);
  if (!m) notFound();
  return (
    <div className="flex flex-col">
      <BackLink token={token} />
      <OrderApp token={token} initial={await getMemberOrders(db, m.id)} />
    </div>
  );
}
