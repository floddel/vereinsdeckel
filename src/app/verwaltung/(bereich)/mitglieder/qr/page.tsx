import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { member, memberToken, settings } from "@/db/schema";
import { qrSvg } from "@/lib/qr";
import { getAppOrigin, memberUrl } from "@/server/app-url";
import { requireVerwaltung } from "@/server/session";
import { TestAddressWarning } from "@/components/admin/test-address-warning";
import { PrintButton } from "@/components/admin/print-button";

const UUID = /^[0-9a-f-]{36}$/i;

export default function QrPage({ searchParams }: PageProps<"/verwaltung/mitglieder/qr">) {
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="QR-Codes drucken"
          description="8 Karten pro A4-Blatt zum Ausschneiden. Jede Karte führt zum persönlichen Bierdeckel des Mitglieds."
          actions={<PrintButton />}
        />
      </div>
      <Suspense fallback={<Loading />}>
        <Cards searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Cards({ searchParams }: Pick<PageProps<"/verwaltung/mitglieder/qr">, "searchParams">) {
  await requireVerwaltung();
  const { ids } = await searchParams;
  const selected = typeof ids === "string" ? ids.split(",").filter((id) => UUID.test(id)) : [];
  const db = getDb();
  const [s] = await db.select({ clubName: settings.clubName }).from(settings);
  const rows = await db
    .select({ name: member.name, token: memberToken.token })
    .from(member)
    .innerJoin(memberToken, and(eq(memberToken.memberId, member.id), isNull(memberToken.revokedAt)))
    .where(
      and(
        isNull(member.anonymizedAt),
        selected.length ? inArray(member.id, selected) : eq(member.active, true),
      ),
    )
    .orderBy(asc(member.name));
  const origin = await getAppOrigin();
  const cards = await Promise.all(
    rows.map(async (r) => ({ ...r, svg: await qrSvg(memberUrl(origin, r.token)) })),
  );

  if (cards.length === 0) return <p className="text-muted-foreground">Keine Mitglieder mit aktivem Link.</p>;

  return (
    <>
      <TestAddressWarning origin={origin} />
      <div className="qr-sheet grid grid-cols-1 gap-4 sm:grid-cols-2 print:gap-0">
        {cards.map((c) => (
          <article
            key={c.token}
            className="qr-card flex items-center gap-4 rounded-xl border border-dashed bg-white p-4 text-black"
          >
            <div className="w-32 shrink-0" dangerouslySetInnerHTML={{ __html: c.svg }} />
            <div className="min-w-0">
              <p className="text-sm text-neutral-600">{s?.clubName}</p>
              <p className="text-xl font-bold">{c.name}</p>
              <p className="mt-2 text-sm leading-snug">
                Dein Bierdeckel: mit der Handy-Kamera scannen und auf dem Homescreen speichern. Nicht weitergeben.
              </p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
