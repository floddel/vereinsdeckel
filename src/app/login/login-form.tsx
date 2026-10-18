"use client";

import { useActionState } from "react";
import { FormError, SubmitButton, TextField } from "@/components/form";
import { FieldGroup } from "@/components/ui/field";
import { loginAction } from "@/server/auth-actions";

/** `demo`: Zugang der Demo, steht dann schon im Formular. */
export function LoginForm({ next, demo }: { next?: string; demo?: { email: string; password: string } }) {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="next" value={next ?? ""} />
      {demo && (
        <p role="note" className="rounded-2xl bg-primary/10 p-4">
          Das ist eine Demo mit erfundenen Daten. Der Zugang ist schon eingetragen – einfach anmelden und alles
          ausprobieren. Danach wird alles gelöscht.
        </p>
      )}
      <FieldGroup>
        <TextField
          label="E-Mail"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state?.values?.email ?? demo?.email}
        />
        <TextField label="Passwort" name="password" type="password" autoComplete="current-password" required defaultValue={demo?.password} />
      </FieldGroup>
      <FormError message={state?.error} />
      <SubmitButton size="lg">Anmelden</SubmitButton>
    </form>
  );
}
