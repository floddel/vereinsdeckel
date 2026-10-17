import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { article } from "@/db/schema";
import { SOURCE_LABEL } from "@/domain/purchase";
import { costPerUnitCents, isServed } from "@/domain/stock";
import { formatVolume } from "@/domain/volume";
import { formatBusinessDayNumeric } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { getPurchase } from "@/server/purchases";
import { requireVerwaltung } from "@/server/session";
import { ReversePurchaseButton } from "./reverse-button";

const UUID = /^[0-9a-f-]{36}$/i;

export default function EinkaufPage({ params }: PageProps<"/verwaltung/einkaeufe/[id]">) {
  return (
    <>
      <Button nativeButton={false} variant="ghost" className="mb-4 -ml-2 text-[15px] text-primary hover:text-primary" render={<Link href="/verwaltung/einkaeufe" />}>
        <ChevronLeft className="size-5" /> Alle Einkäufe
      </Button>
      <Suspense fallback={<Loading />}>
        <Detail params={params} />
      </Suspense>
    </>
  );
}

async function Detail({ params }: Pick<PageProps<"/verwaltung/einkaeufe/[id]">, "params">) {
  await requireVerwaltung();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = getDb();
  const p = await getPurchase(db, id);
  if (!p || p.reversesPurchaseId) notFound();
  const articles = new Map(
    (
      await db
        .select({ id: article.id, priceCents: article.priceCents, servingMl: article.servingMl, bottleMl: article.bottleMl, packSize: article.packSize })
        .from(article)
    ).map((a) => [a.id, a]),
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Einkauf vom {formatBusinessDayNumeric(p.purchasedOn)}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{SOURCE_LABEL[p.source]}</Badge>
            {p.reversedReason && <Badge variant="outline">storniert: {p.reversedReason}</Badge>}
          </p>
          {p.note && <p className="mt-2 text-muted-foreground">{p.note}</p>}
        </div>
        {!p.reversedReason && <ReversePurchaseButton id={p.id} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Positionen</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {p.lines.map((l, i) => {
              const a = l.articleId ? articles.get(l.articleId) : undefined;
              const served = a && isServed(a);
              const unit = served ? `je ${formatVolume(a.servingMl!)}` : "je Stück";
              return (
                <li key={i} className="flex items-start justify-between gap-4 py-2">
                  <div>
                    <p className="font-medium">
                      {l.quantity}× {l.bottleMl ? `${formatVolume(l.bottleMl)} ` : ""}
                      {l.description}
                    </p>
                    {a && (
                      <p className="text-sm text-muted-foreground">
                        {l.totalCents === null
                          ? "Preis nicht einzeln erfasst"
                          : `${unit} ${formatCents(costPerUnitCents(a, l.totalCents, l.quantity, l.bottleMl))}`}
                        {` · Vereinspreis heute ${formatCents(a.priceCents)}`}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 tabular-nums">{l.totalCents === null ? "–" : formatCents(l.totalCents)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 flex justify-between border-t pt-2 font-heading text-lg font-bold">
            Summe <span className="tabular-nums">{formatCents(p.totalCents)}</span>
          </p>
        </CardContent>
      </Card>

      {p.receiptFileId && (
        <Card>
          <CardHeader>
            <CardTitle>Beleg</CardTitle>
          </CardHeader>
          <CardContent>
            <a href={`/api/beleg/${p.receiptFileId}`} target="_blank" rel="noopener">
              {/* eslint-disable-next-line @next/next/no-img-element -- geschütztes Belegfoto, nur angemeldet */}
              <img src={`/api/beleg/${p.receiptFileId}`} alt="Beleg" className="max-h-[32rem] rounded-lg ring-1 ring-foreground/10" />
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
