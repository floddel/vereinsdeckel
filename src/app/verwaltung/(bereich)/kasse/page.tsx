import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { MOVEMENT_LABEL } from "@/domain/cash";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getPotOverview, listCounts, listMovements, type MovementView } from "@/server/cash";
import { requireVerwaltung } from "@/server/session";
import { CashActions, ReverseMovementButton } from "./cash-dialogs";

const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

export default function KassePage() {
  return (
    <>
      <PageHeader title="Kasse" description="Handkasse und PayPal: was laut App drin sein müsste (Soll), Bewegungen und Zählungen." />
      <Suspense fallback={<Loading />}>
        <Kasse />
      </Suspense>
    </>
  );
}

/** Umbuchungen bestehen aus zwei Zeilen – in der Liste als ein Eintrag „von → nach“. */
function mergeTransfers(movements: MovementView[]) {
  const seen = new Set<string>();
  const out: (MovementView & { fromPotId?: string; toPotId?: string })[] = [];
  for (const m of movements) {
    if (m.type === "reversal") continue; // Storno steht beim Original
    if (m.transferGroupId) {
      if (seen.has(m.transferGroupId)) continue;
      seen.add(m.transferGroupId);
      const legs = movements.filter((x) => x.transferGroupId === m.transferGroupId);
      const from = legs.find((x) => x.amountCents < 0);
      const to = legs.find((x) => x.amountCents > 0);
      out.push({ ...m, amountCents: Math.abs(m.amountCents), fromPotId: from?.potId, toPotId: to?.potId });
    } else {
      out.push(m);
    }
  }
  return out;
}

async function Kasse() {
  await requireVerwaltung();
  const db = getDb();
  const [overview, movements, counts] = await Promise.all([getPotOverview(db), listMovements(db, 200), listCounts(db)]);
  const potName = new Map(overview.pots.map((p) => [p.id, p.name]));
  const list = mergeTransfers(movements);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {overview.pots.map((p) => (
          <Card key={p.id} data-testid={`topf-${p.id}`}>
            <CardHeader>
              <CardDescription>{p.name} · Soll</CardDescription>
              <CardTitle className={cn("text-3xl tabular-nums", p.balanceCents < 0 && "text-destructive")}>{formatCents(p.balanceCents)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
        <Card data-testid="auslagen">
          <CardHeader>
            <CardDescription>Auslagen (privat vorgestreckt, noch nicht erstattet)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{formatCents(overview.advancesCents)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <CashActions pots={overview.pots} advancesCents={overview.advancesCents} />

      <Card>
        <CardHeader>
          <CardTitle>Bewegungen</CardTitle>
          <CardDescription>Zahlungen der Mitglieder und Einkäufe stehen nicht hier, sondern im Kassenbuch.</CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-muted-foreground">Noch keine Bewegungen.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {list.map((m) => {
                const incoming = m.type === "deposit" || (m.type === "count_correction" && m.amountCents > 0);
                return (
                  <li key={m.id} data-testid="bewegung" className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5", m.reversedReason && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {MOVEMENT_LABEL[m.type]}
                        <Badge variant="secondary">
                          {m.fromPotId ? `${potName.get(m.fromPotId)} → ${potName.get(m.toPotId!)}` : potName.get(m.potId)}
                        </Badge>
                        {m.reversedReason && <Badge variant="outline">storniert: {m.reversedReason}</Badge>}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {dateTime.format(m.createdAt)} · {m.note}
                      </p>
                    </div>
                    <span className={cn("font-semibold tabular-nums", m.reversedReason && "line-through", !m.fromPotId && (incoming ? "text-primary" : ""))}>
                      {m.fromPotId ? formatCents(m.amountCents) : `${m.amountCents > 0 ? "+" : "−"}${formatCents(Math.abs(m.amountCents))}`}
                    </span>
                    {!m.reversedReason && m.type !== "count_correction" && <ReverseMovementButton id={m.id} label={MOVEMENT_LABEL[m.type]} />}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zählungen</CardTitle>
          <CardDescription>Gezählt gegen Soll. Eine Differenz bleibt protokolliert, auch wenn sie übernommen wurde.</CardDescription>
        </CardHeader>
        <CardContent>
          {counts.length === 0 ? (
            <p className="text-muted-foreground">Noch nicht gezählt.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {counts.map((c) => (
                <li key={c.id} data-testid="zaehlung" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                  <div>
                    <p className="font-medium">
                      {potName.get(c.potId)}: {formatCents(c.countedCents)} gezählt
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {dateTime.format(c.createdAt)} · Soll {formatCents(c.expectedCents)}
                      {c.note && ` · ${c.note}`}
                    </p>
                  </div>
                  <span className={cn("font-semibold tabular-nums", c.differenceCents < 0 && "text-destructive", c.differenceCents > 0 && "text-primary")}>
                    {c.differenceCents === 0 ? "stimmt" : `${c.differenceCents > 0 ? "+" : "−"}${formatCents(Math.abs(c.differenceCents))}`}
                    {c.correctionMovementId && " · übernommen"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
