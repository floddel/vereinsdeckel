"use client";

import { Check, ImageUp, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ActionForm, FormError, SubmitButton, TextField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ACCENTS, type AccentId, accentVars, applyAccent, CUSTOM_DEFAULT, customAccent, parseCustomAccent } from "@/lib/accent";
import type { ActionResult } from "@/lib/form-utils";
import { cn } from "@/lib/utils";
import { formatCentsPlain } from "@/lib/money";
import { isValidPaypalName, paypalMeLink } from "@/lib/paypal";
import { resizeImage } from "@/lib/resize-image";
import { useHydrated } from "@/lib/use-hydrated";
import { changePinAction, removeLogoAction, saveAccentAction, saveSettingsAction, uploadLogoAction } from "@/server/settings-actions";
import { NativeSelect } from "@/components/native-select";

export interface SettingsData {
  clubName: string;
  paypalName: string | null;
  warnLimitCents: number;
  businessDayCutoffHour: number;
  lowStockEvenings: number;
  logoFileId: string | null;
}

export function useToastOnSuccess(state: ActionResult | undefined, after?: () => void) {
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Gespeichert");
      after?.();
    }
  }, [state, after]);
}

export function GeneralSettingsForm({ s }: { s: SettingsData }) {
  const [state, action, pending] = useActionState(saveSettingsAction, undefined);
  const [paypal, setPaypal] = useState(s.paypalName ?? "");
  useToastOnSuccess(state);
  const e = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const cleaned = paypal.trim().replace(/^https?:\/\/(www\.)?paypal\.me\//i, "").replace(/\/.*$/, "");

  return (
    <ActionForm action={action} pending={pending} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Verein</CardTitle>
        </CardHeader>
        <CardContent>
          <TextField label="Vereinsname" name="clubName" defaultValue={s.clubName} required maxLength={60} error={e.clubName} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Theke und Bezahlen</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <TextField
              label="PayPal.me-Name"
              name="paypalName"
              value={paypal}
              onChange={(ev) => setPaypal(ev.target.value)}
              placeholder="z. B. TSVMusterstadt"
              error={e.paypalName}
              description={
                cleaned && isValidPaypalName(cleaned) ? (
                  <>
                    Beispiel-Link: <span className="font-medium break-all">{paypalMeLink(cleaned, 1450)}</span>
                  </>
                ) : (
                  "Leer lassen, wenn PayPal (noch) nicht genutzt wird."
                )
              }
            />
            <div className="grid gap-4 md:grid-cols-3">
              <TextField
                label="Warnung ab offenem Betrag (€)"
                name="warnLimit"
                inputMode="decimal"
                defaultValue={formatCentsPlain(s.warnLimitCents)}
                error={e.warnLimit}
                description="0 = keine Warnung"
              />
              <Field>
                <FieldLabel htmlFor="f-cutoffHour">Neuer Abend beginnt um</FieldLabel>
                <NativeSelect
                  id="f-cutoffHour"
                  name="cutoffHour"
                  defaultValue={s.businessDayCutoffHour}
                  className="h-9 w-full"
                >
                  {Array.from({ length: 13 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00 Uhr
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <TextField
                label="Einkaufsliste ab Reichweite (Abende)"
                name="lowStockEvenings"
                type="number"
                min={1}
                max={30}
                defaultValue={s.lowStockEvenings}
                error={e.lowStockEvenings}
              />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
      <FormError message={state && !state.ok ? state.error : undefined} />
      <div>
        <SubmitButton size="lg">Einstellungen speichern</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function LogoForm({ logoFileId }: { logoFileId: string | null }) {
  const [pending, startUpload] = useTransition();
  const [removing, startRemove] = useTransition();
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const hydrated = useHydrated();

  function onFile(fileList: FileList | null) {
    const f = fileList?.[0];
    if (!f) return;
    setError(undefined);
    startUpload(async () => {
      try {
        // Logo: max. 600 px, PNG behält Transparenz
        const blob = await resizeImage(f, { maxSize: 600, type: "image/png" });
        const fd = new FormData();
        fd.set("logo", new File([blob], "logo.png", { type: "image/png" }));
        const result = await uploadLogoAction(undefined, fd);
        if (result.ok) toast.success(result.message ?? "Logo gespeichert");
        else setError(result.error);
      } catch {
        setError("Bild konnte nicht gelesen werden");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vereinslogo</CardTitle>
        <CardDescription>Erscheint auf dem Bierdeckel und den Kassenzetteln der Mitglieder.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex size-32 shrink-0 items-center justify-center rounded-full border bg-muted">
          {logoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element -- Logo kommt aus der eigenen Datenbank
            <img src={`/api/datei/${logoFileId}`} alt="Vereinslogo" className="size-28 rounded-full object-contain" />
          ) : (
            <span className="text-sm text-muted-foreground">kein Logo</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Logo-Datei"
            className="sr-only"
            id="logo-file"
            disabled={!hydrated || pending}
            onChange={(e) => onFile(e.target.files)}
          />
          <div className="flex flex-wrap gap-2">
            <Button nativeButton={false} variant="outline" disabled={!hydrated || pending} render={<label htmlFor="logo-file" />}>
              <ImageUp /> {pending ? "Lädt hoch …" : logoFileId ? "Logo ersetzen" : "Logo hochladen"}
            </Button>
            {logoFileId && (
              <Button
                variant="ghost"
                disabled={removing}
                onClick={() =>
                  startRemove(async () => {
                    await removeLogoAction();
                    toast.success("Logo entfernt");
                  })
                }
              >
                <Trash2 /> Entfernen
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">PNG, JPEG oder WebP. Wird automatisch verkleinert.</p>
          <FormError message={error} />
        </div>
      </CardContent>
    </Card>
  );
}

export function PinForm() {
  const [state, action, pending] = useActionState(changePinAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useToastOnSuccess(state, () => formRef.current?.reset());
  const e = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const pinProps = { type: "password", inputMode: "numeric" as const, autoComplete: "off", required: true };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verwaltungs-PIN ändern</CardTitle>
      </CardHeader>
      <CardContent>
        <ActionForm ref={formRef} action={action} pending={pending} className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <TextField label="Aktuelle PIN" name="currentPin" error={e.currentPin} {...pinProps} />
            <TextField label="Neue PIN" name="newPin" error={e.newPin} description="4 bis 8 Ziffern" {...pinProps} />
            <TextField label="Neue PIN wiederholen" name="newPin2" error={e.newPin2} {...pinProps} />
          </div>
          <FormError message={state && !state.ok ? state.error : undefined} />
          <div>
            <SubmitButton variant="outline">PIN ändern</SubmitButton>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}

/** Vereinsfarbe: wirkt sofort auf dieser Seite und nach dem Speichern überall (Theke, Mitglieder-Handys). */
export function AccentForm({ accent }: { accent: AccentId }) {
  const [current, setCurrent] = useState<AccentId>(accent);
  const [custom, setCustom] = useState(() => parseCustomAccent(accent) ?? CUSTOM_DEFAULT);
  const [pending, startTransition] = useTransition();
  // Regler bewegt, aber noch nicht gespeichert (wartet die halbe Sekunde ab)
  const [waiting, setWaiting] = useState(false);
  const hydrated = useHydrated();
  const saved = useRef<AccentId>(accent);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isCustom = parseCustomAccent(current) !== null;

  function save(next: AccentId) {
    setWaiting(false);
    startTransition(async () => {
      const res = await saveAccentAction(next);
      if (res.ok) {
        saved.current = next;
        toast.success(res.message ?? "Gespeichert", { id: "vereinsfarbe" });
      } else {
        setCurrent(saved.current);
        applyAccent(saved.current);
        toast.error(res.error ?? "Nicht gespeichert", { id: "vereinsfarbe" });
      }
    });
  }
  function choose(next: AccentId) {
    clearTimeout(timer.current);
    setCurrent(next);
    applyAccent(next);
    save(next);
  }
  /** Regler: sofort anzeigen, gespeichert wird erst, wenn eine halbe Sekunde nichts mehr verändert wurde */
  function slide(next: { hue: number; strength: number }) {
    const id = customAccent(next.hue, next.strength);
    setCustom(next);
    setCurrent(id);
    applyAccent(id);
    setWaiting(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(id), 500);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  const full = accentVars(custom.hue, 100)["--tint-light"];
  const grey = accentVars(custom.hue, 0)["--tint-light"];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vereinsfarbe</CardTitle>
        <CardDescription>Für die ganze App: Theke, Verwaltung und die Handys der Mitglieder.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <fieldset disabled={!hydrated || pending} role="radiogroup" aria-label="Vereinsfarbe" className="flex flex-wrap gap-x-5 gap-y-4">
          {[
            ...ACCENTS.map((a) => ({ id: a.id as AccentId, label: a.label, background: `linear-gradient(135deg, ${a.light}, ${a.dark})` })),
            {
              id: customAccent(custom.hue, custom.strength),
              label: "Eigene",
              background: "conic-gradient(#ff3b30, #ffcc00, #34c759, #00c7be, #007aff, #af52de, #ff2d55, #ff3b30)",
            },
          ].map((a) => {
            const selected = a.label === "Eigene" ? isCustom : a.id === current;
            return (
              <button
                key={a.label}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(a.id)}
                className="flex w-16 flex-col items-center gap-1.5 text-[13px] font-medium disabled:opacity-60"
              >
                <span
                  className={cn(
                    "grid size-11 place-items-center rounded-full text-white shadow-soft ring-offset-2 ring-offset-card transition",
                    selected ? "ring-3 ring-foreground/25" : "hover:scale-105",
                  )}
                  style={{ background: a.background }}
                >
                  {selected && <Check className="size-5 drop-shadow" aria-hidden />}
                </span>
                <span className={cn(selected ? "text-foreground" : "text-muted-foreground")}>{a.label}</span>
              </button>
            );
          })}
        </fieldset>

        {isCustom && (
          <div className="flex max-w-md flex-col gap-5" data-testid="eigene-farbe" aria-busy={waiting || pending}>
            <div className="flex flex-col gap-2">
              <label htmlFor="farbton" className="text-sm font-semibold">
                Farbton
              </label>
              <input
                id="farbton"
                type="range"
                min={0}
                max={359}
                value={custom.hue}
                disabled={!hydrated}
                onChange={(e) => slide({ ...custom, hue: Number(e.target.value) })}
                aria-valuetext={`${custom.hue} Grad`}
                className="range-farbe"
                style={{ background: "linear-gradient(to right, #ff3b30, #ff9500, #ffcc00, #34c759, #00c7be, #007aff, #5856d6, #af52de, #ff2d55, #ff3b30)" }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="kraeftigkeit" className="text-sm font-semibold">
                Kräftigkeit
              </label>
              <input
                id="kraeftigkeit"
                type="range"
                min={0}
                max={100}
                value={custom.strength}
                disabled={!hydrated}
                onChange={(e) => slide({ ...custom, strength: Number(e.target.value) })}
                aria-valuetext={`${custom.strength} %`}
                className="range-farbe"
                style={{ background: `linear-gradient(to right, ${grey}, ${full})` }}
              />
              <div className="flex justify-between text-sm text-muted-foreground" aria-hidden>
                <span>grau</span>
                <span>kräftig</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4" aria-label="Vorschau">
              <span className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Knopf</span>
              <span className="font-semibold text-primary">Link und Text</span>
              <span className="grid size-12 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: "var(--print)" }}>
                Deckel
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Die App passt Helligkeit und Kontrast automatisch an, damit Schrift und Knöpfe hell wie dunkel gut lesbar bleiben.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
