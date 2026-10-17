"use client";

import { ChefHat, Pencil, Plus, Sparkles, Star } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ARTICLE_ICONS, ArticleIcon } from "@/components/article-icon";
import { ActionForm, FormError, SubmitButton, TextField } from "@/components/form";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { SPECIAL_ICONS } from "@/domain/menu";
import type { ActionResult } from "@/lib/form-utils";
import { formatCents, formatCentsPlain } from "@/lib/money";
import type { SpecialRow, TipSuggestion } from "@/server/today";
import { offerSpecialTodayAction, saveSpecialAction, saveTipAction } from "@/server/today-actions";

function useToastOnSuccess(state: ActionResult | undefined, after?: () => void) {
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Gespeichert");
      after?.();
    }
  }, [state, after]);
}

/** Selbst Gekochtes: für heute ein-/ausschalten, anlegen, ändern. */
export function SpecialsCard({ specials, day }: { specials: SpecialRow[]; day: string }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | "neu" | null>(specials.length === 0 ? "neu" : null);
  const toggle = (s: SpecialRow, on: boolean) =>
    startTransition(async () => {
      const r = await offerSpecialTodayAction(s.id, on);
      if (r.ok) toast.success(r.message ?? "Gespeichert");
      else toast.error(r.error ?? "Nicht möglich");
    });

  return (
    <Card data-testid="selbst-gekocht">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ChefHat className="size-5" aria-hidden /> Heute frisch gekocht
        </CardTitle>
        <CardDescription>
          Was du selbst kochst (Eintopf, Salat …): für heute einschalten – dann steht es auf der Karte und an der Theke. Morgen ist es von
          selbst wieder aus. Heute ist {day}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {specials.length > 0 && (
          <ul className="flex flex-col divide-y">
            {specials.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <ArticleIcon icon={s.icon} className="size-9 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {s.name} · {formatCents(s.priceCents)} {s.offeredToday && <Badge>heute im Angebot</Badge>}
                    </p>
                    {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Switch
                      checked={s.offeredToday}
                      disabled={pending}
                      onCheckedChange={(on) => toggle(s, on)}
                      aria-label={`${s.name} heute anbieten`}
                    />
                    heute
                  </label>
                  <Button variant="ghost" size="icon-lg" aria-label={`${s.name} bearbeiten`} onClick={() => setEditing(editing === s.id ? null : s.id)}>
                    <Pencil />
                  </Button>
                </div>
                {editing === s.id && <SpecialForm special={s} onDone={() => setEditing(null)} />}
              </li>
            ))}
          </ul>
        )}
        {editing === "neu" ? (
          <SpecialForm onDone={() => setEditing(null)} />
        ) : (
          <div>
            <Button variant="outline" onClick={() => setEditing("neu")}>
              <Plus /> Neues Gericht
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SpecialForm({ special, onDone }: { special?: SpecialRow; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveSpecialAction, undefined);
  useToastOnSuccess(state, onDone);
  const e = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <ActionForm action={action} pending={pending} className="flex flex-col gap-4 rounded-2xl bg-muted/50 p-4">
      <input type="hidden" name="id" value={special?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <TextField label="Gericht" name="name" defaultValue={special?.name} placeholder="z. B. Eintopf" maxLength={40} required error={e.name} />
        <TextField
          label="Preis (€)"
          name="price"
          inputMode="decimal"
          defaultValue={special ? formatCentsPlain(special.priceCents) : ""}
          placeholder="4,50"
          required
          error={e.price}
        />
      </div>
      <TextField
        label="Beschreibung für die Karte (optional)"
        name="description"
        defaultValue={special?.description ?? ""}
        placeholder="z. B. Linsen mit Mettwurst, dazu Brot"
        maxLength={100}
        error={e.description}
        description="Kannst du jedes Mal anpassen, wenn du etwas anderes kochst."
      />
      <Field data-invalid={e.icon ? true : undefined}>
        <FieldLabel htmlFor={`icon-${special?.id ?? "neu"}`}>Symbol</FieldLabel>
        <NativeSelect id={`icon-${special?.id ?? "neu"}`} name="icon" defaultValue={special?.icon ?? "soup"}>
          {SPECIAL_ICONS.map((i) => (
            <option key={i} value={i}>
              {ARTICLE_ICONS[i].label}
            </option>
          ))}
        </NativeSelect>
        {e.icon && <FieldError>{e.icon}</FieldError>}
      </Field>
      <Field orientation="horizontal">
        <Switch id={`orderable-${special?.id ?? "neu"}`} name="orderable" defaultChecked={special?.orderable ?? false} />
        <div>
          <FieldLabel htmlFor={`orderable-${special?.id ?? "neu"}`}>Per Handy bestellbar</FieldLabel>
          <FieldDescription>Wenn an der Theke „Küche offen“ ist.</FieldDescription>
        </div>
      </Field>
      {!special && (
        <Field orientation="horizontal">
          <Switch id="today-neu" name="today" defaultChecked />
          <FieldLabel htmlFor="today-neu">Gleich für heute anbieten</FieldLabel>
        </Field>
      )}
      <FormError message={state && !state.ok ? state.error : undefined} />
      <div className="flex gap-2">
        <SubmitButton>{special ? "Speichern" : "Gericht anlegen"}</SubmitButton>
        <Button type="button" variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </ActionForm>
  );
}

/** „Tipp des Hauses“ – mit Vorschlägen, was schon lange im Schrank steht. */
export function TipCard({
  tip,
  options,
  suggestions,
}: {
  tip: { articleId: string | null; text: string | null };
  options: { id: string; name: string }[];
  suggestions: TipSuggestion[];
}) {
  const [state, action, pending] = useActionState(saveTipAction, undefined);
  useToastOnSuccess(state);
  const [articleId, setArticleId] = useState(tip.articleId ?? "");
  const e = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <Card data-testid="tipp">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="size-5" aria-hidden /> Tipp des Hauses
        </CardTitle>
        <CardDescription>
          Steht ganz oben auf der Karte – gut für alles, was schon länger im Schrank steht. Ist der Artikel aus, verschwindet der Tipp
          von selbst.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4" aria-hidden /> Steht schon lange da:
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setArticleId(s.id)}
                  aria-pressed={articleId === s.id}
                  className="rounded-full border bg-card px-3 py-1.5 text-left text-sm hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                >
                  <span className="font-semibold">{s.name}</span> · {s.reach === null ? "zuletzt nichts verkauft" : `reicht noch ca. ${s.reach} Abende`}
                </button>
              ))}
            </div>
          </div>
        )}
        <ActionForm action={action} pending={pending} className="flex flex-col gap-4">
          <Field data-invalid={e.articleId ? true : undefined}>
            <FieldLabel htmlFor="tip-article">Artikel</FieldLabel>
            <NativeSelect id="tip-article" name="articleId" value={articleId} onChange={(ev) => setArticleId(ev.target.value)}>
              <option value="">– kein Tipp –</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
            {e.articleId && <FieldError>{e.articleId}</FieldError>}
          </Field>
          <TextField
            label="Spruch (optional)"
            name="text"
            defaultValue={tip.text ?? ""}
            placeholder="z. B. Muss weg – heute gern ein Gläschen!"
            maxLength={80}
            error={e.text}
          />
          <FormError message={state && !state.ok ? state.error : undefined} />
          <div>
            <SubmitButton>Speichern</SubmitButton>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
