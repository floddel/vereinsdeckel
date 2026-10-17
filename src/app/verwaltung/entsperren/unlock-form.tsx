"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { unlockAction } from "@/server/auth-actions";

export function UnlockForm({ next }: { next?: string }) {
  const [state, action] = useActionState(unlockAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label htmlFor="pin" className="text-sm font-medium">
        PIN
      </label>
      <Input
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        pattern="\d*"
        autoComplete="off"
        autoFocus
        required
        className="h-14 text-center text-3xl tracking-[0.5em]"
      />
      <FormError message={state?.error} />
      <SubmitButton size="lg">Entsperren</SubmitButton>
    </form>
  );
}
