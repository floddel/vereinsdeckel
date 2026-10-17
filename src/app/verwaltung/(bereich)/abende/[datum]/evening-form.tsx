"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { ActionForm, FormError, SubmitButton, TextField } from "@/components/form";
import { saveEveningAction } from "@/server/evening-actions";

/** Abend benennen (z. B. „Sommerfest“) und Notiz – erscheint im Abendabschluss und in der Liste. */
export function EveningForm({ id, title, note }: { id: string; title: string | null; note: string | null }) {
  const [state, action, pending] = useActionState(saveEveningAction, undefined);
  const e = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Gespeichert");
  }, [state]);
  return (
    <ActionForm action={action} pending={pending} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end print:hidden">
      <input type="hidden" name="id" value={id} />
      <TextField label="Name des Abends (optional)" name="title" defaultValue={title ?? ""} maxLength={60} placeholder="z. B. Sommerfest" error={e.title} />
      <TextField label="Notiz (optional)" name="note" defaultValue={note ?? ""} maxLength={500} placeholder="z. B. Grillabend, 30 Gäste" error={e.note} />
      <SubmitButton>Speichern</SubmitButton>
      <FormError message={state && !state.ok ? state.error : undefined} />
    </ActionForm>
  );
}
