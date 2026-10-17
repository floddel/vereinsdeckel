import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { formatCents } from "@/lib/money";
import { findMemberByToken, getMemberOverview } from "@/server/member-view";
import { BackLink } from "../back-link";

export const metadata: Metadata = { title: "Meine Übersicht" };

export default function UebersichtPage({ params }: PageProps<"/m/[token]/uebersicht">) {
  return (
    <Suspense fallback={<p className="py-16 text-center text-muted-foreground">Übersicht wird geholt …</p>}>
      <Uebersicht params={params} />
    </Suspense>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-3xl bg-card p-4 shadow-soft dark:ring-1 dark:ring-white/5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-heading text-2xl font-bold tabular-nums" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

async function Uebersicht({ params }: Pick<PageProps<"/m/[token]/uebersicht">, "params">) {
  await connection();
  const { token } = await params;
  const db = getDb();
  const m = await findMemberByToken(db, token);
  if (!m) notFound();
  const o = await getMemberOverview(db, m.id);
  return (
    <div className="flex flex-col">
      <BackLink token={token} />
      <h1 className="mb-6 font-heading text-3xl font-bold">Meine Übersicht</h1>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Dieser Monat" value={formatCents(o.monthCents)} testId="monat" />
        <Stat label="Dieses Jahr" value={formatCents(o.yearCents)} testId="jahr" />
        <Stat label="Abende dieses Jahr" value={String(o.eveningsThisYear)} />
        <Stat label="Insgesamt" value={formatCents(o.totalCents)} />
      </div>
      <h2 className="mt-8 mb-3 font-heading text-xl font-bold">Am liebsten</h2>
      {o.favorites.length === 0 ? (
        <p className="text-muted-foreground">Noch nichts gebucht.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {o.favorites.map((f, i) => (
            <li key={f.name} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft dark:ring-1 dark:ring-white/5">
              <span className="grid size-9 place-items-center rounded-full bg-secondary font-heading font-bold text-secondary-foreground">
                {i + 1}
              </span>
              <span className="flex-1 font-semibold">{f.name}</span>
              <span className="tabular-nums text-muted-foreground">{f.quantity}×</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-8 text-sm text-muted-foreground">Keine Ranglisten – niemand wird mit anderen verglichen.</p>
    </div>
  );
}
