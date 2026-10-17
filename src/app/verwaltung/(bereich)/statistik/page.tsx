import { Download } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { RevenueChart, ShareBars } from "@/components/admin/bar-chart";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/print-button";
import { ArticleTable, CostHint, Figure, PaymentTable, Section } from "@/components/admin/report-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDb } from "@/db/client";
import { businessDate } from "@/domain/business-date";
import { type Period, PERIOD_PRESETS, type PeriodPreset, PRESET_LABEL, presetPeriod } from "@/domain/report";
import { describeStock } from "@/domain/stock";
import { formatVolume, oneDecimal } from "@/domain/volume";
import { formatBusinessDayNumeric } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { EXPORTS } from "@/server/exports";
import { getPeriodReport } from "@/server/reports";
import { requireVerwaltung } from "@/server/session";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fmt = { volume: formatVolume, decimal: oneDecimal };

export default function StatistikPage({ searchParams }: PageProps<"/verwaltung/statistik">) {
  return (
    <>
      <PageHeader
        title="Statistik"
        description="Umsatz, Wareneinsatz und Rohgewinn im gewählten Zeitraum – im Vergleich zum Zeitraum davor. Keine Auswertung einzelner Mitglieder."
        actions={<PrintButton />}
      />
      <Suspense fallback={<Loading />}>
        <Statistik searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** Zeitraum aus der Adresse: ?zeitraum=monat … oder ?von=…&bis=… (sonst: dieser Monat). */
function readPeriod(q: Record<string, string | string[] | undefined>, today: string): { period: Period; preset: PeriodPreset | null } {
  const von = typeof q.von === "string" ? q.von : "";
  const bis = typeof q.bis === "string" ? q.bis : "";
  if (DAY.test(von) && DAY.test(bis) && von <= bis && Date.parse(bis) - Date.parse(von) <= 5 * 366 * 86_400_000) {
    return { period: { from: von, to: bis }, preset: null };
  }
  const preset = (PERIOD_PRESETS as readonly string[]).includes(String(q.zeitraum)) ? (q.zeitraum as PeriodPreset) : "monat";
  return { period: presetPeriod(preset, today), preset };
}

async function Statistik({ searchParams }: Pick<PageProps<"/verwaltung/statistik">, "searchParams">) {
  await requireVerwaltung();
  // Kalendertag in Berlin
  const today = businessDate(new Date(), 0);
  const { period, preset } = readPeriod(await searchParams, today);
  const r = await getPeriodReport(getDb(), period);
  const s = r.summary;
  const p = r.previousSummary;
  const avg = r.evenings ? Math.round(s.revenueCents / r.evenings) : 0;
  const prevAvg = r.previousEvenings ? Math.round(p.revenueCents / r.previousEvenings) : 0;
  const catName = new Map(r.categories.map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Zeitraum" className="flex flex-col gap-3 print:hidden">
        <div className="flex flex-wrap gap-2">
          {PERIOD_PRESETS.map((x) => (
            <Button
              key={x}
              nativeButton={false}
              variant={preset === x ? "default" : "outline"}
              aria-current={preset === x ? "true" : undefined}
              render={<Link href={`/verwaltung/statistik?zeitraum=${x}`} />}
            >
              {PRESET_LABEL[x]}
            </Button>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Von
            <Input type="date" name="von" defaultValue={period.from} className="h-9 w-40" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Bis
            <Input type="date" name="bis" defaultValue={period.to} className="h-9 w-40" />
          </label>
          <Button type="submit" variant="outline">
            Anzeigen
          </Button>
        </form>
      </nav>

      <p className="font-semibold" data-testid="zeitraum">
        {formatBusinessDayNumeric(period.from)} – {formatBusinessDayNumeric(period.to)}
        <span className="font-normal text-muted-foreground">
          {" "}
          · verglichen mit {formatBusinessDayNumeric(r.previous.from)} – {formatBusinessDayNumeric(r.previous.to)}
        </span>
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
        <Figure label="Umsatz" value={formatCents(s.revenueCents)} now={s.revenueCents} before={p.revenueCents} hint={`vorher ${formatCents(p.revenueCents)}`} testId="stat-umsatz" />
        <Figure label="Rohgewinn" value={formatCents(s.profitCents)} now={s.profitCents} before={p.profitCents} negative={s.profitCents < 0} hint={`vorher ${formatCents(p.profitCents)}`} testId="stat-gewinn" />
        <Figure label="Wareneinsatz" value={formatCents(s.costCents)} hint="zum Ø Einkaufspreis" testId="stat-wareneinsatz" />
        <Figure label="Trinkgeld" value={formatCents(s.tipCents)} now={s.tipCents} before={p.tipCents} testId="stat-trinkgeld" />
        <Figure label="Abende" value={String(r.evenings)} now={r.evenings} before={r.previousEvenings} hint={`vorher ${r.previousEvenings}`} testId="stat-abende" />
        <Figure label="Ø Umsatz je Abend" value={formatCents(avg)} now={avg} before={prevAvg} testId="stat-schnitt" />
        <Figure label="Eingegangen (fürs Konto)" value={formatCents(s.paidCents)} hint="bar und PayPal, ohne Trinkgeld" testId="stat-bezahlt" />
        <Figure label="Storniert" value={formatCents(s.reversedCents)} hint={s.guestCents ? `Gäste-Umsatz ${formatCents(s.guestCents)}` : undefined} testId="stat-storno" />
      </div>

      <Section title={r.seriesBy === "month" ? "Verlauf je Monat" : "Verlauf je Abend"}>
        <RevenueChart points={r.series} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Umsatz nach Kategorien">
          <ShareBars items={r.categories.filter((c) => s.byCategory[c.id]).map((c) => ({ label: catName.get(c.id) ?? c.id, cents: s.byCategory[c.id] }))} />
        </Section>
        <Section title="Einnahmen" description="Fürs Konto und Trinkgeld je Zahlungsart.">
          <PaymentTable summary={s} methods={r.methods} />
        </Section>
      </div>

      <Section title="Renner" description="Die umsatzstärksten Artikel je Kategorie.">
        {s.articles.length === 0 ? <p className="text-muted-foreground">Nichts verkauft.</p> : <ArticleTable summary={s} categories={r.categories} limit={10} />}
        <div className="mt-3">
          <CostHint summary={s} />
        </div>
      </Section>

      <Section title="Ladenhüter" description="Im Zeitraum nicht verkauft, aber noch auf Lager." testId="ladenhueter">
        {r.slowMovers.length === 0 ? (
          <p className="text-muted-foreground">Keine – alles, was da ist, wurde auch verkauft.</p>
        ) : (
          <ul className="flex flex-col divide-y text-sm">
            {r.slowMovers.map((x) => (
              <li key={x.articleId} className="flex justify-between gap-4 py-1.5">
                <span className="font-medium">{x.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {describeStock(x, x.stock, fmt)}
                  {x.valueCents !== null && ` · ${formatCents(x.valueCents)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section
        title="Exporte (CSV)"
        description="Für Excel oder LibreOffice. Mit Datum: für den gewählten Zeitraum. Das Kassenbuch gibt es unter Kasse."
        testId="exporte"
      >
        <ul className="grid gap-2 sm:grid-cols-2 print:hidden">
          {Object.entries(EXPORTS).map(([kind, x]) => (
            <li key={kind}>
              <a
                href={`/api/export/${kind}?${new URLSearchParams({ von: period.from, bis: period.to })}`}
                download
                className="flex items-center gap-2 rounded-full bg-secondary px-4 py-2 font-medium hover:bg-muted"
              >
                <Download className="size-4 shrink-0 text-primary" /> {x.label}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
