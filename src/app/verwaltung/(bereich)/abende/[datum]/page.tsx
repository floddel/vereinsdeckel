import { ChevronLeft, ChevronRight, FileDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/print-button";
import { ArticleTable, CostHint, Figure, PaymentTable, Section } from "@/components/admin/report-parts";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { member } from "@/db/schema";
import { byName } from "@/domain/theke";
import { formatBusinessDayNumeric, formatTimeBerlin } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { getEveningReport, neighbourEvenings } from "@/server/reports";
import { requireVerwaltung } from "@/server/session";
import { getEventPayments, getEventSales } from "@/server/theke/snapshot";
import { EveningBookings } from "./evening-bookings";
import { EveningForm } from "./evening-form";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default function AbendPage({ params }: PageProps<"/verwaltung/abende/[datum]">) {
  return (
    <>
      <Button nativeButton={false} variant="ghost" className="mb-4 -ml-2 text-[15px] text-primary hover:text-primary print:hidden" render={<Link href="/verwaltung/abende" />}>
        <ChevronLeft className="size-5" /> Alle Abende
      </Button>
      <Suspense fallback={<Loading />}>
        <Abschluss params={params} />
      </Suspense>
    </>
  );
}

async function Abschluss({ params }: Pick<PageProps<"/verwaltung/abende/[datum]">, "params">) {
  await requireVerwaltung();
  const { datum } = await params;
  if (!DAY.test(datum)) notFound();
  const db = getDb();
  const [r, nb] = await Promise.all([getEveningReport(db, datum), neighbourEvenings(db, datum)]);
  if (!r) notFound();
  const [sales, payments, members] = await Promise.all([
    getEventSales(db, r.event.id),
    getEventPayments(db, r.event.id),
    db.select({ id: member.id, name: member.name, active: member.active, anonymizedAt: member.anonymizedAt }).from(member),
  ]);
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const activeMembers = members.filter((m) => m.active && !m.anonymizedAt).map(({ id, name }) => ({ id, name })).sort(byName);
  const s = r.summary;
  const onDeckel = s.revenueCents - s.paidCents;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Abendabschluss ${formatBusinessDayNumeric(datum)}`}
        description={
          <>
            {r.event.title && <span className="font-semibold text-foreground">{r.event.title} · </span>}
            {r.receipts} {r.receipts === 1 ? "Bon" : "Bons"} · {r.members} {r.members === 1 ? "Mitglied" : "Mitglieder"} bedient
            {r.event.note && <span className="block">{r.event.note}</span>}
          </>
        }
        actions={
          <>
            <Button nativeButton={false} variant="outline" size="lg" disabled={!nb.prev} render={nb.prev ? <Link href={`/verwaltung/abende/${nb.prev}`} /> : <span />} aria-label="Abend davor">
              <ChevronLeft />
            </Button>
            <Button nativeButton={false} variant="outline" size="lg" disabled={!nb.next} render={nb.next ? <Link href={`/verwaltung/abende/${nb.next}`} /> : <span />} aria-label="Abend danach">
              <ChevronRight />
            </Button>
            <Button nativeButton={false} size="lg" variant="outline" render={<a href={`/api/pdf/abend/${datum}`} target="_blank" rel="noopener" />}>
              <FileDown /> PDF
            </Button>
            <PrintButton />
          </>
        }
      />

      <EveningForm id={r.event.id} title={r.event.title} note={r.event.note} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-3">
        <Figure label="Umsatz" value={formatCents(s.revenueCents)} hint={s.reversedCents > 0 ? `nach Stornos (−${formatCents(s.reversedCents)})` : undefined} testId="abend-umsatz" />
        <Figure label="Bezahlt (fürs Konto)" value={formatCents(s.paidCents)} testId="abend-bezahlt" />
        <Figure label="Trinkgeld" value={formatCents(s.tipCents)} testId="abend-trinkgeld" />
        <Figure
          label={onDeckel >= 0 ? "Neu auf den Deckeln" : "Mehr bezahlt als verkauft"}
          value={formatCents(Math.abs(onDeckel))}
          hint={onDeckel >= 0 ? "Umsatz − bezahlt" : "es wurden auch ältere Deckel bezahlt"}
          testId="abend-deckel"
        />
        <Figure label="Wareneinsatz" value={formatCents(s.costCents)} hint="zum Ø Einkaufspreis" testId="abend-wareneinsatz" />
        <Figure label="Rohgewinn" value={formatCents(s.profitCents)} hint="Umsatz − Wareneinsatz, ohne Trinkgeld" negative={s.profitCents < 0} testId="abend-gewinn" />
      </div>

      <Section title="Einnahmen" description="Was an diesem Abend in Handkasse und PayPal geflossen ist – zum Abgleich beim Kasse-Zählen.">
        <PaymentTable summary={s} methods={r.methods} />
      </Section>

      <Section title="Verkauft" description={s.guestCents > 0 ? `Davon für Gäste: ${formatCents(s.guestCents)}.` : undefined}>
        {s.articles.length === 0 ? <p className="text-muted-foreground">Nichts verkauft.</p> : <ArticleTable summary={s} categories={r.categories} />}
        <div className="mt-3">
          <CostHint summary={s} />
        </div>
      </Section>

      {r.reversals.length > 0 && (
        <Section title="Stornos" description={`Zusammen ${formatCents(s.reversedCents)}.`} testId="abend-stornos">
          <ul className="flex flex-col divide-y text-sm">
            {r.reversals.map((x, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-x-4 py-1.5">
                <span>
                  {formatTimeBerlin(x.at.toISOString())} · {x.memberName} · {x.items}
                </span>
                <span className="text-muted-foreground">
                  {x.reason} · −{formatCents(x.totalCents)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="print:hidden">
        <Section
          title="Bons und Zahlungen"
          description="Fehler korrigieren – auch nachträglich: Storno, Umbuchen oder Zahlung stornieren. Die Korrektur zählt zu diesem Abend."
          testId="abend-bons"
        >
          <EveningBookings sales={sales} payments={payments} names={names} activeMembers={activeMembers} />
        </Section>
      </div>
    </div>
  );
}
