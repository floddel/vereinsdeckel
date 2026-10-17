"use client";

import { type ComponentProps, createContext, type ReactNode, startTransition, use } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Beschriftetes Eingabefeld mit Fehlermeldung. */
export function TextField({
  label,
  name,
  error,
  description,
  ...props
}: { label: ReactNode; name: string; error?: string; description?: ReactNode } & ComponentProps<typeof Input>) {
  const id = `f-${name}`;
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} aria-invalid={error ? true : undefined} {...props} />
      {description && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

const PendingContext = createContext(false);

/**
 * Formular für Server-Aktionen, das die Eingaben nach dem Absenden NICHT zurücksetzt
 * (React leert Formulare sonst automatisch – nach einer Fehlermeldung wäre alles weg).
 * `action` und `pending` kommen aus `useActionState`.
 * `action` steht zusätzlich am Formular: Wird abgeschickt, bevor die Seite fertig geladen ist,
 * sendet der Browser sicher per POST an die Server-Aktion (nie Eingaben in der Adresszeile).
 */
export function ActionForm({
  action,
  pending,
  children,
  ...props
}: { action: (formData: FormData) => void; pending: boolean } & Omit<ComponentProps<"form">, "action" | "onSubmit">) {
  return (
    <form
      {...props}
      action={action}
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
    >
      <PendingContext value={pending}>{children}</PendingContext>
    </form>
  );
}

/** Absende-Knopf, der sich während des Speicherns sperrt. */
export function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  const status = useFormStatus();
  const pending = status.pending || use(PendingContext);
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? "Bitte warten …" : children}
    </Button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}
