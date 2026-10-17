"use client";

import { Search } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PaymentStornoDialog } from "@/app/theke/payment-storno-dialog";
import { SaleDialog, type SaleDialogResult, type SaleDialogState } from "@/app/theke/sale-dialog";
import { SaleList } from "@/app/theke/sale-list";
import { Input } from "@/components/ui/input";
import { type PaymentSummary, searchMembers, summarizePayments, summarizeSales, type ThekePayment, type ThekeSale } from "@/domain/theke";
import { type Correction, correctionAction } from "@/server/correction-actions";

/**
 * Alle Bons und Zahlungen eines Abends – mit Storno, Umbuchen und Zahlungs-Storno
 * wie an der Theke, aber auch für frühere Abende (Verwaltung, mit PIN).
 */
export function EveningBookings({
  sales,
  payments,
  names,
  activeMembers,
}: {
  sales: ThekeSale[];
  payments: ThekePayment[];
  /** Namen aller Mitglieder, die an diesem Abend vorkommen */
  names: Record<string, string>;
  /** mögliche Ziele fürs Umbuchen */
  activeMembers: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [saleDialog, setSaleDialog] = useState<SaleDialogState>(null);
  const [paymentStorno, setPaymentStorno] = useState<PaymentSummary | null>(null);
  const [pending, startTransition] = useTransition();

  const membersById = useMemo(() => new Map(Object.entries(names).map(([id, name]) => [id, { name }])), [names]);
  const presentIds = useMemo(() => new Set([...sales, ...payments].map((x) => x.memberId)), [sales, payments]);
  const view = useMemo(() => ({ members: activeMembers, membersById, presentIds }), [activeMembers, membersById, presentIds]);

  // Suche nach Name: nur Bons und Zahlungen dieser Mitglieder
  const shown = useMemo(() => {
    if (!query.trim()) return null;
    const present = [...presentIds].map((id) => ({ id, name: names[id] ?? "" }));
    return new Set(searchMembers(present, query, presentIds).map((m) => m.id));
  }, [query, presentIds, names]);
  const summaries = useMemo(() => summarizeSales(sales).filter((s) => !shown || shown.has(s.sale.memberId)), [sales, shown]);
  const paymentSummaries = useMemo(
    () => summarizePayments(payments).filter((p) => !shown || shown.has(p.payment.memberId)),
    [payments, shown],
  );

  const send = (c: Correction, close: () => void) =>
    startTransition(async () => {
      const result = await correctionAction(c);
      if (!result.ok) return void toast.error(result.error ?? "Nicht möglich");
      toast.success(result.message ?? "Gespeichert");
      close();
    });

  const confirmSale = (r: SaleDialogResult) => {
    if (!saleDialog || pending) return;
    const saleId = saleDialog.summary.sale.id;
    send(
      r.mode === "storno"
        ? { type: "reversal", saleId, reason: r.reason, lines: r.lines }
        : { type: "move", saleId, toMemberId: r.toMemberId, lines: r.lines },
      () => setSaleDialog(null),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Bons nach Mitglied suchen"
          placeholder="Mitglied suchen …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 pl-9 text-base"
        />
      </div>
      <SaleList
        summaries={summaries}
        payments={paymentSummaries}
        membersById={membersById}
        showMember
        emptyText={shown ? "Keine Bons für diese Suche." : "An diesem Abend wurde nichts gebucht."}
        onStorno={(summary) => setSaleDialog({ mode: "storno", summary })}
        onMove={(summary) => setSaleDialog({ mode: "move", summary })}
        onPaymentStorno={setPaymentStorno}
      />
      <SaleDialog state={saleDialog} view={view} onClose={() => setSaleDialog(null)} onConfirm={confirmSale} />
      <PaymentStornoDialog
        summary={paymentStorno}
        member={paymentStorno ? membersById.get(paymentStorno.payment.memberId) : undefined}
        onClose={() => setPaymentStorno(null)}
        onConfirm={(reason) => {
          if (!paymentStorno || pending) return;
          send({ type: "payment-reversal", paymentId: paymentStorno.payment.id, reason }, () => setPaymentStorno(null));
        }}
      />
    </div>
  );
}
