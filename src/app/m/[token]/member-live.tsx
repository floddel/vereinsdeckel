"use client";

import { ChartNoAxesColumn, ChefHat, ChevronRight, ReceiptText, Smartphone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Coaster } from "@/components/coaster/coaster";
import type { CoasterGroup, MemberStand } from "@/domain/member-view";
import { formatCents } from "@/lib/money";
import { paypalMeLink } from "@/lib/paypal";
import { cn } from "@/lib/utils";
import { InvalidLink } from "./invalid-link";
import { useMemberStand } from "./use-member-stand";

/** Striche je Gruppe insgesamt (eine Gruppe kann über mehrere Deckel gehen). */
function totals(coasters: CoasterGroup[][]): Map<string, number> {
  const map = new Map<string, number>();
  for (const g of coasters.flat()) map.set(g.key, (map.get(g.key) ?? 0) + g.count);
  return map;
}

/**
 * Welche Striche sind seit dem letzten Stand neu? Je Deckel und Gruppe: ab welchem Strich zeichnen.
 * Beim ersten Anzeigen wird nichts animiert.
 */
function newStrokes(coasters: CoasterGroup[][], before: Map<string, number> | null): Record<string, number>[] {
  const offset = new Map<string, number>();
  return coasters.map((groups) => {
    const result: Record<string, number> = {};
    for (const g of groups) {
      const start = offset.get(g.key) ?? 0;
      offset.set(g.key, start + g.count);
      const old = before?.get(g.key);
      if (before && (old ?? 0) < start + g.count) result[g.key] = Math.max(0, (old ?? 0) - start);
    }
    return result;
  });
}

const ORDER_TEXT = {
  new: "Deine Bestellung ist unterwegs",
  accepted: "Dein Essen wird zubereitet",
  ready: "Dein Essen ist fertig – bitte abholen!",
} as const;

function OrderBanner({ token, status }: { token: string; status: keyof typeof ORDER_TEXT }) {
  return (
    <Link
      href={`/m/${token}/bestellen`}
      role="status"
      data-testid="bestell-hinweis"
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl px-4 py-3 font-semibold shadow-soft",
        status === "ready" ? "bg-highlight text-highlight-foreground" : "bg-card ring-1 ring-foreground/5",
      )}
    >
      <ChefHat className="size-6 shrink-0" aria-hidden />
      <span className="flex-1">{ORDER_TEXT[status]}</span>
      {status === "ready" && <span className="size-2.5 animate-ping rounded-full bg-current motion-reduce:animate-none" aria-hidden />}
      <ChevronRight className="size-5 shrink-0" aria-hidden />
    </Link>
  );
}

export function MemberLive({ token, initial }: { token: string; initial: MemberStand }) {
  const { stand, invalid } = useMemberStand(token, initial);

  // Neuer Stand → mit dem zuletzt gezeigten vergleichen: Was neu ist, wird gezeichnet.
  const [seen, setSeen] = useState(() => ({
    version: stand.version,
    totals: totals(stand.coasters),
    animate: [] as Record<string, number>[],
  }));
  if (seen.version !== stand.version) {
    setSeen({ version: stand.version, totals: totals(stand.coasters), animate: newStrokes(stand.coasters, seen.totals) });
  }
  const animate = seen.version === stand.version ? seen.animate : [];

  if (invalid) return <InvalidLink />;

  const count = stand.coasters.length;
  return (
    <div className="flex flex-col items-center gap-6">
      <header className="flex w-full flex-col items-center gap-2 text-center">
        {stand.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- eigenes, kleines Logo aus der Datenbank
          <img src={stand.logoUrl} alt="" className="size-16 rounded-full bg-white object-cover shadow-soft" />
        )}
        <p className="text-[15px] font-semibold text-muted-foreground">{stand.clubName}</p>
        <h1 className="font-heading text-[2rem] leading-tight font-bold">Hallo {stand.memberName}!</h1>
      </header>

      {stand.orderStatus && <OrderBanner token={token} status={stand.orderStatus} />}

      {stand.status === "open" ? (
        <>
          <div className="flex flex-col items-center gap-4">
            {stand.coasters.map((groups, i) => (
              <Coaster
                key={i}
                clubName={stand.clubName}
                groups={groups}
                page={count > 1 ? `${i + 1}/${count}` : undefined}
                totalCents={i === count - 1 ? stand.openCents : undefined}
                newFrom={animate[i]}
              />
            ))}
          </div>
          <p className="flex w-full max-w-80 items-baseline justify-between rounded-2xl bg-card px-4 py-3 text-lg shadow-soft">
            Offen: <strong className="font-heading text-2xl tabular-nums" data-testid="offen">{formatCents(stand.openCents)}</strong>
          </p>
          {stand.paypalName && (
            <a
              href={paypalMeLink(stand.paypalName, stand.openCents)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-14 w-full max-w-80 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground shadow-soft"
            >
              <Smartphone className="size-5" /> Mit PayPal bezahlen
            </a>
          )}
          {stand.paypalName && (
            <p className="max-w-80 text-center text-sm text-muted-foreground">
              Die Zahlung wird an der Theke bestätigt – danach ist dein Deckel beglichen.
            </p>
          )}
        </>
      ) : (
        <>
          <Coaster clubName={stand.clubName} groups={[]} settled={stand.status === "settled"} />
          <p className="text-lg text-muted-foreground" data-testid="status">
            {stand.status === "settled" ? "Alles bezahlt – Prost!" : "Noch nichts auf dem Deckel."}
          </p>
        </>
      )}

      {stand.kitchenOpen && (
        <Link
          href={`/m/${token}/bestellen`}
          className="flex h-12 w-full max-w-80 items-center justify-center gap-2 rounded-full bg-highlight font-semibold text-highlight-foreground shadow-soft"
        >
          <ChefHat className="size-5" /> Essen bestellen
        </Link>
      )}
      {/* Wie in den iPhone-Einstellungen: Liste mit farbigen Symbol-Kacheln */}
      <nav aria-label="Mehr" className="w-full max-w-80 divide-y overflow-hidden rounded-2xl bg-card shadow-soft">
        <Link href={`/m/${token}/zettel`} className="flex min-h-13 items-center gap-3 px-3.5 text-[17px] font-medium hover:bg-muted">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#5856d6] text-white" aria-hidden>
            <ReceiptText className="size-[18px]" />
          </span>
          <span className="flex-1">Meine Kassenzettel</span>
          <ChevronRight className="size-5 text-muted-foreground/60" aria-hidden />
        </Link>
        <Link href={`/m/${token}/uebersicht`} className="flex min-h-13 items-center gap-3 px-3.5 text-[17px] font-medium hover:bg-muted">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#34c759] text-white" aria-hidden>
            <ChartNoAxesColumn className="size-[18px]" />
          </span>
          <span className="flex-1">Meine Übersicht</span>
          <ChevronRight className="size-5 text-muted-foreground/60" aria-hidden />
        </Link>
      </nav>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden /> Aktualisiert sich von selbst
      </p>
      {/* Ohne Vorladen: selten gebraucht, und Safari meldet abgebrochenes Vorladen als Fehler. */}
      <Link href="/datenschutz" prefetch={false} className="-mt-2 text-sm text-muted-foreground underline underline-offset-4">
        Datenschutz
      </Link>
    </div>
  );
}
