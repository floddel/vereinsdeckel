"use client";

import { Check, ChefHat, CloudOff, HandPlatter, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { REJECT_REASONS } from "@/domain/food-order";
import { cn } from "@/lib/utils";
import type { ThekeOrder } from "@/server/food-orders";
import { ReasonPicker, reasonText } from "./reason-picker";
import { formatTime } from "./sale-list";
import { itemsText } from "./use-food-orders";

const STATUS = {
  new: { label: "Neu", next: "Annehmen", className: "bg-highlight text-highlight-foreground" },
  accepted: { label: "In Arbeit", next: "Fertig", className: "bg-primary/15 text-primary" },
  ready: { label: "Fertig", next: "Abgeholt", className: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400" },
} as const;

/** Knopf in der Kopfzeile: Küche auf/zu und Zähler der offenen Bestellungen. */
export function KitchenButton({ open, count, newCount, onClick }: { open: boolean; count: number; newCount: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Küche (${open ? "offen" : "zu"}${count ? `, ${count} Bestellungen` : ""})`}
      className="relative flex h-12 shrink-0 items-center gap-2 rounded-full px-3 font-semibold text-primary hover:bg-secondary"
    >
      <ChefHat className="size-6" aria-hidden />
      <span className="hidden md:inline">Küche</span>
      {open && !count && <span className="absolute top-2 right-2 size-2.5 rounded-full bg-success ring-2 ring-card" aria-hidden />}
      {count > 0 && (
        <span
          data-testid="bestell-zaehler"
          className={cn(
            "grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-sm font-bold tabular-nums",
            newCount ? "animate-pulse bg-highlight text-highlight-foreground motion-reduce:animate-none" : "bg-primary text-primary-foreground",
          )}
          aria-hidden
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Leiste unter der Kopfzeile: offene Bestellungen mit dem nächsten Schritt. */
export function OrderBar({
  orders,
  onNext,
  onReject,
  onOpen,
}: {
  orders: ThekeOrder[];
  onNext: (o: ThekeOrder) => void;
  onReject: (o: ThekeOrder) => void;
  onOpen: () => void;
}) {
  if (orders.length === 0) return null;
  return (
    <section aria-label="Handy-Bestellungen" className="flex gap-2 overflow-x-auto px-3 pt-2 pb-1 md:px-4">
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} compact onNext={onNext} onReject={onReject} onOpen={onOpen} />
      ))}
    </section>
  );
}

function OrderCard({
  order: o,
  compact,
  onNext,
  onReject,
  onOpen,
}: {
  order: ThekeOrder;
  compact?: boolean;
  onNext: (o: ThekeOrder) => void;
  onReject: (o: ThekeOrder) => void;
  onOpen?: () => void;
}) {
  const s = STATUS[o.status];
  return (
    <article
      data-testid="theke-bestellung"
      data-status={o.status}
      aria-label={`Bestellung von ${o.memberName}`}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-[20px] bg-card p-2 pl-3 shadow-soft",
        compact ? "w-[26rem] max-w-[85vw]" : "w-full",
        o.status === "new" && "ring-2 ring-highlight",
      )}
    >
      <button type="button" onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left">
        <p className="flex items-center gap-2">
          <span className="truncate font-semibold">{o.memberName}</span>
          <span className={cn("shrink-0 rounded-full px-2 text-xs font-semibold", s.className)}>{s.label}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{formatTime(o.createdAt)}</span>
        </p>
        <p className={cn("text-sm", compact && "truncate")}>{itemsText(o)}</p>
        {o.note && <p className={cn("text-sm font-semibold text-highlight", compact && "truncate")}>„{o.note}“</p>}
      </button>
      <button
        type="button"
        onClick={() => onReject(o)}
        aria-label={`Bestellung von ${o.memberName} ablehnen`}
        className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X className="size-5" />
      </button>
      <Button size="lg" className="h-11 shrink-0 rounded-full px-4" onClick={() => onNext(o)}>
        {o.status === "ready" ? <HandPlatter className="size-5" /> : o.status === "accepted" ? <Check className="size-5" /> : null}
        {s.next}
      </Button>
    </article>
  );
}

/** Seitenleiste: Schalter „Küche offen“ und alle offenen Bestellungen. */
export function KitchenSheet({
  open,
  onOpenChange,
  kitchenOpen,
  orderableCount,
  orders,
  offline,
  onKitchenOpen,
  onNext,
  onReject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kitchenOpen: boolean;
  orderableCount: number;
  orders: ThekeOrder[];
  offline: boolean;
  onKitchenOpen: (open: boolean) => void;
  onNext: (o: ThekeOrder) => void;
  onReject: (o: ThekeOrder) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-xl data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-heading text-2xl">Küche &amp; Handy-Bestellungen</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0">
          <label className="flex items-center gap-4 rounded-[20px] bg-card p-4 shadow-soft">
            <Switch checked={kitchenOpen} onCheckedChange={onKitchenOpen} aria-label="Küche offen" disabled={offline} />
            <span>
              <span className="block text-lg font-semibold">Küche offen</span>
              <span className="text-sm text-muted-foreground">
                {kitchenOpen ? "Mitglieder können per Handy Essen bestellen." : "Per Handy kann gerade niemand bestellen."}
              </span>
            </span>
          </label>
          {orderableCount === 0 && (
            <p className="rounded-2xl bg-highlight/10 p-4 text-sm">
              Noch kein Essen ist per Handy bestellbar. In der Verwaltung unter <strong>Artikel</strong> beim Essen
              „Per Handy bestellbar“ einschalten.
            </p>
          )}
          {offline && (
            <p className="flex items-center gap-2 rounded-2xl bg-highlight/10 p-4 text-sm">
              <CloudOff className="size-5 shrink-0" /> Keine Verbindung – Handy-Bestellungen kommen gerade nicht an.
              Buchen an der Theke geht weiter.
            </p>
          )}
          <section className="flex flex-col gap-2">
            <h3 className="text-lg font-bold">Offene Bestellungen</h3>
            {orders.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">Keine offenen Bestellungen.</p>
            ) : (
              orders.map((o) => <OrderCard key={o.id} order={o} onNext={onNext} onReject={onReject} />)
            )}
            <p className="text-sm text-muted-foreground">
              „Abgeholt“ schreibt das Essen beim Mitglied an – mit dem aktuellen Preis.
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Ablehnen mit Grund – das Mitglied sieht den Grund auf dem Handy. */
export function RejectDialog({
  order,
  onClose,
  onConfirm,
}: {
  order: ThekeOrder | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const value = reasonText(reason, otherText);
  return (
    <Dialog
      open={order !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setReason(null);
          setOtherText("");
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {order && (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">Bestellung ablehnen</DialogTitle>
              <DialogDescription className="text-base">
                {order.memberName}: {itemsText(order)}. Das Mitglied sieht den Grund auf dem Handy, es kostet nichts.
              </DialogDescription>
            </DialogHeader>
            <ReasonPicker
              reason={reason}
              otherText={otherText}
              onReason={setReason}
              onOtherText={setOtherText}
              reasons={[...REJECT_REASONS, "Sonstiges"]}
            />
            <DialogFooter>
              <Button
                size="lg"
                variant="destructive"
                className="h-12 w-full text-base"
                disabled={!value}
                onClick={() => {
                  if (!value) return;
                  onConfirm(value.slice(0, 100));
                  setReason(null);
                  setOtherText("");
                }}
              >
                Ablehnen
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
