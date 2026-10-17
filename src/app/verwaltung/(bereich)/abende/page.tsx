import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { formatBusinessDayNumeric } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { listEvenings } from "@/server/reports";
import { requireVerwaltung } from "@/server/session";

export default function AbendePage() {
  return (
    <>
      <PageHeader
        title="Abende"
        description="Jeder Tag mit Buchungen ist ein Abend (Wechsel um 6 Uhr morgens). Antippen für den Abendabschluss."
      />
      <Suspense fallback={<Loading />}>
        <Abende />
      </Suspense>
    </>
  );
}

async function Abende() {
  await requireVerwaltung();
  const evenings = await listEvenings(getDb());
  if (evenings.length === 0) {
    return <p className="text-muted-foreground">Noch keine Abende – der erste entsteht mit der ersten Buchung an der Theke.</p>;
  }
  return (
    <Card>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm" data-testid="abende">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Abend</th>
              <th className="py-2 pr-3 text-right font-medium">Umsatz</th>
              <th className="py-2 pr-3 text-right font-medium">Bezahlt</th>
              <th className="py-2 pr-3 text-right font-medium">Trinkgeld</th>
              <th className="py-2 pr-3 text-right font-medium">Rohgewinn</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {evenings.map((e) => (
              <tr key={e.id} className="relative hover:bg-muted/50">
                <td className="py-2.5 pr-3">
                  <Link href={`/verwaltung/abende/${e.businessDate}`} className="font-medium after:absolute after:inset-0">
                    {formatBusinessDayNumeric(e.businessDate)}
                  </Link>
                  {e.title && <span className="text-muted-foreground"> · {e.title}</span>}
                </td>
                <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{formatCents(e.revenueCents)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{formatCents(e.paidCents)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{formatCents(e.tipCents)}</td>
                <td className={cn("py-2.5 pr-3 text-right tabular-nums", e.profitCents < 0 && "text-destructive")}>
                  {formatCents(e.profitCents)}
                  {e.profitIncomplete && <span title="Für manche Artikel fehlt der Einkaufspreis">*</span>}
                </td>
                <td>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {evenings.some((e) => e.profitIncomplete) && (
          <p className="mt-3 text-sm text-muted-foreground">* Für manche verkauften Artikel ist noch kein Einkaufspreis bekannt – der Rohgewinn ist dort zu hoch.</p>
        )}
      </CardContent>
    </Card>
  );
}
