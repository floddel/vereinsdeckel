"use client";

import { Camera, Loader2, Plus, ScanText, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PURCHASE_SOURCES, type PurchaseSource, SOURCE_LABEL, unitCostLabel } from "@/domain/purchase";
import { costPerUnitCents, isServed } from "@/domain/stock";
import { BOTTLE_PRESETS, formatVolume, parseVolumeMl } from "@/domain/volume";
import type { Suggestion } from "@/domain/receipt-recognition";
import { formatCents, formatCentsPlain, parseEuroToCents } from "@/lib/money";
import { resizeImage } from "@/lib/resize-image";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";
import { uuid } from "@/lib/uuid";
import { recognizeReceiptAction, savePurchaseAction } from "@/server/purchase-actions";

export interface FormArticle {
  id: string;
  name: string;
  priceCents: number;
  servingMl: number | null;
  bottleMl: number | null;
  packSize: number | null;
}

/**
 * Eine Position. `count` = Stück bzw. Flaschen, `crates` = Kisten (nur mit Kistengröße).
 * Vom Bon erkannt: `receiptText`/`receiptQty` (zum Lernen), `fromAlias` = aus gelernter Zuordnung.
 */
type Line = {
  key: string;
  articleId: string;
  description: string;
  crates: string;
  count: string;
  bottle: string;
  total: string;
  receiptText?: string;
  receiptQty?: number;
  fromAlias?: boolean;
};

const NO_ARTICLE = "";
const emptyLine = (): Line => ({ key: uuid(), articleId: NO_ARTICLE, description: "", crates: "", count: "", bottle: "", total: "" });
const int = (v: string) => (v.trim() === "" ? 0 : /^\d+$/.test(v.trim()) ? Number(v) : NaN);

const SOURCE_HINT: Record<PurchaseSource, string> = {
  cash: "Geld aus der Handkasse",
  paypal: "Vom PayPal-Konto des Vereins",
  private: "Selbst ausgelegt – wird als Auslage vermerkt",
  opening: "Ware war schon da (eigene Ware) – zählt für Bestand und Warenwert, ohne Kasse und ohne Auslage",
};

export function PurchaseForm({
  groups,
  today,
  aiEnabled,
}: {
  groups: { name: string; articles: FormArticle[] }[];
  today: string;
  /** Kassenbon-Erkennung eingeschaltet (Einstellungen) */
  aiEnabled: boolean;
}) {
  const articles = new Map(groups.flatMap((g) => g.articles).map((a) => [a.id, a]));
  const [purchasedOn, setPurchasedOn] = useState(today);
  const [source, setSource] = useState<PurchaseSource>("cash");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [emptyLine()]);
  const [receiptTotal, setReceiptTotal] = useState("");
  const [receipt, setReceiptState] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [recognizing, startRecognizing] = useTransition();
  // Foto-Auswahl erst nach dem Start der Seite – vorher ginge sie verloren
  const hydrated = useHydrated();
  const [recognized, setRecognized] = useState<{ count: number; merchant: string | null } | null>(null);

  // Vorschau-Adresse beim Wechsel und beim Verlassen der Seite wieder freigeben
  const previewUrl = useRef<string | null>(null);
  useEffect(() => () => void (previewUrl.current && URL.revokeObjectURL(previewUrl.current)), []);
  function setReceipt(f: File | null) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = f ? URL.createObjectURL(f) : null;
    setReceiptState(f && previewUrl.current ? { file: f, url: previewUrl.current } : null);
  }

  const update = (key: string, patch: Partial<Line>) => {
    setError(null); // alte Meldung passt nach einer Änderung nicht mehr
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // neuer Artikel: übliche Flaschengröße vorschlagen
        if (patch.articleId !== undefined && patch.articleId !== l.articleId) {
          const a = articles.get(patch.articleId);
          next.bottle = a?.bottleMl ? formatVolume(a.bottleMl) : "";
        }
        return next;
      }),
    );
  };

  /** Kassenbon fotografieren → KI liest ihn → Formular ausfüllen (Foto wird gleich der Beleg). */
  function recognize(file: File) {
    setError(null);
    setReceipt(file);
    startRecognizing(async () => {
      const fd = new FormData();
      try {
        const blob = await resizeImage(file, { maxSize: 2000, type: "image/jpeg", quality: 0.85 });
        fd.set("image", new File([blob], "bon.jpg", { type: "image/jpeg" }));
      } catch {
        return setError("Das Foto konnte nicht gelesen werden");
      }
      const r = await recognizeReceiptAction(fd);
      if (!r.ok) return setError(r.error);
      applySuggestion(r.suggestion);
    });
  }

  function applySuggestion(sug: Suggestion) {
    setLines(
      sug.lines.map((l) => {
        const a = l.articleId ? articles.get(l.articleId) : undefined;
        const bottleMl = l.bottleMl ?? a?.bottleMl ?? null;
        return {
          key: uuid(),
          articleId: a ? a.id : NO_ARTICLE,
          description: a ? "" : l.description,
          crates: l.crates ? String(l.crates) : "",
          count: l.count ? String(l.count) : "",
          bottle: a?.servingMl && bottleMl ? formatVolume(bottleMl) : "",
          total: l.totalCents !== null ? formatCentsPlain(l.totalCents) : "",
          receiptText: l.receiptText,
          receiptQty: l.receiptQty,
          fromAlias: l.fromAlias,
        };
      }),
    );
    if (sug.purchasedOn && sug.purchasedOn <= today) setPurchasedOn(sug.purchasedOn);
    setReceiptTotal(sug.receiptTotalCents !== null ? formatCentsPlain(sug.receiptTotalCents) : "");
    if (sug.merchant && !note.trim()) setNote(sug.merchant);
    setRecognized({ count: sug.lines.length, merchant: sug.merchant });
  }

  const parsed = lines.map((l) => {
    const a = articles.get(l.articleId);
    const served = !!a && isServed(a);
    const crates = a?.packSize && !served ? int(l.crates) : 0;
    const qty = crates * (a?.packSize ?? 0) + int(l.count);
    const bottleMl = served ? parseVolumeMl(l.bottle) : null;
    const cents = l.total.trim() ? parseEuroToCents(l.total) : null;
    return { ...l, a, served, qty, bottleMl, cents, priceInvalid: !!l.total.trim() && (cents === null || cents < 0) };
  });
  const knownSum = parsed.reduce((s, l) => s + (l.cents ?? 0), 0);
  const receiptCents = receiptTotal.trim() ? parseEuroToCents(receiptTotal) : null;
  const total = receiptCents ?? knownSum;

  function submit() {
    setError(null);
    const filled = parsed.filter((l) => l.articleId || l.description.trim() || l.count || l.crates || l.total);
    if (filled.length === 0) return setError("Bitte mindestens eine Position eingeben");
    for (const [i, l] of filled.entries()) {
      const label = `Position ${i + 1}`;
      if (!l.articleId && !l.description.trim()) return setError(`${label}: Artikel wählen oder beschreiben`);
      if (!Number.isFinite(l.qty) || l.qty < 1) return setError(`${label}: Bitte die ${l.served ? "Anzahl Flaschen" : "Stückzahl"} eingeben`);
      if (l.served && !l.bottleMl) return setError(`${label}: Bitte die Flaschengröße angeben, z. B. 0,7 l`);
      if (l.priceInvalid) return setError(`${label}: Bitte einen gültigen Preis eingeben, z. B. 14,99`);
    }
    if (receiptTotal.trim() && (receiptCents === null || receiptCents < 0)) return setError("Bitte eine gültige Summe laut Bon eingeben");
    if (receiptCents === null && filled.some((l) => l.cents === null)) {
      return setError("Bitte bei jeder Position einen Preis eingeben – oder unten die Summe laut Bon");
    }
    if (receiptCents !== null && receiptCents < knownSum) return setError("Die Summe laut Bon ist kleiner als die Einzelpreise zusammen");

    startTransition(async () => {
      const fd = new FormData();
      fd.set(
        "data",
        JSON.stringify({
          purchasedOn,
          source,
          note,
          receiptTotalCents: receiptCents,
          // vom Bon erkannte und bestätigte Zeilen: Zuordnung merken
          learn: filled
            .filter((l) => l.receiptText && l.articleId)
            .map((l) => ({ receiptText: l.receiptText, receiptQty: l.receiptQty ?? 1, articleId: l.articleId, quantity: l.qty, bottleMl: l.bottleMl })),
          lines: filled.map((l) => ({
            articleId: l.articleId || null,
            description: l.description.trim(),
            quantity: l.qty,
            bottleMl: l.bottleMl,
            totalCents: l.cents,
          })),
        }),
      );
      if (receipt) {
        try {
          const blob = await resizeImage(receipt.file, { maxSize: 1600, type: "image/jpeg", quality: 0.8 });
          fd.set("receipt", new File([blob], "beleg.jpg", { type: "image/jpeg" }));
        } catch {
          return setError("Das Foto konnte nicht gelesen werden");
        }
      }
      const result = await savePurchaseAction(fd);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <form
      className="flex max-w-3xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* Bis die Seite fertig geladen ist, gesperrt – sonst gingen frühe Eingaben verloren. */}
      <fieldset disabled={!hydrated} className="contents">
        {aiEnabled ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-primary/10 p-4">
            <label
              className={cn(
                "flex h-14 w-fit cursor-pointer items-center gap-3 rounded-full bg-primary px-6 text-lg font-semibold text-primary-foreground shadow-soft",
                recognizing && "pointer-events-none opacity-70",
              )}
            >
              {recognizing ? <Loader2 className="size-6 animate-spin" /> : <ScanText className="size-6" />}
              {recognizing ? "Bon wird gelesen …" : "Kassenbon fotografieren"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Kassenbon fotografieren"
                disabled={recognizing || !hydrated}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) recognize(f);
                }}
              />
            </label>
            <p className="text-sm">
              {recognized ? (
                <span role="status" data-testid="erkannt">
                  <Sparkles className="mr-1 inline size-4" />
                  {recognized.count} {recognized.count === 1 ? "Position" : "Positionen"} erkannt{recognized.merchant ? ` (${recognized.merchant})` : ""}.
                  Bitte prüfen – farbig markierte Zeilen haben noch keinen Artikel.
                </span>
              ) : (
                "Die KI liest Positionen, Preise und Summe und füllt alles aus. Geht auch mit einem Foto der Kisten und Flaschen."
              )}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Tipp: In den Einstellungen lässt sich die Kassenbon-Erkennung per KI einschalten.</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="f-purchasedOn">Einkaufsdatum</FieldLabel>
            <Input id="f-purchasedOn" type="date" value={purchasedOn} max={today} onChange={(e) => setPurchasedOn(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-source">Bezahlt aus</FieldLabel>
            <NativeSelect id="f-source" value={source} onChange={(e) => setSource(e.target.value as PurchaseSource)} className="h-9 w-full">
              {PURCHASE_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
            <FieldDescription>{SOURCE_HINT[source]}</FieldDescription>
          </Field>
        </div>

        <section aria-labelledby="positionen" className="flex flex-col gap-3">
          <div>
            <h2 id="positionen" className="font-heading text-xl font-bold">
              Positionen
            </h2>
            <p className="text-sm text-muted-foreground">
              Preise sind freiwillig – wer keine Lust hat, alles abzutippen, gibt unten nur die Summe laut Bon an.
            </p>
          </div>
          <datalist id="flaschengroessen">
            {BOTTLE_PRESETS.map((ml) => (
              <option key={ml} value={formatVolume(ml)} />
            ))}
          </datalist>
          {parsed.map((l, i) => {
            const pack = l.a?.packSize && !l.served ? l.a.packSize : null;
            const unit =
              l.a && l.cents !== null && l.qty > 0 && (!l.served || l.bottleMl)
                ? unitCostLabel(costPerUnitCents(l.a, l.cents, l.qty, l.bottleMl), l.a.priceCents, l.served ? formatVolume(l.a.servingMl!) : "Stück")
                : null;
            return (
              <fieldset
                key={l.key}
                aria-label={`Position ${i + 1}`}
                data-testid="position"
                className={cn(
                  "flex flex-col gap-3 rounded-2xl bg-card p-3 shadow-soft dark:ring-1 dark:ring-white/5",
                  // Umrandung statt ring: der Schatten der Karte würde einen ring überdecken
                  l.receiptText && !l.articleId && "outline-2 outline-highlight",
                )}
              >
                {l.receiptText && (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    Auf dem Bon: <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{l.receiptText}</code>
                    {l.fromAlias && <span className="font-medium text-primary">✓ gelernt</span>}
                    {!l.articleId && <span className="font-medium text-highlight">kein Artikel – wählen oder als Freitext lassen</span>}
                  </p>
                )}
                <div className="flex items-end gap-2">
                  <Field className="min-w-0 flex-1">
                    <FieldLabel htmlFor={`a-${l.key}`}>Artikel</FieldLabel>
                    <NativeSelect id={`a-${l.key}`} value={l.articleId} onChange={(e) => update(l.key, { articleId: e.target.value })} className="h-11 w-full">
                      <option value={NO_ARTICLE}>Ohne Artikel (z. B. Servietten, Pfand)</option>
                      {groups.map((g) => (
                        <optgroup key={g.name} label={g.name}>
                          {g.articles.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Position ${i + 1} entfernen`}
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {!l.articleId && (
                  <Input
                    aria-label={`Beschreibung Position ${i + 1}`}
                    placeholder="Was wurde gekauft?"
                    value={l.description}
                    maxLength={80}
                    onChange={(e) => update(l.key, { description: e.target.value })}
                    className="h-11 text-base"
                  />
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
                  {pack && (
                    <Field>
                      <FieldLabel htmlFor={`k-${l.key}`}>Kisten à {pack}</FieldLabel>
                      <Input id={`k-${l.key}`} inputMode="numeric" value={l.crates} onChange={(e) => update(l.key, { crates: e.target.value })} className="h-11 text-base" />
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor={`q-${l.key}`}>{l.served ? "Flaschen" : pack ? "Einzeln" : "Stück"}</FieldLabel>
                    <Input id={`q-${l.key}`} inputMode="numeric" value={l.count} onChange={(e) => update(l.key, { count: e.target.value })} className="h-11 text-base" />
                  </Field>
                  {l.served && (
                    <Field>
                      <FieldLabel htmlFor={`b-${l.key}`}>Größe je Flasche</FieldLabel>
                      <Input
                        id={`b-${l.key}`}
                        list="flaschengroessen"
                        value={l.bottle}
                        placeholder="0,7 l"
                        onChange={(e) => update(l.key, { bottle: e.target.value })}
                        className="h-11 text-base"
                      />
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor={`t-${l.key}`}>Preis gesamt (€)</FieldLabel>
                    <Input
                      id={`t-${l.key}`}
                      inputMode="decimal"
                      placeholder="optional"
                      value={l.total}
                      onChange={(e) => update(l.key, { total: e.target.value })}
                      className="h-11 text-base"
                    />
                  </Field>
                </div>
                {(pack || l.served) && l.qty > 0 && (
                  <p className="text-sm font-medium" data-testid="menge">
                    {l.served && l.bottleMl
                      ? `= ${formatVolume(l.qty * l.bottleMl)} ≈ ${Math.floor((l.qty * l.bottleMl) / l.a!.servingMl!)} × ${formatVolume(l.a!.servingMl!)}`
                      : `= ${l.qty} Stück`}
                  </p>
                )}
                {unit && (
                  <p className="text-sm text-muted-foreground" data-testid="stueckpreis">
                    {unit}
                  </p>
                )}
            </fieldset>
          );
        })}
        <Button type="button" variant="outline" className="self-start" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
          <Plus /> Weitere Position
        </Button>
      </section>

      <Field>
        <FieldLabel htmlFor="f-receiptTotal">Summe laut Bon (€, optional)</FieldLabel>
        <Input
          id="f-receiptTotal"
          inputMode="decimal"
          placeholder={knownSum ? formatCents(knownSum) : "z. B. 87,45"}
          value={receiptTotal}
          onChange={(e) => {
            setError(null);
            setReceiptTotal(e.target.value);
          }}
          className="h-11 max-w-xs text-base"
        />
        <FieldDescription>
          {receiptCents !== null && receiptCents > knownSum
            ? `Davon ${formatCents(receiptCents - knownSum)} ohne Einzelpreis – wird als „Rest laut Bon“ gespeichert.`
            : "Reicht statt der Einzelpreise. Für die Kasse zählt diese Summe."}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Beleg (Foto, optional)</FieldLabel>
        {receipt ? (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- lokale Vorschau vor dem Hochladen */}
            <img src={receipt.url} alt="Vorschau des Belegs" className="max-h-64 rounded-lg ring-1 ring-foreground/10" />
            <Button type="button" variant="secondary" size="icon" aria-label="Foto entfernen" onClick={() => setReceipt(null)} className="absolute top-2 right-2">
              <X />
            </Button>
          </div>
        ) : (
          <label className={cn("flex w-fit cursor-pointer items-center gap-2 rounded-full border bg-card px-4 py-2.5 font-medium hover:bg-muted")}>
            <Camera className="size-5" /> Foto aufnehmen oder wählen
            <input type="file" accept="image/*" className="sr-only" aria-label="Belegfoto" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="f-note">Notiz (optional)</FieldLabel>
        <Textarea id="f-note" value={note} maxLength={200} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Metro, für das Sommerfest" />
      </Field>

      <FormError message={error ?? undefined} />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" className="h-12 px-6 text-base" disabled={pending}>
          {pending ? "Bitte warten …" : `Einkauf speichern · ${formatCents(total)}`}
        </Button>
        {source === "private" && <p className="text-sm text-muted-foreground">Wird als Auslage vermerkt – die Erstattung buchst du unter Kasse.</p>}
      </div>
      </fieldset>
    </form>
  );
}
