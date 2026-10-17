"use client";

import { ArrowLeft, CircleCheck, Minus, PenLine, Plus, TriangleAlert, UserRound, Wallet } from "lucide-react";
import { ArticleIcon } from "@/components/article-icon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { accountStatus } from "@/domain/account";
import { availableUnits, type MemberDeckel, type ThekeArticle, type ThekeMember, type ThekeSnapshot } from "@/domain/theke";
import { formatBusinessDay } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface CartLine {
  article: ThekeArticle;
  quantity: number;
  isGuest: boolean;
}

/** Ab hier zeigt die Kachel „noch X“. */
const LOW_STOCK = 10;

export const cartKey = (articleId: string, isGuest: boolean) => `${articleId}:${isGuest ? "gast" : "mitglied"}`;
export const cartTotal = (cart: readonly CartLine[]) => cart.reduce((s, l) => s + l.quantity * l.article.priceCents, 0);

export function MemberScreen({
  member,
  snapshot,
  stockLeft,
  cart,
  guestMode,
  onGuestMode,
  onAdd,
  onChange,
  onBook,
  onBack,
  paidToday,
  onPay,
  onPayInstant,
  deckel,
  children,
}: {
  member: ThekeMember;
  snapshot: ThekeSnapshot;
  /** Bestand je Bestands-Artikel (inkl. noch nicht gesendeter Verkäufe) */
  stockLeft: ReadonlyMap<string, number>;
  cart: CartLine[];
  guestMode: boolean;
  onGuestMode: (on: boolean) => void;
  onAdd: (article: ThekeArticle) => void;
  onChange: (key: string, delta: number) => void;
  onBook: () => void;
  onBack: () => void;
  /** heute bezahlt (für „beglichen“) */
  paidToday: boolean;
  onPay: () => void;
  onPayInstant: () => void;
  /** was gerade offen auf dem Deckel steht (frühere Abende + heute) */
  deckel: MemberDeckel;
  /** Bons dieses Mitglieds von heute (Storno/Umbuchen) */
  children?: React.ReactNode;
}) {
  const total = cartTotal(cart);
  const after = member.openCents + total;
  const status = accountStatus(after, snapshot.warnLimitCents);
  const countFor = (articleId: string) => cart.filter((l) => l.article.id === articleId).reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] min-[56rem]:grid-cols-[1fr_20rem] min-[56rem]:grid-rows-1 xl:grid-cols-[1fr_24rem]">
      {/* Links: Mitglied + Kacheln */}
      <div className="min-h-0 overflow-y-auto p-4 pt-[calc(var(--top)+0.75rem)] md:p-5 md:pt-[calc(var(--top)+1rem)]">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon-lg" onClick={onBack} aria-label="Zurück zur Auswahl" className="glass size-12 shrink-0 rounded-full text-primary">
            <ArrowLeft className="size-6" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-3xl font-bold" data-testid="theke-member">
              {member.name}
            </h1>
            <p className="text-muted-foreground">
              offen{" "}
              <span className="font-heading text-2xl font-bold text-foreground tabular-nums" data-testid="theke-open">
                {formatCents(member.openCents)}
              </span>
              {total > 0 && <span className="block tabular-nums">mit Warenkorb {formatCents(after)}</span>}
            </p>
          </div>
          {member.openCents > 0 ? (
            <Button size="lg" className="h-12 rounded-full bg-highlight px-6 text-base font-semibold text-highlight-foreground hover:bg-highlight/85" onClick={onPay}>
              <Wallet className="size-5" /> Bezahlen
            </Button>
          ) : (
            paidToday && (
              <p className="flex items-center gap-2 rounded-full bg-success/12 px-4 py-2 font-semibold text-success" data-testid="beglichen">
                <CircleCheck className="size-5" /> Beglichen – Prost!
              </p>
            )
          )}
          {status === "over-limit" && (
            <p role="status" className="flex items-center gap-2 rounded-full bg-highlight/15 px-4 py-2 font-semibold text-highlight">
              <TriangleAlert className="size-5" /> Über {formatCents(snapshot.warnLimitCents)} – ans Bezahlen erinnern
            </p>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {snapshot.categories.map((c) => {
            const articles = snapshot.articles.filter((a) => a.categoryId === c.id);
            if (articles.length === 0) return null;
            return (
              <section key={c.id}>
                <h2 className="mb-2.5 text-xl font-bold">{c.name}</h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2.5">
                  {articles.map((a) => {
                    const n = countFor(a.id);
                    // noch verkaufbar: leer → ausgegraut, wenig → „noch 3“ (abzüglich Warenkorb)
                    const left = availableUnits(a, stockLeft, []);
                    const free = availableUnits(a, stockLeft, cart);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onAdd(a)}
                        aria-label={`${a.name}, ${formatCents(a.priceCents)}${left === 0 ? ", leer" : ""}`}
                        aria-disabled={free === 0 || undefined}
                        className={cn(
                          "relative flex min-h-32 flex-col items-center justify-center gap-1 rounded-[22px] bg-card p-3 text-center shadow-soft transition select-none hover:ring-2 hover:ring-primary/50 active:scale-95",
                          n > 0 && "ring-2 ring-primary",
                          free === 0 && "opacity-45 hover:ring-foreground/10 active:scale-100",
                        )}
                      >
                        <ArticleIcon icon={a.icon} className="size-14" />
                        <span className="text-base leading-tight font-semibold">{a.name}</span>
                        <span className="text-sm text-muted-foreground tabular-nums">{formatCents(a.priceCents)}</span>
                        {free <= LOW_STOCK && (
                          <span className={cn("text-xs font-semibold tabular-nums", free === 0 ? "text-destructive" : "text-highlight")} data-testid="kachel-bestand">
                            {left === 0 ? "leer" : `noch ${free}`}
                          </span>
                        )}
                        {n > 0 && (
                          <span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-primary text-base font-bold text-primary-foreground tabular-nums shadow-soft">
                            {n}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {children}
        </div>
      </div>

      {/* Rechts (bzw. unten): Warenkorb */}
      <aside
        aria-label="Warenkorb"
        className="glass m-2 mt-0 flex max-h-[45dvh] flex-col gap-3 rounded-[28px] p-4 md:m-3 md:mt-0 min-[56rem]:mt-[calc(var(--top)+0.25rem)] min-[56rem]:ml-0 min-[56rem]:max-h-none"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-xl font-bold">Warenkorb</h2>
          <div className="flex items-center gap-2 text-sm font-medium whitespace-nowrap text-muted-foreground">
            <UserRound className="size-4" aria-hidden />
            <span aria-hidden>Für einen Gast</span>
            <Switch checked={guestMode} onCheckedChange={onGuestMode} aria-label="Für einen Gast" />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {cart.length === 0 ? (
            <p className="text-muted-foreground">Artikel antippen – jeder Tipp zählt eins dazu.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {cart.map((l) => {
                const key = cartKey(l.article.id, l.isGuest);
                return (
                  <li key={key} className="flex items-center gap-2 rounded-2xl bg-card py-1.5 pr-1.5 pl-2">
                    <ArticleIcon icon={l.article.icon} className="size-9 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {l.quantity}× {l.article.name}
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {formatCents(l.quantity * l.article.priceCents)}
                        {l.isGuest && " · Gast"}
                      </span>
                    </span>
                    <Button variant="secondary" size="icon-lg" className="size-10 rounded-full" aria-label={`${l.article.name} eins weniger`} onClick={() => onChange(key, -1)}>
                      <Minus />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon-lg"
                      className="size-10 rounded-full"
                      aria-label={`${l.article.name} eins mehr`}
                      disabled={availableUnits(l.article, stockLeft, cart) === 0}
                      onClick={() => onChange(key, 1)}
                    >
                      <Plus />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <DeckelList deckel={deckel} openCents={member.openCents} today={snapshot.businessDate} />
        </div>
        <div className="flex flex-col gap-2">
          <Button size="lg" className="h-14 rounded-full text-lg font-semibold" disabled={cart.length === 0} onClick={onBook}>
            <PenLine className="size-5" />
            Anschreiben{total > 0 && <span className="tabular-nums"> · {formatCents(total)}</span>}
          </Button>
          <Button size="lg" variant="secondary" className="h-12 rounded-full text-base font-semibold" disabled={cart.length === 0} onClick={onPayInstant}>
            <Wallet className="size-5" /> Sofort bezahlen
          </Button>
        </div>
      </aside>
    </div>
  );
}

/** „Auf dem Deckel“: offene Posten nach Abenden – dasselbe, was das Mitglied auf seinem Bierdeckel sieht. */
function DeckelList({ deckel, openCents, today }: { deckel: MemberDeckel; openCents: number; today: string }) {
  if (deckel.evenings.length === 0 || openCents <= 0) return null;
  return (
    <section aria-label="Auf dem Deckel" data-testid="auf-dem-deckel" className="flex flex-col gap-2 rounded-2xl bg-card p-3.5">
      <h3 className="flex items-baseline justify-between gap-2 font-heading text-lg font-bold">
        Auf dem Deckel <span className="tabular-nums">{formatCents(openCents)}</span>
      </h3>
      {deckel.evenings.map((e) => (
        <div key={e.businessDate}>
          <p className="text-sm font-semibold text-muted-foreground">
            {e.businessDate === today ? "Heute" : formatBusinessDay(e.businessDate)}
          </p>
          <ul>
            {e.items.map((i) => (
              <li key={`${i.articleName}|${i.isGuest}|${i.totalCents}`} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  {i.quantity}× {i.articleName}
                  {i.isGuest && <span className="text-muted-foreground"> · Gast</span>}
                </span>
                <span className="shrink-0 tabular-nums">{formatCents(i.totalCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {deckel.paidCents > 0 && (
        <p className="flex justify-between gap-2 border-t pt-2 text-muted-foreground">
          <span>Schon bezahlt</span>
          <span className="tabular-nums">−{formatCents(deckel.paidCents)}</span>
        </p>
      )}
    </section>
  );
}
