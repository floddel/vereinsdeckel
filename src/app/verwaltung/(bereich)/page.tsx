import { count, eq } from "drizzle-orm";
import { ChevronRight, ShoppingCart, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { article, member, settings } from "@/db/schema";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getPotOverview } from "@/server/cash";
import { listOpenBalances } from "@/server/queries/members";
import { getStockOverview } from "@/server/stock";
import { requireVerwaltung } from "@/server/session";

export default function VerwaltungPage() {
  return (
    <>
      <PageHeader title="Übersicht" />
      <Suspense fallback={<Loading />}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  await requireVerwaltung();
  const db = getDb();
  const [pots, open, stock, [s], [members], [articles]] = await Promise.all([
    getPotOverview(db),
    listOpenBalances(),
    getStockOverview(db),
    db.select({ warn: settings.warnLimitCents, setupDoneAt: settings.setupDoneAt }).from(settings),
    db.select({ n: count() }).from(member).where(eq(member.active, true)),
    db.select({ n: count() }).from(article).where(eq(article.active, true)),
  ]);
  const openTotal = open.reduce((sum, m) => sum + m.openCents, 0);
  const warn = s?.warn ?? 0;
  const restock = stock.rows.filter((r) => r.restock);

  return (
    <div className="flex flex-col gap-6">
      {!s?.setupDoneAt && (
        <Link
          href="/verwaltung/einrichtung"
          data-testid="einrichtung-fortsetzen"
          className="flex items-center gap-3 rounded-3xl bg-highlight p-5 text-highlight-foreground shadow-soft"
        >
          <Sparkles className="size-6 shrink-0" aria-hidden />
          <span className="flex-1">
            <span className="block text-lg font-bold">Einrichtung fortsetzen</span>
            <span className="text-sm opacity-90">Verein, Sicherheit, Datenschutz, Artikel – Schritt für Schritt.</span>
          </span>
          <ChevronRight className="size-6 shrink-0" aria-hidden />
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {pots.pots.map((p) => (
          <Kpi key={p.id} href="/verwaltung/kasse" label={p.name} value={formatCents(p.balanceCents)} negative={p.balanceCents < 0} testId={`kpi-${p.id}`} />
        ))}
        <Kpi href="/verwaltung/kasse" label="Deine Auslagen" value={formatCents(pots.advancesCents)} testId="kpi-auslagen" />
        <Kpi href="/verwaltung/bestand" label="Warenwert im Lager" value={formatCents(stock.valueCents)} testId="kpi-warenwert" />
        <Kpi label={`Offen bei ${open.length} ${open.length === 1 ? "Mitglied" : "Mitgliedern"}`} value={formatCents(openTotal)} testId="kpi-offen" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Offene Beträge</CardTitle>
            <CardDescription>Höchste zuerst{warn > 0 && ` · über ${formatCents(warn)} markiert`}.</CardDescription>
          </CardHeader>
          <CardContent>
            {open.length === 0 ? (
              <p className="text-muted-foreground">Alle Deckel sind beglichen.</p>
            ) : (
              <ul className="flex flex-col divide-y" data-testid="offene-betraege">
                {open.slice(0, 10).map((m) => (
                  <li key={m.id}>
                    <Link href={`/verwaltung/mitglieder/${m.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-primary">
                      <span className="truncate font-medium">{m.name}</span>
                      <span className={cn("flex shrink-0 items-center gap-1 tabular-nums", warn > 0 && m.openCents >= warn && "font-semibold text-highlight")}>
                        {warn > 0 && m.openCents >= warn && <TriangleAlert className="size-4" aria-label="über dem Limit" />}
                        {formatCents(m.openCents)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {open.length > 10 && <p className="mt-2 text-sm text-muted-foreground">… und {open.length - 10} weitere.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="size-5" /> Nachkaufen
            </CardTitle>
            <CardDescription>Reicht keine {stock.thresholdEvenings} Abende mehr.</CardDescription>
          </CardHeader>
          <CardContent>
            {restock.length === 0 ? (
              <p className="text-muted-foreground">Alles da.</p>
            ) : (
              <p data-testid="nachkaufen">{restock.map((r) => r.name).join(", ")}</p>
            )}
            <Link href="/verwaltung/bestand" className="mt-3 inline-flex items-center gap-1 font-semibold text-primary">
              Zum Bestand <ChevronRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground">
        {members.n} aktive Mitglieder · {articles.n} aktive Artikel
      </p>
    </div>
  );
}

function Kpi({ label, value, href, negative, testId }: { label: string; value: string; href?: string; negative?: boolean; testId: string }) {
  const card = (
    <Card data-testid={testId} className={cn("h-full", href && "transition hover:ring-2 hover:ring-primary")}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {/* Schrift wächst mit der Kachel – auch fünfstellige Beträge passen in schmale Kacheln */}
        <CardTitle className={cn("text-[clamp(1.25rem,14cqi,1.875rem)] tabular-nums whitespace-nowrap", negative && "text-destructive")}>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
  return href ? <Link href={href} className="h-full">{card}</Link> : card;
}
