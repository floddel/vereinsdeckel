"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ARTICLE_ICONS } from "@/components/article-icon";
import { ActionForm, FormError, SubmitButton, TextField } from "@/components/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BOTTLE_PRESETS, formatVolume, SERVING_PRESETS } from "@/domain/volume";
import { formatCentsPlain } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deleteArticleAction, saveArticleAction, setArticleActiveAction } from "@/server/article-actions";
import type { ArticleRow, CategoryRow } from "@/server/queries/articles";
import { NativeSelect } from "@/components/native-select";

export function ArticleDialog({
  open,
  onOpenChange,
  article,
  categories,
  tallyGroups,
  stockSources,
  defaultCategoryId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article?: ArticleRow;
  categories: CategoryRow[];
  tallyGroups: string[];
  stockSources: StockSource[];
  defaultCategoryId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{article ? "Artikel bearbeiten" : "Neuer Artikel"}</DialogTitle>
        </DialogHeader>
        {open && (
          <ArticleForm
            key={article?.id ?? "neu"}
            article={article}
            categories={categories}
            tallyGroups={tallyGroups}
            stockSources={stockSources.filter((s) => s.id !== article?.id)}
            defaultCategoryId={defaultCategoryId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type StockSource = { id: string; name: string };

function ArticleForm({
  article,
  categories,
  tallyGroups,
  stockSources,
  defaultCategoryId,
  onDone,
}: {
  article?: ArticleRow;
  categories: CategoryRow[];
  tallyGroups: string[];
  stockSources: StockSource[];
  defaultCategoryId?: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveArticleAction, undefined);
  const [icon, setIcon] = useState(article?.icon ?? "beer");
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? defaultCategoryId ?? categories[0]?.id);
  const [kind, setKind] = useState<"stueck" | "ausschank">(article?.servingMl ? "ausschank" : "stueck");
  const [serving, setServing] = useState(article?.servingMl ? formatVolume(article.servingMl) : "");
  const [bottle, setBottle] = useState(article?.bottleMl ? formatVolume(article.bottleMl) : "");
  const [packSize, setPackSize] = useState(article?.packSize ? String(article.packSize) : "");
  const [stockArticleId, setStockArticleId] = useState(article?.stockArticleId ?? "");
  const kindChanged = !!article?.inUse && (kind === "ausschank") !== !!article.servingMl;
  // Fehlermeldung eines Felds ausblenden, sobald es nach dem Speichern-Versuch geändert wurde
  const [edited, setEdited] = useState<{ state: typeof state; fields: Set<string> }>({ state, fields: new Set() });
  if (edited.state !== state) setEdited({ state, fields: new Set() });
  const touch = (field: string) => setEdited((x) => ({ ...x, fields: new Set(x.fields).add(field) }));
  const err = (field: string) => (edited.fields.has(field) ? undefined : e[field]);
  const e = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Gespeichert");
      onDone();
    }
  }, [state, onDone]);

  return (
    <ActionForm action={action} pending={pending} className="flex flex-col gap-5">
      {article && <input type="hidden" name="id" value={article.id} />}
      <FieldGroup>
        <TextField label="Name" name="name" defaultValue={article?.name} required maxLength={40} error={e.name} autoFocus />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="f-categoryId">Kategorie</FieldLabel>
            <NativeSelect
              id="f-categoryId"
              name="categoryId"
              value={categoryId}
              onChange={(ev) => setCategoryId(ev.target.value)}
              className="h-9 w-full"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <TextField
            label="Vereinspreis (€)"
            name="price"
            inputMode="decimal"
            placeholder="2,00"
            defaultValue={article ? formatCentsPlain(article.priceCents) : ""}
            required
            error={e.price}
            description={article ? "Gilt nur für neue Buchungen." : undefined}
          />
        </div>

        <FieldSet>
          <FieldLegend variant="label">Symbol</FieldLegend>
          <input type="hidden" name="icon" value={icon} />
          <div role="radiogroup" aria-label="Symbol" className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {Object.entries(ARTICLE_ICONS).map(([key, { label, Icon }]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={icon === key}
                aria-label={label}
                title={label}
                onClick={() => setIcon(key)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-lg border hover:bg-muted",
                  icon === key && "border-primary bg-primary/12 ring-2 ring-primary hover:bg-primary/12",
                )}
              >
                <Icon className="size-9" />
              </button>
            ))}
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Verkauft als</FieldLegend>
          <input type="hidden" name="kind" value={kind} />
          <div role="radiogroup" aria-label="Verkauft als" className="grid grid-cols-2 gap-2">
            {(
              [
                ["stueck", "Stück / Flasche", "z. B. Bier 0,5 l, Wasser, Wurst"],
                ["ausschank", "Ausschank (Glas)", "z. B. Schnaps 2 cl, Cola 0,2 l, Wein"],
              ] as const
            ).map(([k, label, hint]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cn("rounded-xl border p-3 text-left", kind === k ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted")}
              >
                <span className="block font-semibold">{label}</span>
                <span className="text-sm text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
          {kind === "ausschank" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <VolumeField
                label="Portion"
                name="serving"
                value={serving}
                onChange={(v) => {
                  setServing(v);
                  touch("serving");
                }}
                presets={SERVING_PRESETS}
                error={err("serving")}
                placeholder="4 cl"
              />
              <VolumeField
                label="Übliche Flaschengröße"
                name="bottle"
                value={bottle}
                onChange={(v) => {
                  setBottle(v);
                  touch("bottle");
                }}
                presets={BOTTLE_PRESETS}
                error={err("bottle")}
                placeholder="0,7 l"
              />
              <FieldDescription className="sm:col-span-2">
                Der Bestand wird in Litern geführt. Andere Flaschengrößen (z. B. Cola 1,25 l) gibst du beim Einkauf an.
              </FieldDescription>
              {stockSources.length > 0 && (
                <Field className="sm:col-span-2" data-invalid={!!err("stockArticleId") || undefined}>
                  <FieldLabel htmlFor="f-stockArticleId">Bestand aus (optional)</FieldLabel>
                  <NativeSelect
                    id="f-stockArticleId"
                    name="stockArticleId"
                    value={stockArticleId}
                    onChange={(ev) => {
                      setStockArticleId(ev.target.value);
                      touch("stockArticleId");
                    }}
                    className="h-9 w-full"
                    aria-invalid={!!err("stockArticleId") || undefined}
                  >
                    <option value="">– eigener Bestand –</option>
                    {stockSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <FieldDescription>
                    Z. B. „Wein Flasche 1 l“ aus dem Bestand von „Wein Glas“: Verkäufe mindern dann den anderen Artikel, eingekauft und gezählt wird nur dort.
                  </FieldDescription>
                  {err("stockArticleId") && <FieldError>{err("stockArticleId")}</FieldError>}
                </Field>
              )}
            </div>
          ) : (
            <TextField
              label="Stück je Kiste (optional)"
              name="packSize"
              inputMode="numeric"
              value={packSize}
              onChange={(ev) => {
                setPackSize(ev.target.value);
                touch("packSize");
              }}
              placeholder="z. B. 20"
              error={err("packSize")}
              description="Dann kannst du beim Einkauf und bei der Inventur in Kisten zählen."
            />
          )}
          {kindChanged && (
            <p role="status" className="rounded-lg bg-highlight/10 px-3 py-2 text-sm">
              Nach dem Umstellen bitte eine Inventur für diesen Artikel machen, damit der Bestand wieder stimmt.
            </p>
          )}
        </FieldSet>

        <TextField
          label="Strich-Gruppe auf dem Bierdeckel (optional)"
          name="tallyGroup"
          defaultValue={article?.tallyGroup ?? ""}
          list="tally-groups"
          maxLength={30}
          error={e.tallyGroup}
          description="Artikel mit gleicher Gruppe werden zusammen gestrichelt, z. B. Pils und Radler als „Bier“."
        />
        <datalist id="tally-groups">
          {tallyGroups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>

        <TextField
          label="Beschreibung für die Karte (optional)"
          name="description"
          defaultValue={article?.description ?? ""}
          maxLength={100}
          error={e.description}
          description="Steht für alle sichtbar auf der Karte „Heute an der Theke“, z. B. „fruchtig, halbtrocken“."
        />

        <Field data-invalid={e.note ? true : undefined}>
          <FieldLabel htmlFor="f-note">Notiz (nur für die Verwaltung, optional)</FieldLabel>
          <Textarea id="f-note" name="note" defaultValue={article?.note ?? ""} maxLength={300} rows={2} placeholder="z. B. Captain Morgan, Smirnoff, Jägermeister …" />
          <FieldDescription>Welche Marken oder Sorten dazugehören – erscheint bei Artikeln, Bestand und Inventur, nicht an der Theke.</FieldDescription>
          {e.note && <FieldError>{e.note}</FieldError>}
        </Field>

        <Field orientation="horizontal">
          <Switch id="f-trackStock" name="trackStock" defaultChecked={article?.trackStock ?? true} />
          <div>
            <FieldLabel htmlFor="f-trackStock">Bestand führen</FieldLabel>
            <FieldDescription>Aus z. B. bei Spenden oder Pfand.</FieldDescription>
          </div>
        </Field>
        {categoryId === "essen" && (
          <Field orientation="horizontal">
            <Switch id="f-orderable" name="orderable" defaultChecked={article?.orderable ?? false} />
            <div>
              <FieldLabel htmlFor="f-orderable">Per Handy bestellbar</FieldLabel>
              <FieldDescription>Mitglieder können es über ihren Link bestellen, wenn an der Theke „Küche offen“ ist.</FieldDescription>
            </div>
          </Field>
        )}
        {categoryId === "essen" && (
          <Field orientation="horizontal">
            <Switch id="f-dailySpecial" name="dailySpecial" defaultChecked={article?.dailySpecial ?? false} />
            <div>
              <FieldLabel htmlFor="f-dailySpecial">Selbst gekocht (nur an einzelnen Tagen)</FieldLabel>
              <FieldDescription>
                Erscheint an der Theke und auf der Karte nur, wenn du es unter „Heute“ für den Abend einschaltest – am nächsten Tag
                verschwindet es von selbst.
              </FieldDescription>
            </div>
          </Field>
        )}
        <Field orientation="horizontal">
          <Switch id="f-active" name="active" defaultChecked={article?.active ?? true} />
          <div>
            <FieldLabel htmlFor="f-active">Aktiv</FieldLabel>
            <FieldDescription>
              Für ausgemusterte Artikel: Inaktive erscheinen nirgends mehr, auch nicht im Bestand. Nur mal nicht da? Dafür ist der Schalter in der Liste.
            </FieldDescription>
          </div>
        </Field>
      </FieldGroup>
      <FormError message={state && !state.ok ? state.error : undefined} />
      <DialogFooter className="sm:justify-between">
        {article ? <DeleteArticle article={article} onDone={onDone} /> : <span />}
        <SubmitButton size="lg">Speichern</SubmitButton>
      </DialogFooter>
    </ActionForm>
  );
}

/** Löschen – nur für nie verwendete Artikel. Sonst Erklärung und „Stattdessen inaktiv setzen“. */
function DeleteArticle({ article, onDone }: { article: ArticleRow; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<void>) => startTransition(fn);
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button type="button" variant="ghost" className="text-destructive" disabled={pending}>
            <Trash2 /> Löschen
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{article.inUse ? "Löschen nicht möglich" : `„${article.name}“ löschen?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {article.inUse
              ? `„${article.name}“ wurde schon gebucht, eingekauft oder gezählt und muss für Kassenzettel, Bestand und Statistik erhalten bleiben. ${
                  article.active ? "Setz ihn stattdessen auf inaktiv – dann erscheint er nicht mehr an der Theke." : "Er ist schon inaktiv und erscheint nicht mehr an der Theke."
                }`
              : "Der Artikel wurde noch nie verwendet und wird endgültig gelöscht."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{article.inUse && !article.active ? "Schließen" : "Abbrechen"}</AlertDialogCancel>
          {!article.inUse && (
            <AlertDialogAction
              onClick={() =>
                run(async () => {
                  const r = await deleteArticleAction(article.id);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(`„${article.name}“ gelöscht`);
                  onDone();
                })
              }
            >
              Endgültig löschen
            </AlertDialogAction>
          )}
          {article.inUse && article.active && (
            <AlertDialogAction
              onClick={() =>
                run(async () => {
                  await setArticleActiveAction(article.id, false);
                  toast.success(`„${article.name}“ ist jetzt inaktiv`);
                  onDone();
                })
              }
            >
              Stattdessen inaktiv setzen
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Mengenfeld mit Schnellwahl (z. B. „2 cl“, „4 cl“, „0,2 l“). Eingabe auch frei: „35 ml“, „1,25“. */
function VolumeField({
  label,
  name,
  value,
  onChange,
  presets,
  error,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  presets: readonly number[];
  error?: string;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <TextField label={label} name={name} value={value} onChange={(ev) => onChange(ev.target.value)} placeholder={placeholder} error={error} />
      <div role="group" className="flex flex-wrap gap-1.5" aria-label={`${label}: Schnellwahl`}>
        {presets.map((ml) => {
          const v = formatVolume(ml);
          return (
            <button
              key={ml}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={value === v}
              className={cn("h-8 rounded-full border px-3 text-sm", value === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}
