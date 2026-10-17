"use client";

import { ArrowRightLeft, BookOpen, Calculator, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MANUAL_MOVEMENT_TYPES, type ManualMovementType, MOVEMENT_HINT, MOVEMENT_LABEL } from "@/domain/cash";
import { formatCents, parseEuroToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { addMovementAction, recordCountAction, reverseMovementAction } from "@/server/cash-actions";

type Pot = { id: string; name: string; balanceCents: number };

export function CashActions({ pots, advancesCents }: { pots: Pot[]; advancesCents: number }) {
  const [movement, setMovement] = useState<ManualMovementType | null>(null);
  const [count, setCount] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="lg" onClick={() => setMovement("deposit")}>
        <ArrowRightLeft /> Bewegung buchen
      </Button>
      <Button size="lg" variant="outline" onClick={() => setCount(true)}>
        <Calculator /> Kasse zählen
      </Button>
      <Button nativeButton={false} size="lg" variant="outline" render={<Link href="/verwaltung/kasse/kassenbuch" />}>
        <BookOpen /> Kassenbuch
      </Button>
      {advancesCents > 0 && (
        <Button size="lg" variant="outline" onClick={() => setMovement("reimbursement")}>
          Auslagen erstatten ({formatCents(advancesCents)})
        </Button>
      )}
      {movement && <MovementDialog pots={pots} initialType={movement} advancesCents={advancesCents} onClose={() => setMovement(null)} />}
      {count && <CountDialog pots={pots} onClose={() => setCount(false)} />}
    </div>
  );
}

function MovementDialog({
  pots,
  initialType,
  advancesCents,
  onClose,
}: {
  pots: Pot[];
  initialType: ManualMovementType;
  advancesCents: number;
  onClose: () => void;
}) {
  const [type, setType] = useState<ManualMovementType>(initialType);
  const [potId, setPotId] = useState(pots[0]?.id ?? "cash");
  const [toPotId, setToPotId] = useState(pots[1]?.id ?? "paypal");
  const [amount, setAmount] = useState(initialType === "reimbursement" ? formatCents(advancesCents).replace(/\s?€/, "") : "");
  const [note, setNote] = useState(MOVEMENT_LABEL[initialType]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (t: ManualMovementType) => {
    // Notiz mitwechseln, solange sie noch die Vorgabe ist
    if (note === MOVEMENT_LABEL[type] || !note.trim()) setNote(MOVEMENT_LABEL[t]);
    if (t === "paypal_fee") setPotId("paypal");
    setType(t);
    setError(null);
  };

  const from = pots.find((p) => p.id === potId);
  const parsedAmount = parseEuroToCents(amount);
  // Mehr herausnehmen als laut App drin ist: meist ein Tippfehler (Buchen bleibt möglich – das Soll kann selbst falsch sein)
  const overdraw = type !== "deposit" && from && parsedAmount !== null && parsedAmount > Math.max(from.balanceCents, 0);

  const save = () => {
    const cents = parsedAmount;
    if (cents === null || cents <= 0) return setError("Bitte einen Betrag eingeben, z. B. 50 oder 12,50");
    startTransition(async () => {
      const result = await addMovementAction({ type, potId, toPotId: type === "transfer" ? toPotId : null, amountCents: cents, note });
      if (!result.ok) return setError(result.error);
      toast.success(`${MOVEMENT_LABEL[type]} gebucht`);
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bewegung buchen</DialogTitle>
          <DialogDescription>{MOVEMENT_HINT[type]}</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Art" className="flex flex-wrap gap-2">
          {MANUAL_MOVEMENT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => choose(t)}
              className={cn(
                "h-10 rounded-full border px-4 text-sm font-medium",
                type === t ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {MOVEMENT_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="m-pot">{type === "transfer" ? "Von" : type === "deposit" ? "In" : "Aus"}</FieldLabel>
            <NativeSelect id="m-pot" value={potId} onChange={(e) => setPotId(e.target.value)} disabled={type === "paypal_fee"} className="h-10 w-full">
              {pots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatCents(p.balanceCents)})
                </option>
              ))}
            </NativeSelect>
          </Field>
          {type === "transfer" && (
            <Field>
              <FieldLabel htmlFor="m-to">Nach</FieldLabel>
              <NativeSelect id="m-to" value={toPotId} onChange={(e) => setToPotId(e.target.value)} className="h-10 w-full">
                {pots.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="m-amount">Betrag (€)</FieldLabel>
            <Input id="m-amount" inputMode="decimal" placeholder="50,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 text-base" />
            {type === "reimbursement" && <FieldDescription>Offene Auslagen: {formatCents(advancesCents)}</FieldDescription>}
            {overdraw && (
              <p role="status" className="text-sm font-medium text-highlight">
                Achtung: Laut App sind nur {formatCents(from.balanceCents)} in „{from.name}“.
              </p>
            )}
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="m-note">Notiz</FieldLabel>
          <Input id="m-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="h-10 text-base" />
          <FieldDescription>Steht so im Kassenbuch, z. B. „an Kassenwart Peter übergeben“.</FieldDescription>
        </Field>
        <FormError message={error ?? undefined} />
        <DialogFooter>
          <Button size="lg" onClick={save} disabled={pending}>
            {pending ? "Bitte warten …" : "Buchen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CountDialog({ pots, onClose }: { pots: Pot[]; onClose: () => void }) {
  const [potId, setPotId] = useState(pots[0]?.id ?? "cash");
  const [counted, setCounted] = useState("");
  const [apply, setApply] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pot = pots.find((p) => p.id === potId);
  const cents = parseEuroToCents(counted);
  const diff = cents !== null && pot ? cents - pot.balanceCents : null;

  const save = () => {
    if (cents === null || cents < 0) return setError("Bitte den gezählten Betrag eingeben");
    startTransition(async () => {
      const result = await recordCountAction({ potId, countedCents: cents, note, applyCorrection: apply });
      if (!result.ok) return setError(result.error);
      toast.success(result.message ?? "Gespeichert");
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kasse zählen</DialogTitle>
          <DialogDescription>Zähl das Geld und trag den Betrag ein. Die App vergleicht mit dem Soll.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="c-pot">Topf</FieldLabel>
            <NativeSelect id="c-pot" value={potId} onChange={(e) => setPotId(e.target.value)} className="h-10 w-full">
              {pots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="c-amount">Gezählt (€)</FieldLabel>
            <Input id="c-amount" inputMode="decimal" placeholder="0,00" value={counted} onChange={(e) => setCounted(e.target.value)} className="h-10 text-base" />
          </Field>
        </div>
        {pot && (
          <p className="rounded-2xl bg-muted/60 p-3" data-testid="zaehl-vergleich">
            Soll laut App: <strong className="tabular-nums">{formatCents(pot.balanceCents)}</strong>
            {diff !== null && (
              <>
                {" · "}
                {diff === 0 ? (
                  <strong className="text-primary">stimmt genau</strong>
                ) : (
                  <strong className={diff < 0 ? "text-destructive" : "text-primary"}>
                    {diff < 0 ? `${formatCents(-diff)} zu wenig` : `${formatCents(diff)} zu viel`}
                  </strong>
                )}
              </>
            )}
          </p>
        )}
        {diff !== null && diff !== 0 && (
          <Field orientation="horizontal">
            <Switch id="c-apply" checked={apply} onCheckedChange={setApply} />
            <div>
              <FieldLabel htmlFor="c-apply">Differenz übernehmen</FieldLabel>
              <FieldDescription>Bucht eine Korrektur, damit das Soll wieder dem gezählten Betrag entspricht.</FieldDescription>
            </div>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="c-note">Notiz (optional)</FieldLabel>
          <Input id="c-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="h-10 text-base" />
        </Field>
        <FormError message={error ?? undefined} />
        <DialogFooter>
          <Button size="lg" onClick={save} disabled={pending}>
            {pending ? "Bitte warten …" : "Zählung speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReverseMovementButton({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`${label} stornieren`} onClick={() => setOpen(true)}>
        <Undo2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label} stornieren?</DialogTitle>
            <DialogDescription>Es entsteht eine Gegenbuchung. Die Bewegung bleibt als storniert sichtbar.</DialogDescription>
          </DialogHeader>
          <Input aria-label="Begründung" placeholder="Warum?" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={!reason.trim() || pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await reverseMovementAction(id, reason);
                  if (!result.ok) return void toast.error(result.error);
                  toast.success("Storniert");
                  setOpen(false);
                })
              }
            >
              Stornieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
