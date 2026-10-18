"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { unlockAction } from "@/server/auth-actions";

/** `demoPin`: PIN der Demo, steht dann schon im Feld. */
export function UnlockForm({ next, demoPin }: { next?: string; demoPin?: string }) {
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
        defaultValue={demoPin}
        className="h-14 text-center text-3xl tracking-[0.5em]"
      />
      {demoPin && <p className="text-muted-foreground">In der Demo ist die PIN schon eingetragen: {demoPin}</p>}
      <FormError message={state?.error} />
      <SubmitButton size="lg">Entsperren</SubmitButton>
    </form>
  );
}
