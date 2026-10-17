"use client";

import { useActionState } from "react";
import { FormError, SubmitButton, TextField } from "@/components/form";
import { FieldGroup } from "@/components/ui/field";
import { verifyCodeAction } from "@/server/auth-actions";

export function CodeForm({ next }: { next?: string }) {
  const [state, action] = useActionState(verifyCodeAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="next" value={next ?? ""} />
      <FieldGroup>
        <TextField
          label="Code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          autoFocus
          error={state?.fieldErrors?.code}
          description="Handy weg? Dann einen der Notfall-Codes eingeben (z. B. abcde-12345) – jeder gilt nur einmal."
        />
      </FieldGroup>
      <FormError message={state?.error} />
      <SubmitButton size="lg">Bestätigen</SubmitButton>
    </form>
  );
}
