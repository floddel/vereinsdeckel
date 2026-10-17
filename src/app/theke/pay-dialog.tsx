"use client";

import { Banknote, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cashSuggestions } from "@/domain/payment";
import type { ThekeMember, ThekeSnapshot } from "@/domain/theke";
import { formatCents, formatCentsPlain, parseEuroToCents } from "@/lib/money";
import { paypalMeLink } from "@/lib/paypal";
import { cn } from "@/lib/utils";

export type PayRequest = {
  member: ThekeMember;
  /** zu zahlen: offener Betrag oder (Sofort bezahlen) Summe des Warenkorbs */
  dueCents: number;
  instant: boolean;
};

export type PayResult = { methodId: string; amountCents: number; tipCents: number; cashGivenCents: number | null };

export function PayDialog({
  request,
  snapshot,
  onClose,
  onConfirm,
}: {
  request: PayRequest | null;
  snapshot: ThekeSnapshot;
  onClose: () => void;
  onConfirm: (result: PayResult) => void;
}) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-xl">
        {request && <PayForm key={request.member.id + request.dueCents} request={request} snapshot={snapshot} onConfirm={onConfirm} />}
      </DialogContent>
    </Dialog>
  );
}

/** Ein Betrag zum Antippen (Scheine, Teilbeträge). */
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-12 min-w-20 rounded-full border px-4 text-lg font-semibold tabular-nums",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Eingabefeld für Euro-Beträge (Komma oder Punkt). */
function EuroInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Input
        inputMode="decimal"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0,00"
        className="h-12 w-32 text-right text-lg tabular-nums"
      />
      <span className="text-lg">€</span>
    </label>
  );
}

type TipChoice = "change" | "roundup" | "keep";

function PayForm({
  request: { member, dueCents, instant },
  snapshot,
  onConfirm,
}: {
  request: PayRequest;
  snapshot: ThekeSnapshot;
  onConfirm: (result: PayResult) => void;
}) {
  const methods = snapshot.paymentMethods;
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "cash");

  // Betrag (Teilzahlung nur beim offenen Betrag, nicht bei „Sofort bezahlen“)
  const [payText, setPayText] = useState(formatCentsPlain(dueCents));
  const payCents = Math.min(parseEuroToCents(payText) ?? 0, dueCents);
  const partial = !instant ? [500, 1000, 2000, 5000].filter((c) => c < dueCents) : [];

  // Bar: gegeben + Rückgeld/Trinkgeld
  const [givenText, setGivenText] = useState("");
  const givenCents = givenText ? (parseEuroToCents(givenText) ?? 0) : payCents;
  const [tipChoice, setTipChoice] = useState<TipChoice>("change");
  const roundUpCents = Math.ceil(payCents / 100) * 100;
  const canRoundUp = roundUpCents > payCents && givenCents > roundUpCents;
  const tipForCash =
    givenCents <= payCents ? 0 : tipChoice === "keep" ? givenCents - payCents : tipChoice === "roundup" && canRoundUp ? roundUpCents - payCents : 0;
  const change = givenCents - payCents - tipForCash;

  // PayPal: Betrag laut PayPal-App (mehr = Trinkgeld)
  const [receivedText, setReceivedText] = useState("");
  const receivedCents = receivedText ? (parseEuroToCents(receivedText) ?? 0) : payCents;
  const [paypalSeen, setPaypalSeen] = useState(false);
  const link = methodId === "paypal" && snapshot.paypalName && payCents > 0 ? paypalMeLink(snapshot.paypalName, payCents) : null;

  const result: PayResult | null = useMemo(() => {
    if (payCents <= 0) return null;
    if (methodId === "paypal") {
      if (receivedCents <= 0) return null;
      const amountCents = Math.min(receivedCents, payCents);
      return { methodId, amountCents, tipCents: receivedCents - amountCents, cashGivenCents: null };
    }
    if (givenCents < payCents) return null; // es fehlt noch Geld
    return { methodId, amountCents: payCents, tipCents: tipForCash, cashGivenCents: givenText ? givenCents : null };
  }, [methodId, payCents, receivedCents, givenCents, givenText, tipForCash]);

  const ready = !!result && (methodId !== "paypal" || paypalSeen);
  const rest = dueCents - (result?.amountCents ?? 0);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-2xl">{instant ? "Sofort bezahlen" : "Bezahlen"}</DialogTitle>
        <DialogDescription className="text-base">
          {member.name} · {instant ? "Warenkorb" : "offen"}{" "}
          <strong className="text-foreground tabular-nums">{formatCents(dueCents)}</strong>
        </DialogDescription>
      </DialogHeader>

      {/* Zahlungsart (nur wenn es mehr als eine gibt) */}
      {methods.length > 1 && (
        <div role="radiogroup" aria-label="Zahlungsart" className="grid grid-cols-2 gap-2">
          {methods.map((m) => {
            const Icon = m.id === "paypal" ? Smartphone : Banknote;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={methodId === m.id}
                onClick={() => setMethodId(m.id)}
                className={cn(
                  "flex h-14 items-center justify-center gap-2 rounded-2xl border-2 text-lg font-semibold",
                  methodId === m.id ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-muted",
                )}
              >
                <Icon className="size-6" /> {m.label}
              </button>
            );
          })}
        </div>
      )}
      {!snapshot.paypalName && (
        <p className="-mt-2 text-sm text-muted-foreground">PayPal: erst PayPal.me-Name in den Einstellungen eintragen.</p>
      )}

      {/* Betrag / Teilzahlung */}
      {!instant && (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Wie viel wird bezahlt?</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={payCents === dueCents} onClick={() => setPayText(formatCentsPlain(dueCents))}>
              Alles
            </Chip>
            {partial.map((c) => (
              <Chip key={c} active={payCents === c} onClick={() => setPayText(formatCentsPlain(c))}>
                {formatCents(c)}
              </Chip>
            ))}
            <EuroInput label="Betrag" value={payText} onChange={setPayText} />
          </div>
          {payCents > 0 && rest > 0 && (
            <p className="text-muted-foreground">
              Teilzahlung – danach noch <strong className="tabular-nums">{formatCents(rest)}</strong> offen.
            </p>
          )}
        </section>
      )}

      {methodId === "paypal" ? (
        <section className="flex flex-col items-center gap-3">
          {link && <PaypalQr link={link} />}
          <p className="text-center text-muted-foreground">
            Mit der Handy-Kamera scannen – PayPal öffnet sich mit{" "}
            <strong className="text-foreground tabular-nums">{formatCents(payCents)}</strong>.
          </p>
          <EuroInput label="Eingegangen laut PayPal" value={receivedText || formatCentsPlain(payCents)} onChange={setReceivedText} />
          {result && result.tipCents > 0 && (
            <p className="font-semibold text-primary">+ {formatCents(result.tipCents)} Trinkgeld</p>
          )}
          <label className="flex items-center gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-base font-medium">
            <input
              type="checkbox"
              checked={paypalSeen}
              onChange={(e) => setPaypalSeen(e.target.checked)}
              className="size-6 accent-(--primary)"
            />
            Ich sehe den Eingang in der PayPal-App
          </label>
        </section>
      ) : (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Gegeben</h3>
          <div className="flex flex-wrap items-center gap-2">
            {cashSuggestions(payCents).map((c) => (
              <Chip key={c} active={givenCents === c} onClick={() => setGivenText(formatCentsPlain(c))}>
                {c === payCents ? "Passend" : formatCents(c)}
              </Chip>
            ))}
            <EuroInput label="Anderer Betrag" value={givenText} onChange={setGivenText} />
          </div>
          {givenCents < payCents ? (
            <p className="font-semibold text-highlight tabular-nums">Es fehlen noch {formatCents(payCents - givenCents)}.</p>
          ) : givenCents > payCents ? (
            <div className="flex flex-wrap gap-2">
              <Chip active={tipChoice === "change"} onClick={() => setTipChoice("change")}>
                Rückgeld {formatCents(givenCents - payCents)}
              </Chip>
              {canRoundUp && (
                <Chip active={tipChoice === "roundup"} onClick={() => setTipChoice("roundup")}>
                  Aufrunden auf {formatCents(roundUpCents)}
                </Chip>
              )}
              <Chip active={tipChoice === "keep"} onClick={() => setTipChoice("keep")}>
                Stimmt so
              </Chip>
            </div>
          ) : null}
        </section>
      )}

      <DialogFooter className="flex-col sm:flex-col sm:justify-start">
        {/* Rückgeld steht direkt über dem Knopf – immer sichtbar, auch wenn der Dialog scrollt */}
        {methodId !== "paypal" && givenCents > payCents && (
          <p className="flex items-baseline justify-center gap-3 text-secondary-foreground" data-testid="rueckgeld">
            <span>Rückgeld</span>
            <span className="font-heading text-4xl font-bold tabular-nums">{formatCents(change)}</span>
            {tipForCash > 0 && <span className="font-semibold">+ {formatCents(tipForCash)} Trinkgeld</span>}
          </p>
        )}
        <Button size="lg" className="h-14 w-full text-lg" disabled={!ready} onClick={() => result && onConfirm(result)}>
          {methodId === "paypal" ? "PayPal-Eingang bestätigen" : "Bar kassiert"}
          {result && <span className="tabular-nums"> · {formatCents(result.amountCents + result.tipCents)}</span>}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Großer QR-Code mit dem PayPal.me-Link (lokal als Bild erzeugt, kein externer Dienst). */
function PaypalQr({ link }: { link: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(link, { margin: 1, width: 480, errorCorrectionLevel: "M" }).then((url) => !cancelled && setSrc(url));
    return () => {
      cancelled = true;
    };
  }, [link]);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="size-60 rounded-2xl bg-white p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- lokal erzeugtes Bild (data:-URL) */}
        {src && <img src={src} alt="PayPal-QR-Code" className="size-full" />}
      </div>
      <p className="text-sm break-all text-muted-foreground" data-testid="paypal-link">
        {link}
      </p>
    </div>
  );
}
