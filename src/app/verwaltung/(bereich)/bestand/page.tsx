import { ClipboardList, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { describeStock, isServed } from "@/domain/stock";
import { formatVolume, oneDecimal } from "@/domain/volume";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getStockOverview, listInventories, type StockRow } from "@/server/stock";
import { requireVerwaltung } from "@/server/session";

const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
const num = (n: number) => String(n).replace(".", ",");
const fmt = { volume: formatVolume, decimal: oneDecimal };
/** Ø je Abend: Stück bzw. Portionen („Ø 10 × 4 cl“) */
const avgText = (r: StockRow) => (r.avgPerEvening === null ? "–" : isServed(r) ? `${num(r.avgPerEvening)} × ${formatVolume(r.servingMl!)}` : num(r.avgPerEvening));

export default function BestandPage() {
  return (
    <>
      <PageHeader
        title="Bestand"
        description="Berechnet aus Einkäufen und Verkäufen (seit der letzten Inventur). Reichweite nach dem Durchschnitt der letzten 10 Abende."
        actions={
          <Button nativeButton={false} size="lg" render={<Link href="/verwaltung/bestand/inventur" />}>
            <ClipboardList /> Inventur machen
          </Button>
        }
      />
      <Suspense fallback={<Loading />}>
        <Bestand />
      </Suspense>
    </>
  );
}

function reachText(r: StockRow) {
  if (r.stock <= 0) return "leer";
  if (r.reach === null) return "noch nichts verkauft";
  if (r.reach === 0) return "reicht keinen Abend mehr";
  return `reicht ca. ${r.reach} ${r.reach === 1 ? "Abend" : "Abende"}`;
}

async function Bestand() {
  await requireVerwaltung();
  const db = getDb();
  const [{ rows, thresholdEvenings, lastInventoryAt, valueCents, unpricedCount }, inventories] = await Promise.all([
    getStockOverview(db),
    listInventories(db, 5),
  ]);
  const shopping = rows.filter((r) => r.restock);
  const negative = rows.some((r) => r.stock < 0);

  return (
    <div className="flex flex-col gap-6">
      {(!lastInventoryAt || negative) && (
        <p className="max-w-3xl rounded-2xl bg-highlight/10 p-4">
          {lastInventoryAt
            ? "Bei manchen Artikeln ist der Bestand unter null – vermutlich fehlt ein Einkauf. Einkäufe nachtragen oder eine Inventur machen."
            : "Tipp: Mach zu Beginn einmal eine Inventur (alles zählen). Ab dann stimmt der Bestand, weil Einkäufe und Verkäufe automatisch mitgerechnet werden."}
        </p>
      )}

      <Card data-testid="warenwert">
        <CardHeader>
          <CardTitle>Warenwert: {formatCents(valueCents)}</CardTitle>
          <CardDescription>
            Was im Lager steht, zum durchschnittlichen Einkaufspreis aller Einkäufe (inkl. Anfangsbestand), ohne Pfand.
            {unpricedCount > 0 &&
              ` ${unpricedCount} ${unpricedCount === 1 ? "Artikel hat" : "Artikel haben"} noch keinen Einkaufspreis und ${unpricedCount === 1 ? "fehlt" : "fehlen"} in der Summe.`}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card data-testid="einkaufsliste">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="size-5" /> Einkaufsliste
          </CardTitle>
          <CardDescription>
            Alles, was keine {thresholdEvenings} Abende mehr reicht (Schwelle in den Einstellungen). Ø = Verkauf je Abend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shopping.length === 0 ? (
            <p className="text-muted-foreground">Alles da – nichts nachzukaufen.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {shopping.map((r) => (
                <li key={r.articleId} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    noch {describeStock(r, r.stock, fmt)} · {reachText(r)}
                    {r.avgPerEvening !== null && ` · Ø ${avgText(r)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alle Artikel</CardTitle>
          <CardDescription>
            {lastInventoryAt ? `Letzte Inventur: ${dateTime.format(lastInventoryAt)}` : "Noch keine Inventur"} · Artikel ohne Bestandsführung (z. B. Spenden) fehlen hier.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm" data-testid="bestand">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Artikel</th>
                <th className="py-2 pr-3 text-right font-medium">Bestand</th>
                <th className="py-2 pr-3 text-right font-medium">Wert</th>
                <th className="py-2 pr-3 text-right font-medium">Ø je Abend</th>
                <th className="py-2 font-medium">Reichweite</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.articleId}>
                  <td className="py-2 pr-3">
                    <span className="font-medium">{r.name}</span> <span className="text-muted-foreground">· {r.categoryName}</span>
                    {r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}
                  </td>
                  <td className={cn("py-2 pr-3 text-right font-semibold tabular-nums", r.stock < 0 && "text-destructive")}>
                    {describeStock(r, r.stock, fmt)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.valueCents === null ? "–" : formatCents(r.valueCents)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{avgText(r)}</td>
                  <td className="py-2">
                    {r.restock ? <Badge className="bg-highlight text-highlight-foreground">{reachText(r)}</Badge> : <span>{reachText(r)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {inventories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Letzte Inventuren</CardTitle>
            <CardDescription>Differenz = gezählt − berechnet. Minus heißt: weniger da als gedacht (Schwund oder vergessen anzuschreiben).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {inventories.map((inv) => {
              const diffs = inv.lines.filter((l) => l.differenceQty !== 0);
              return (
                <div key={inv.id} data-testid="inventur">
                  <p className="font-medium">
                    {dateTime.format(inv.countedAt)} · {inv.lines.length} Artikel gezählt
                    {inv.note && <span className="text-muted-foreground"> · {inv.note}</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {diffs.length === 0
                      ? "Alles stimmte."
                      : diffs
                          .map((l) => `${l.name} ${l.differenceQty > 0 ? "+" : "−"}${l.inMl ? formatVolume(Math.abs(l.differenceQty)) : Math.abs(l.differenceQty)}`)
                          .join(" · ")}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
