"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ActionForm, FormError, SubmitButton, TextField } from "@/components/form";
import { NativeSelect } from "@/components/native-select";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { AUTHORITIES, authorityText, HOSTING_OPTIONS, type Hosting, type HostingKind, type PrivacySettings } from "@/domain/privacy";
import { saveHostingAction, savePrivacySettingsAction, setPrivacyCheckAction } from "@/server/privacy-actions";

/** Angaben für den Datenschutzhinweis. Die Aufsichtsbehörde lässt sich über das Bundesland wählen. */
export function PrivacySettingsForm({ initial }: { initial: PrivacySettings }) {
  const [state, action, pending] = useActionState(savePrivacySettingsAction, undefined);
  const [authority, setAuthority] = useState(initial.authority ?? "");
  const e = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Gespeichert");
  }, [state]);
  const state_ = AUTHORITIES.find((a) => authorityText(a) === authority)?.state ?? "";
  return (
    <ActionForm action={action} pending={pending} className="flex flex-col gap-4">
      <FieldGroup>
        <TextField
          label="Verantwortlich"
          name="controller"
          defaultValue={initial.controller ?? ""}
          maxLength={120}
          placeholder="Vor- und Nachname (oder Name des Vereins)"
          description="Wer die App betreibt und abrechnet."
          error={e.controller}
        />
        <Field data-invalid={e.address ? true : undefined}>
          <FieldLabel htmlFor="f-address">Anschrift</FieldLabel>
          <Textarea id="f-address" name="address" defaultValue={initial.address ?? ""} rows={2} maxLength={300} placeholder={"Straße Nr.\nPLZ Ort"} />
          {e.address && <FieldError>{e.address}</FieldError>}
        </Field>
        <TextField label="E-Mail für Datenschutzfragen" name="email" type="email" defaultValue={initial.email ?? ""} maxLength={120} error={e.email} />
        <Field>
          <FieldLabel htmlFor="f-state">Bundesland (für die Aufsichtsbehörde)</FieldLabel>
          <NativeSelect
            id="f-state"
            value={state_}
            onChange={(ev) => {
              const a = AUTHORITIES.find((x) => x.state === ev.target.value);
              if (a) setAuthority(authorityText(a));
            }}
            className="h-9 w-full"
          >
            <option value="">– wählen –</option>
            {AUTHORITIES.map((a) => (
              <option key={a.state} value={a.state}>
                {a.state}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field data-invalid={e.authority ? true : undefined}>
          <FieldLabel htmlFor="f-authority">Zuständige Aufsichtsbehörde</FieldLabel>
          <Textarea id="f-authority" name="authority" value={authority} onChange={(ev) => setAuthority(ev.target.value)} rows={2} maxLength={300} />
          <FieldDescription>Wird über das Bundesland ausgefüllt – bitte einmal prüfen, Namen ändern sich gelegentlich.</FieldDescription>
          {e.authority && <FieldError>{e.authority}</FieldError>}
        </Field>
      </FieldGroup>
      <FormError message={state && !state.ok ? state.error : undefined} />
      <SubmitButton className="self-start">Speichern</SubmitButton>
    </ActionForm>
  );
}

/** Wo die App läuft – bei „Anderer Anbieter“ mit Name, Standort und Vertrag. */
export function HostingForm({ initial }: { initial: Hosting }) {
  const [state, action, pending] = useActionState(saveHostingAction, undefined);
  const [kind, setKind] = useState<HostingKind>(initial.kind);
  const e = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Gespeichert");
  }, [state]);
  return (
    <ActionForm action={action} pending={pending} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Hosting</legend>
        {HOSTING_OPTIONS.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border p-3 has-checked:border-primary has-checked:bg-primary/5">
            <input type="radio" name="kind" value={o.id} checked={kind === o.id} onChange={() => setKind(o.id)} className="mt-1 size-4 accent-primary" />
            <span>
              <span className="block font-semibold">{o.label}</span>
              <span className="text-sm text-muted-foreground">{o.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {kind === "provider" && (
        <FieldGroup>
          <TextField label="Anbieter" name="name" defaultValue={initial.name ?? ""} maxLength={120} placeholder="z. B. Hetzner Online GmbH" error={e.name} />
          <TextField label="Standort" name="location" defaultValue={initial.location ?? ""} maxLength={120} placeholder="z. B. Falkenstein (Deutschland)" error={e.location} />
          <TextField
            label="Vertrag zur Auftragsverarbeitung (AVV)"
            name="contract"
            defaultValue={initial.contract ?? ""}
            maxLength={200}
            placeholder="z. B. im Kundenkonto abgeschlossen am …"
            error={e.contract}
          />
        </FieldGroup>
      )}
      <FormError message={state && !state.ok ? state.error : undefined} />
      <SubmitButton className="self-start">Speichern</SubmitButton>
    </ActionForm>
  );
}

/** Abhakbarer Punkt der Checkliste (wird sofort gespeichert). */
export function CheckItem({ id, label, checked }: { id: string; label: string; checked: boolean }) {
  const [value, setValue] = useState(checked);
  const [, startTransition] = useTransition();
  return (
    <label className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={value}
        onChange={(ev) => {
          setValue(ev.target.checked);
          startTransition(() => setPrivacyCheckAction(id, ev.target.checked));
        }}
        className="mt-0.5 size-5 shrink-0 accent-primary"
      />
      <span className={value ? "text-muted-foreground" : undefined}>{label}</span>
    </label>
  );
}
