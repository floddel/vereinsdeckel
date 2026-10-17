import { ChevronLeft, Download, FileDown } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDb } from "@/db/client";
import { businessDate } from "@/domain/business-date";
import { formatBusinessDayNumeric } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { loadCashBook } from "@/server/cash-book-query";
import { requireVerwaltung } from "@/server/session";

export default function KassenbuchPage({ searchParams }: PageProps<"/verwaltung/kasse/kassenbuch">) {
  return (
    <>
      <Button nativeButton={false} variant="ghost" className="mb-4 -ml-2 text-[15px] text-primary hover:text-primary" render={<Link href="/verwaltung/kasse" />}>
        <ChevronLeft className="size-5" /> Kasse
      </Button>
      <PageHeader title="Kassenbuch" description="Alle Ein- und Ausgänge eines Topfs mit laufendem Bestand. Mitgliederzahlungen stehen je Abend in einer Zeile." />
      <Suspense fallback={<Loading />}>
        <Book searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Book({ searchParams }: Pick<PageProps<"/verwaltung/kasse/kassenbuch">, "searchParams">) {
  await requireVerwaltung();
  const { pots, potId, from, to, book } = await loadCashBook(getDb(), await searchParams, businessDate(new Date(), 0));
  const query = new URLSearchParams({ topf: potId, von: from, bis: to });
  const csv = `/api/kassenbuch?${query}`;
  const pdf = `/api/kassenbuch/pdf?${query}`;
  const amount = (c: number) => (c ? formatCents(c) : "");

  return (
    <div className="flex flex-col gap-6">
      {/* normales Formular: funktioniert auch ohne JavaScript */}
      <form className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Topf
          <NativeSelect name="topf" defaultValue={potId} className="h-10 w-44">
            {pots.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Von
          <Input type="date" name="von" defaultValue={from} className="h-10 w-44" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Bis
          <Input type="date" name="bis" defaultValue={to} className="h-10 w-44" />
        </label>
        <Button type="submit" size="lg" variant="outline" className="h-10">
          Anzeigen
        </Button>
        <Button nativeButton={false} size="lg" className="h-10" render={<a href={csv} download />}>
          <Download /> Als CSV herunterladen
        </Button>
        <Button nativeButton={false} size="lg" variant="outline" className="h-10" render={<a href={pdf} target="_blank" rel="noopener" />}>
          <FileDown /> Als PDF
        </Button>
      </form>

      <Card>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm" data-testid="kassenbuch">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Datum</th>
                <th className="py-2 pr-3 font-medium">Vorgang</th>
                <th className="py-2 pr-3 text-right font-medium">Einnahme</th>
                <th className="py-2 pr-3 text-right font-medium">Ausgabe</th>
                <th className="py-2 text-right font-medium">Bestand</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="py-2 pr-3 tabular-nums">{formatBusinessDayNumeric(from)}</td>
                <td className="py-2 pr-3 font-medium">Übertrag</td>
                <td />
                <td />
                <td className="py-2 text-right font-semibold tabular-nums">{formatCents(book.openingCents)}</td>
              </tr>
              {book.rows.map((r, i) => (
                <tr key={i}>
                  <td className="py-2 pr-3 align-top tabular-nums">{formatBusinessDayNumeric(r.date)}</td>
                  <td className="py-2 pr-3">
                    <p className="font-medium">{r.title}</p>
                    {r.detail && <p className="text-muted-foreground">{r.detail}</p>}
                  </td>
                  <td className="py-2 pr-3 text-right align-top text-primary tabular-nums">{amount(Math.max(r.amountCents, 0))}</td>
                  <td className="py-2 pr-3 text-right align-top tabular-nums">{amount(Math.max(-r.amountCents, 0))}</td>
                  <td className={cn("py-2 text-right align-top font-semibold tabular-nums", r.balanceCents < 0 && "text-destructive")}>
                    {formatCents(r.balanceCents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-2 pr-3 tabular-nums">{formatBusinessDayNumeric(to)}</td>
                <td className="py-2 pr-3">Summe · Endbestand</td>
                <td className="py-2 pr-3 text-right text-primary tabular-nums">{formatCents(book.inCents)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatCents(book.outCents)}</td>
                <td className="py-2 text-right tabular-nums" data-testid="endbestand">
                  {formatCents(book.closingCents)}
                </td>
              </tr>
            </tfoot>
          </table>
          {book.rows.length === 0 && <p className="py-4 text-muted-foreground">Keine Vorgänge in diesem Zeitraum.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
