import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ArticleSummary, changePercent, type ReportSummary } from "@/domain/report";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Kennzahl-Kachel, optional mit Veränderung zum Vorzeitraum. */
export function Figure({
  label,
  value,
  hint,
  now,
  before,
  negative,
  testId,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  /** für den Vergleich (Cent oder Anzahl) */
  now?: number;
  before?: number;
  negative?: boolean;
  testId?: string;
}) {
  const change = now !== undefined && before !== undefined ? changePercent(now, before) : null;
  return (
    <Card data-testid={testId} className="break-inside-avoid">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("text-2xl tabular-nums", negative && "text-destructive")}>{value}</CardTitle>
        {(hint || change !== null) && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {change !== null && (
              <span className={cn("inline-flex items-center font-semibold", change >= 0 ? "text-primary" : "text-destructive")}>
                {change >= 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                {change > 0 ? "+" : ""}
                {change} %
              </span>
            )}
            {hint}
          </p>
        )}
      </CardHeader>
    </Card>
  );
}

/** Verkaufte Artikel mit Menge, Umsatz, Wareneinsatz und Rohgewinn – nach Kategorien. */
export function ArticleTable({
  summary,
  categories,
  limit,
}: {
  summary: ReportSummary;
  categories: { id: string; name: string }[];
  /** nur die ersten N je Kategorie (Statistik) */
  limit?: number;
}) {
  const byCat = Map.groupBy(summary.articles, (a) => a.categoryId);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm" data-testid="artikel-auswertung">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Artikel</th>
            <th className="py-2 pr-3 text-right font-medium">Menge</th>
            <th className="py-2 pr-3 text-right font-medium">Umsatz</th>
            <th className="py-2 pr-3 text-right font-medium">Wareneinsatz</th>
            <th className="py-2 text-right font-medium">Rohgewinn</th>
          </tr>
        </thead>
        {categories
          .filter((c) => byCat.has(c.id))
          .map((c) => {
            const rows = byCat.get(c.id)!;
            const shown = limit ? rows.slice(0, limit) : rows;
            return (
              <tbody key={c.id} className="break-inside-avoid">
                <tr>
                  <th colSpan={2} className="pt-4 pb-1 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {c.name}
                  </th>
                  <th className="pt-4 pb-1 pr-3 text-right text-xs font-semibold text-muted-foreground tabular-nums">
                    {formatCents(summary.byCategory[c.id] ?? 0)}
                  </th>
                  <th colSpan={2} />
                </tr>
                {shown.map((a) => (
                  <ArticleRow key={a.articleId} a={a} />
                ))}
                {shown.length < rows.length && (
                  <tr>
                    <td colSpan={5} className="py-1 text-muted-foreground">
                      … und {rows.length - shown.length} weitere
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
      </table>
    </div>
  );
}

function ArticleRow({ a }: { a: ArticleSummary }) {
  return (
    <tr className="border-t">
      <td className="py-1.5 pr-3">{a.name}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{a.quantity}</td>
      <td className="py-1.5 pr-3 text-right font-medium tabular-nums">{formatCents(a.revenueCents)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{a.costCents === null ? "–" : formatCents(a.costCents)}</td>
      <td className="py-1.5 text-right tabular-nums">{a.costCents === null ? "–" : formatCents(a.revenueCents - a.costCents)}</td>
    </tr>
  );
}

/** Hinweis, wenn der Rohgewinn wegen fehlender Einkaufspreise zu hoch ist. */
export function CostHint({ summary }: { summary: ReportSummary }) {
  if (summary.uncostedRevenueCents === 0) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Für Artikel mit {formatCents(summary.uncostedRevenueCents)} Umsatz ist noch kein Einkaufspreis bekannt („–“) – dort fehlt der Wareneinsatz, der
      Rohgewinn ist also etwas zu hoch. Einkaufspreise kommen aus den Einkäufen.
    </p>
  );
}

/** Zahlungen je Zahlungsart mit Trinkgeld. */
export function PaymentTable({ summary, methods }: { summary: ReportSummary; methods: { id: string; label: string }[] }) {
  const used = methods.filter((m) => summary.byMethod[m.id]);
  if (used.length === 0) return <p className="text-muted-foreground">Keine Zahlungen.</p>;
  return (
    <table className="w-full text-sm" data-testid="zahlungen">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="py-2 pr-3 font-medium">Zahlungsart</th>
          <th className="py-2 pr-3 text-right font-medium">fürs Konto</th>
          <th className="py-2 pr-3 text-right font-medium">Trinkgeld</th>
          <th className="py-2 text-right font-medium">eingenommen</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {used.map((m) => {
          const x = summary.byMethod[m.id];
          return (
            <tr key={m.id}>
              <td className="py-1.5 pr-3">{m.label}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatCents(x.amountCents)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatCents(x.tipCents)}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{formatCents(x.amountCents + x.tipCents)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Section({ title, description, children, testId }: { title: string; description?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <Card data-testid={testId} className="break-inside-avoid">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
