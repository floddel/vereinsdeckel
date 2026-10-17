"use client";

import { ArrowRightLeft, Banknote, Smartphone, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PaymentSummary, SaleSummary } from "@/domain/theke";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

const timeFormat = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));

const METHOD_LABEL: Record<string, string> = { cash: "Bar", paypal: "PayPal" };

/** Bons und Zahlungen des Abends, neueste zuerst. */
export function SaleList({
  summaries,
  payments = [],
  membersById,
  showMember,
  onStorno,
  onMove,
  onPaymentStorno,
  emptyText = "Heute noch nichts gebucht.",
}: {
  summaries: SaleSummary[];
  payments?: PaymentSummary[];
  membersById: ReadonlyMap<string, { name: string }>;
  showMember?: boolean;
  emptyText?: string;
  onStorno: (s: SaleSummary) => void;
  onMove: (s: SaleSummary) => void;
  onPaymentStorno: (p: PaymentSummary) => void;
}) {
  if (summaries.length === 0 && payments.length === 0) {
    return <p className="text-muted-foreground">{emptyText}</p>;
  }
  const entries = [
    ...summaries.map((s) => ({ at: s.sale.createdAt, sale: s, payment: null })),
    ...payments.map((p) => ({ at: p.payment.createdAt, sale: null, payment: p })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <ul className="flex flex-col gap-2">
      {entries.map(({ sale: s, payment: p }) => {
        if (p) {
          return (
            <PaymentRow
              key={p.payment.id}
              summary={p}
              member={membersById.get(p.payment.memberId)}
              showMember={showMember}
              onStorno={onPaymentStorno}
            />
          );
        }
        if (!s) return null;
        const member = membersById.get(s.sale.memberId);
        const done = s.status === "reversed";
        return (
          <li
            key={s.sale.id}
            data-testid="bon"
            className={cn("flex flex-wrap items-center gap-3 rounded-2xl bg-card p-3 shadow-soft dark:ring-1 dark:ring-white/5", done && "opacity-60")}
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="tabular-nums">{formatTime(s.sale.createdAt)}</span>
                {showMember && <span className="font-semibold text-foreground">{member?.name ?? "Unbekannt"}</span>}
                {s.sale.pending && <Badge variant="outline">wird gespeichert</Badge>}
                {s.status === "partly-reversed" && <Badge variant="secondary">teilweise storniert</Badge>}
                {done && <Badge variant="secondary">storniert</Badge>}
              </p>
              <p className={cn("font-medium", done && "line-through")}>
                {s.lines
                  .map((l) => `${l.quantity}× ${l.articleName}${l.isGuest ? " (Gast)" : ""}${l.reversed ? ` (${l.reversed} storniert)` : ""}`)
                  .join(", ")}
              </p>
              {s.reasons.length > 0 && <p className="text-sm text-muted-foreground">{s.reasons.join(" · ")}</p>}
            </div>
            <span className="font-semibold tabular-nums">{formatCents(s.totalCents)}</span>
            {!done && (
              <span className="flex gap-2">
                <Button variant="outline" size="lg" disabled={s.sale.pending} onClick={() => onStorno(s)}>
                  <Undo2 /> Storno
                </Button>
                <Button variant="outline" size="lg" disabled={s.sale.pending} onClick={() => onMove(s)}>
                  <ArrowRightLeft /> Umbuchen
                </Button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PaymentRow({
  summary: { payment: p, reversal },
  member,
  showMember,
  onStorno,
}: {
  summary: PaymentSummary;
  member?: { name: string };
  showMember?: boolean;
  onStorno: (p: PaymentSummary) => void;
}) {
  const Icon = p.methodId === "paypal" ? Smartphone : Banknote;
  return (
    <li
      data-testid="zahlung"
      className={cn("flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/60 p-3 ring-1 ring-foreground/5", reversal && "opacity-60")}
    >
      <Icon className="size-6 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">{formatTime(p.createdAt)}</span>
          {showMember && <span className="font-semibold text-foreground">{member?.name ?? "Unbekannt"}</span>}
          {p.pending && <Badge variant="outline">wird gespeichert</Badge>}
          {reversal && <Badge variant="secondary">storniert</Badge>}
        </p>
        <p className={cn("font-medium", reversal && "line-through")}>
          {METHOD_LABEL[p.methodId] ?? p.methodId} bezahlt{p.saleId ? " (sofort)" : ""}
          {p.tipCents > 0 && ` · ${formatCents(p.tipCents)} Trinkgeld`}
          {p.cashGivenCents !== null && ` · gegeben ${formatCents(p.cashGivenCents)}`}
        </p>
        {reversal?.reason && <p className="text-sm text-muted-foreground">{reversal.reason}</p>}
      </div>
      <span className="font-semibold tabular-nums">−{formatCents(p.amountCents)}</span>
      {!reversal && (
        <Button variant="outline" size="lg" disabled={p.pending} onClick={() => onStorno({ payment: p, reversal })}>
          <Undo2 /> Storno
        </Button>
      )}
    </li>
  );
}
