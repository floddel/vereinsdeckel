"use client";

import { CircleCheck, Clock, Users } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { groupMembers, memberLetter, summarizePayments, type ThekeMember, type ThekeView } from "@/domain/theke";
import { accountStatus } from "@/domain/account";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export function MemberPicker({
  view,
  results,
  highlighted,
  warnLimitCents,
  onPick,
}: {
  view: ThekeView;
  /** Suchtreffer (null = keine Suche aktiv) */
  results: ThekeMember[] | null;
  highlighted: number;
  warnLimitCents: number;
  onPick: (id: string) => void;
}) {
  const groups = useMemo(
    () => groupMembers(view.members, view.presentIds, view.recentMemberIds),
    [view.members, view.presentIds, view.recentMemberIds],
  );
  const letters = useMemo(() => {
    // (kein Map.groupBy: das fehlt auf älteren iPads)
    const map = new Map<string, ThekeMember[]>();
    for (const m of groups.others) {
      const l = memberLetter(m.name);
      map.set(l, [...(map.get(l) ?? []), m]);
    }
    return map;
  }, [groups.others]);

  // Heute bezahlt (und nicht storniert) → bei 0 € offen „beglichen“ zeigen
  const paid = useMemo(
    () => new Set(summarizePayments(view.todayPayments).filter((p) => !p.reversal).map((p) => p.payment.memberId)),
    [view.todayPayments],
  );

  const button = (m: ThekeMember, opts: { active?: boolean; large?: boolean } = {}) => (
    <MemberButton key={m.id} member={m} warnLimitCents={warnLimitCents} onPick={onPick} settled={paid.has(m.id)} {...opts} />
  );

  if (results) {
    return (
      <Section title={results.length ? `${results.length} Treffer` : "Niemand gefunden"}>
        <Grid>{results.map((m, i) => button(m, { active: i === highlighted }))}</Grid>
      </Section>
    );
  }

  if (view.members.length === 0) {
    return (
      <p className="p-8 text-center text-lg text-muted-foreground">
        Noch keine Mitglieder. Lege sie in der Verwaltung unter „Mitglieder“ an oder importiere eine Liste.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.recent.length > 0 && (
        <Section title="Zuletzt bedient" icon={<Clock className="size-4" />}>
          {/* -mx-1 -my-3 px-1 py-3: Platz für Rahmen und Schatten (Scrollbereiche schneiden sonst ab) */}
          <div className="-mx-1 -my-3 flex gap-2 overflow-x-auto px-1 py-3">{groups.recent.map((m) => button(m, { large: true }))}</div>
        </Section>
      )}

      <Section title={`Heute da (${groups.present.length})`} icon={<Users className="size-4" />}>
        {groups.present.length ? (
          <Grid>{groups.present.map((m) => button(m))}</Grid>
        ) : (
          <p className="text-muted-foreground">Wer heute etwas bekommt, erscheint hier.</p>
        )}
      </Section>

      {groups.others.length > 0 && (
        <Section title={groups.present.length ? "Alle anderen" : "Alle Mitglieder"}>
          {/* Wie im iPhone-Adressbuch: Buchstabenleiste aus Glas am rechten Rand */}
          <nav
            aria-label="Anfangsbuchstaben"
            className="glass fixed top-1/2 right-2 z-10 flex max-h-[calc(100dvh-7.5rem)] w-12 -translate-y-1/2 flex-col items-center gap-0.5 overflow-hidden rounded-full px-1 py-2 md:right-3"
          >
            {[...letters.keys()].map((l) => (
              <button
                key={l}
                type="button"
                className="grid h-9 min-h-6 w-10 shrink place-items-center rounded-full font-heading text-base font-bold text-primary hover:bg-primary hover:text-primary-foreground"
                onClick={() => document.getElementById(`buchstabe-${l}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                {l}
              </button>
            ))}
          </nav>
          <div className="flex flex-col gap-4">
            {[...letters.entries()].map(([l, ms]) => (
              <div key={l} id={`buchstabe-${l}`} className="scroll-mt-4">
                <h3 className="mb-2 font-heading text-lg font-bold text-muted-foreground">{l}</h3>
                <Grid>{ms.map((m) => button(m))}</Grid>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 flex items-center gap-2 text-xl font-bold [&_svg]:text-muted-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">{children}</div>;
}

function MemberButton({
  member: m,
  warnLimitCents,
  onPick,
  active,
  large,
  settled,
}: {
  member: ThekeMember;
  settled?: boolean;
  warnLimitCents: number;
  onPick: (id: string) => void;
  active?: boolean;
  large?: boolean;
}) {
  const status = accountStatus(m.openCents, warnLimitCents);
  return (
    <button
      type="button"
      onClick={() => onPick(m.id)}
      data-active={active || undefined}
      className={cn(
        "flex min-h-14 flex-col justify-center rounded-[18px] bg-card px-3.5 py-2 text-left shadow-soft transition hover:ring-2 hover:ring-primary/60 active:scale-[0.98]",
        large && "min-w-44 shrink-0",
        active && "ring-3 ring-primary",
      )}
    >
      <span className="line-clamp-2 text-base leading-tight font-semibold">{m.name}</span>
      {status === "settled" && settled && (
        <span className="flex items-center gap-1 text-sm font-semibold text-success">
          <CircleCheck className="size-4" aria-hidden /> beglichen
        </span>
      )}
      {status !== "settled" && (
        <span
          className={cn(
            "text-sm tabular-nums",
            status === "over-limit" ? "font-semibold text-highlight" : "text-muted-foreground",
          )}
        >
          {formatCents(m.openCents)} offen
        </span>
      )}
    </button>
  );
}
