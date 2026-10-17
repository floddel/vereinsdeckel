import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { findMemberByToken, getMemberStand } from "@/server/member-view";
import { MemberLive } from "./member-live";

// App-Symbol (Manifest, Name auf dem Home-Bildschirm): siehe layout.tsx
export const metadata: Metadata = { title: "Mein Bierdeckel" };

export default function MemberPage({ params }: PageProps<"/m/[token]">) {
  return (
    <Suspense fallback={<p className="py-16 text-center text-muted-foreground">Dein Bierdeckel wird geholt …</p>}>
      <Member params={params} />
    </Suspense>
  );
}

async function Member({ params }: Pick<PageProps<"/m/[token]">, "params">) {
  await connection();
  const { token } = await params;
  const db = getDb();
  // Das Mitglied ergibt sich ausschließlich aus dem Link.
  const m = await findMemberByToken(db, token);
  if (!m) notFound();
  return <MemberLive token={token} initial={await getMemberStand(db, m)} />;
}
