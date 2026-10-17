"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ArticleUnit, describeStock, isServed } from "@/domain/stock";
import { bottlesToMl, FRACTION_LABEL, FRACTIONS, formatVolume, oneDecimal, parseVolumeMl } from "@/domain/volume";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { saveInventoryAction } from "@/server/stock-actions";

export type InventoryRow = ArticleUnit & { articleId: string; name: string; note: string | null; categoryName: string; stock: number };

/** Eingabe je Artikel: Kisten, Stück bzw. volle Flaschen, angebrochene Flasche. */
type Entry = { crates: string; count: string; fraction: number };
const empty: Entry = { crates: "", count: "", fraction: 0 };
const fmt = { volume: formatVolume, decimal: oneDecimal };
const int = (v: string) => (v.trim() === "" ? 0 : /^\d+$/.test(v.trim()) ? Number(v) : NaN);

/** Gezählte Menge in Bestandseinheit (Stück bzw. ml) – oder null, wenn (noch) nichts eingetragen ist. */
function counted(r: InventoryRow, e: Entry): number | null {
  if (!e.crates.trim() && !e.count.trim() && e.fraction === 0) return null;
  if (isServed(r)) {
    if (!r.bottleMl) return parseVolumeMl(e.count); // ohne Flaschengröße: direkt in Litern
    const full = int(e.count);
    return Number.isFinite(full) ? bottlesToMl(full, e.fraction, r.bottleMl) : NaN;
  }
  return int(e.crates) * (r.packSize ?? 0) + int(e.count);
}

function diffText(r: InventoryRow, diff: number) {
  if (diff === 0) return "stimmt";
  const sign = diff > 0 ? "+" : "−";
  return isServed(r) ? `${sign}${formatVolume(Math.abs(diff))}` : `${sign}${Math.abs(diff)}`;
}

export function InventoryForm({ rows }: { rows: InventoryRow[] }) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const values = rows.map((r) => ({ r, value: counted(r, entries[r.articleId] ?? empty) }));
  const filled = values.filter((v): v is { r: InventoryRow; value: number } => v.value !== null);

  const set = (id: string, patch: Partial<Entry>) => {
    setError(null);
    setEntries((all) => ({ ...all, [id]: { ...(all[id] ?? empty), ...patch } }));
  };

  const save = () => {
    const bad = filled.find((v) => !Number.isFinite(v.value) || v.value < 0);
    if (bad) return setError(`${bad.r.name}: bitte ganze Zahlen eingeben`);
    startTransition(async () => {
      const result = await saveInventoryAction({ note, lines: filled.map((v) => ({ articleId: v.r.articleId, countedQty: v.value })) });
      if (result && !result.ok) setError(result.error);
    });
  };

  return (
    // Bis die Seite fertig geladen ist, gesperrt – sonst gingen frühe Eingaben verloren.
    <fieldset disabled={!hydrated} className="flex max-w-2xl flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const e = entries[r.articleId] ?? empty;
          const value = counted(r, e);
          const diff = value !== null && Number.isFinite(value) ? value - r.stock : null;
          const served = isServed(r);
          return (
            <li key={r.articleId} data-testid="inventur-zeile" className="flex flex-col gap-2 rounded-2xl bg-card p-3 shadow-soft dark:ring-1 dark:ring-white/5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="font-medium">
                  {r.name}
                  {r.note && <span className="block text-sm font-normal text-muted-foreground">{r.note}</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  berechnet {describeStock(r, r.stock, fmt)}
                  {diff !== null && (
                    <span className={cn("font-semibold", diff < 0 ? "text-destructive" : "text-primary")}> · {diffText(r, diff)}</span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!served && r.packSize && (
                  <Input
                    aria-label={`${r.name} Kisten`}
                    inputMode="numeric"
                    placeholder={`Kisten à ${r.packSize}`}
                    value={e.crates}
                    onChange={(ev) => set(r.articleId, { crates: ev.target.value })}
                    className="h-11 w-36 text-base"
                  />
                )}
                <Input
                  aria-label={served ? (r.bottleMl ? `${r.name} volle Flaschen` : `${r.name} Liter`) : r.packSize ? `${r.name} einzeln` : `${r.name} gezählt`}
                  inputMode={served && !r.bottleMl ? "decimal" : "numeric"}
                  placeholder={served ? (r.bottleMl ? `volle à ${formatVolume(r.bottleMl)}` : "Liter") : r.packSize ? "einzeln" : "gezählt"}
                  value={e.count}
                  onChange={(ev) => set(r.articleId, { count: ev.target.value })}
                  className="h-11 w-36 text-base"
                />
                {served && r.bottleMl && (
                  <div role="radiogroup" aria-label={`${r.name} angebrochene Flasche`} className="flex items-center gap-1">
                    <span className="mr-1 text-sm text-muted-foreground">+ angebrochen:</span>
                    {FRACTIONS.map((f) => (
                      <button
                        key={f}
                        type="button"
                        role="radio"
                        aria-checked={e.fraction === f}
                        aria-label={f === 0 ? "keine angebrochene" : `${FRACTION_LABEL[f]} Flasche`}
                        onClick={() => set(r.articleId, { fraction: f })}
                        className={cn(
                          "h-11 min-w-11 rounded-full border px-3 font-semibold",
                          e.fraction === f ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                        )}
                      >
                        {f === 0 ? "–" : FRACTION_LABEL[f]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Input aria-label="Notiz" placeholder="Notiz (optional), z. B. Saisonstart" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="h-11 text-base" />
      <FormError message={error ?? undefined} />
      <Button size="lg" className="h-12 self-start px-6 text-base" disabled={pending || filled.length === 0} onClick={save}>
        {pending ? "Bitte warten …" : `Inventur speichern (${filled.length} Artikel)`}
      </Button>
    </fieldset>
  );
}
