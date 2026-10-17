"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { ActionForm, FormError, SubmitButton, TextField } from "@/components/form";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { saveMemberAction } from "@/server/member-actions";
import type { MemberRow } from "@/server/queries/members";

export function MemberDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: MemberRow;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{member ? "Mitglied bearbeiten" : "Neues Mitglied"}</DialogTitle>
        </DialogHeader>
        {open && <MemberForm key={member?.id ?? "neu"} member={member} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function MemberForm({ member, onDone }: { member?: MemberRow; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveMemberAction, undefined);
  const router = useRouter();
  const e = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (!state?.ok) return;
    toast.success(state.message ?? "Gespeichert");
    onDone();
    // Neues Mitglied → gleich zur Detailseite mit Link und QR-Code
    if (!member && state.id) router.push(`/verwaltung/mitglieder/${state.id}`);
  }, [state, onDone, member, router]);

  return (
    <ActionForm action={action} pending={pending} className="flex flex-col gap-5">
      {member && <input type="hidden" name="id" value={member.id} />}
      <FieldGroup>
        <TextField
          label="Name"
          name="name"
          defaultValue={member?.name}
          required
          maxLength={80}
          error={e.name}
          autoFocus
          description="So, wie er an der Theke erscheinen soll. Jeder Name nur einmal – bei Gleichnamigen z. B. „(sen.)“ ergänzen."
        />
        <Field orientation="horizontal">
          <Switch id="f-active" name="active" defaultChecked={member?.active ?? true} />
          <div>
            <FieldLabel htmlFor="f-active">Aktiv</FieldLabel>
            <FieldDescription>Inaktive Mitglieder erscheinen nicht an der Theke.</FieldDescription>
          </div>
        </Field>
      </FieldGroup>
      <FormError message={state && !state.ok ? state.error : undefined} />
      <DialogFooter>
        <SubmitButton size="lg">Speichern</SubmitButton>
      </DialogFooter>
    </ActionForm>
  );
}
