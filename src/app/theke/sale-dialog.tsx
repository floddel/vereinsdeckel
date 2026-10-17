"use client";

import { Minus, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { byName, type SaleSummary, searchMembers } from "@/domain/theke";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ReasonPicker, reasonText } from "./reason-picker";
import { formatTime } from "./sale-list";

export type SaleDialogState = { mode: "storno" | "move"; summary: SaleSummary } | null;

/** Wer zur Auswahl steht (Theke: Stand des Abends; Verwaltung: aktive Mitglieder). */
export interface StornoMembers {
  /** mögliche Ziele fürs Umbuchen */
  members: readonly { id: string; name: string }[];
  /** Namen für die Anzeige (auch inaktive Mitglieder) */
  membersById: ReadonlyMap<string, { name: string }>;
  /** an diesem Abend dabei – stehen beim Umbuchen vorn */
  presentIds: ReadonlySet<string>;
}

export type SaleDialogResult =
  | { mode: "storno"; lines: { lineId: string; quantity: number }[]; reason: string }
  | { mode: "move"; lines: { lineId: string; quantity: number }[]; toMemberId: string };

export function SaleDialog({
  state,
  view,
  onClose,
  onConfirm,
}: {
  state: SaleDialogState;
  view: StornoMembers;
  onClose: () => void;
  onConfirm: (result: SaleDialogResult) => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        {state && <SaleForm key={`${state.mode}:${state.summary.sale.id}`} state={state} view={view} onConfirm={onConfirm} />}
      </DialogContent>
    </Dialog>
  );
}

function SaleForm({
  state: { mode, summary },
  view,
  onConfirm,
}: {
  state: NonNullable<SaleDialogState>;
  view: StornoMembers;
  onConfirm: (result: SaleDialogResult) => void;
}) {
  const member = view.membersById.get(summary.sale.memberId);
  const open = summary.lines.filter((l) => l.remaining > 0);
  // Voreinstellung: alles, was noch offen ist
  const [qty, setQty] = useState(() => new Map(open.map((l) => [l.id, l.remaining])));
  const [reason, setReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);

  const chosen = open.map((l) => ({ line: l, quantity: qty.get(l.id) ?? 0 })).filter((x) => x.quantity > 0);
  const sum = chosen.reduce((s, x) => s + x.quantity * x.line.unitPriceCents, 0);
  const reasonValue = reasonText(reason, otherText);

  const candidates = useMemo(() => {
    const others = view.members.filter((m) => m.id !== summary.sale.memberId);
    if (query.trim()) return searchMembers(others, query, view.presentIds).slice(0, 12);
    return others.filter((m) => view.presentIds.has(m.id)).sort(byName).slice(0, 12);
  }, [view.members, view.presentIds, query, summary.sale.memberId]);
  const target = targetId ? view.members.find((m) => m.id === targetId) : undefined;

  const ready = chosen.length > 0 && (mode === "storno" ? !!reasonValue : !!target);
  const lines = chosen.map((x) => ({ lineId: x.line.id, quantity: x.quantity }));

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-2xl">{mode === "storno" ? "Stornieren" : "Umbuchen"}</DialogTitle>
        <DialogDescription className="text-base">
          Bon von {member?.name ?? "Unbekannt"} um {formatTime(summary.sale.createdAt)} Uhr
        </DialogDescription>
      </DialogHeader>

      <ul className="flex flex-col gap-2">
        {open.map((l) => {
          const n = qty.get(l.id) ?? 0;
          const set = (v: number) => setQty(new Map(qty).set(l.id, Math.max(0, Math.min(l.remaining, v))));
          return (
            <li key={l.id} className="flex items-center gap-2 rounded-2xl bg-muted/60 py-1 pr-1 pl-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {l.articleName}
                  {l.isGuest && " (Gast)"}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {n} von {l.remaining} · {formatCents(n * l.unitPriceCents)}
                </span>
              </span>
              <Button variant="outline" size="icon-lg" aria-label={`${l.articleName} eins weniger`} disabled={n === 0} onClick={() => set(n - 1)}>
                <Minus />
              </Button>
              <Button variant="outline" size="icon-lg" aria-label={`${l.articleName} eins mehr`} disabled={n === l.remaining} onClick={() => set(n + 1)}>
                <Plus />
              </Button>
            </li>
          );
        })}
      </ul>

      {mode === "storno" ? (
        <ReasonPicker
          reason={reason}
          otherText={otherText}
          onReason={setReason}
          onOtherText={setOtherText}
          hint={
            reason === "Falsches Mitglied" && (
              <p className="text-sm text-muted-foreground">Tipp: Mit „Umbuchen“ landet es gleich beim richtigen Mitglied.</p>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">Auf wen umbuchen?</p>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Mitglied für Umbuchung suchen"
              placeholder="Name suchen …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 pl-9 text-base"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {candidates.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={targetId === m.id}
                onClick={() => setTargetId(m.id)}
                className={cn(
                  "min-h-11 rounded-2xl border px-3 py-2 text-left font-medium",
                  targetId === m.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
          {candidates.length === 0 && <p className="text-muted-foreground">Niemand gefunden.</p>}
        </div>
      )}

      <DialogFooter>
        <Button
          size="lg"
          className="h-12 w-full text-base"
          disabled={!ready}
          onClick={() =>
            mode === "storno"
              ? onConfirm({ mode, lines, reason: reasonValue! })
              : onConfirm({ mode, lines, toMemberId: target!.id })
          }
        >
          {mode === "storno"
            ? `Stornieren${sum ? ` · −${formatCents(sum)}` : ""}`
            : target
              ? `Umbuchen auf ${target.name}`
              : "Mitglied wählen"}
        </Button>
      </DialogFooter>
    </>
  );
}
