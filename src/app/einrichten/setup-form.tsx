"use client";

import { useActionState } from "react";
import { FormError, SubmitButton, TextField } from "@/components/form";
import { FieldGroup } from "@/components/ui/field";
import { setupAction } from "@/server/auth-actions";

export function SetupForm({ needsCode }: { needsCode: boolean }) {
  const [state, action] = useActionState(setupAction, undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6">
      <FieldGroup>
        {needsCode && (
          <TextField
            label="Einrichtungs-Code"
            name="setupCode"
            type="password"
            autoComplete="off"
            required
            error={e.setupCode}
            description="Steht in den Einstellungen deiner Installation (Umgebungsvariable SETUP_CODE, z. B. bei Vercel oder in der .env-Datei)."
          />
        )}
        <TextField label="Dein Name" name="name" autoComplete="name" required error={e.name} defaultValue={state?.values?.name} />
        <TextField label="E-Mail" name="email" type="email" autoComplete="email" required error={e.email} defaultValue={state?.values?.email} />
        <TextField
          label="Passwort"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          error={e.password}
          description="Mindestens 10 Zeichen."
        />
        <TextField
          label="Passwort wiederholen"
          name="password2"
          type="password"
          autoComplete="new-password"
          required
          error={e.password2}
        />
        <TextField
          label="Verwaltungs-PIN"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          required
          error={e.pin}
          description="4 bis 8 Ziffern. Schützt die Verwaltung, die Theke bleibt ohne PIN bedienbar."
        />
        <TextField label="PIN wiederholen" name="pin2" type="password" inputMode="numeric" autoComplete="off" required error={e.pin2} />
      </FieldGroup>
      <FormError message={state?.error} />
      <SubmitButton size="lg">Konto anlegen</SubmitButton>
    </form>
  );
}
