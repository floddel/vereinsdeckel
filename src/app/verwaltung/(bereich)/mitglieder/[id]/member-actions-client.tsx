"use client";

import { Copy, Pencil, RefreshCw, ShieldOff, Trash2, UserX } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteMemberAction, renewLinkAction, revokeLinkAction, setMemberActiveAction } from "@/server/member-actions";
import type { MemberRow } from "@/server/queries/members";
import { MemberDialog } from "../member-dialog";

export function EditMemberButton({ member }: { member: MemberRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil /> Bearbeiten
      </Button>
      <MemberDialog open={open} onOpenChange={setOpen} member={member} />
    </>
  );
}

/** Löschen – nur ohne Buchungen. Sonst Erklärung und „Stattdessen inaktiv setzen“. */
export function DeleteMemberButton({
  memberId,
  name,
  hasBookings,
  active,
}: {
  memberId: string;
  name: string;
  hasBookings: boolean;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const trigger = (
    <Button variant="outline" disabled={pending} className="text-destructive">
      <Trash2 /> Löschen
    </Button>
  );
  if (hasBookings) {
    return (
      <AlertDialog>
        <AlertDialogTrigger render={trigger} />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Löschen nicht möglich</AlertDialogTitle>
            <AlertDialogDescription>
              {name} hat Buchungen oder Zahlungen. Die müssen für die Kasse erhalten bleiben.{" "}
              {active
                ? "Setz das Mitglied stattdessen auf inaktiv – dann erscheint es nicht mehr an der Theke."
                : "Das Mitglied ist schon inaktiv und erscheint nicht mehr an der Theke."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{active ? "Abbrechen" : "Schließen"}</AlertDialogCancel>
            {active && (
              <AlertDialogAction
                onClick={() =>
                  startTransition(async () => {
                    await setMemberActiveAction(memberId, false);
                    toast.success(`${name} ist jetzt inaktiv`);
                  })
                }
              >
                <UserX /> Stattdessen inaktiv setzen
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
  return (
    <Confirm
      trigger={trigger}
      title={`${name} löschen?`}
      description="Das Mitglied und sein Link werden endgültig gelöscht. Es hat noch keine Buchungen, deshalb geht nichts für die Kasse verloren."
      confirm="Endgültig löschen"
      onConfirm={() =>
        startTransition(async () => {
          // Bei Erfolg geht es direkt zur Mitgliederliste, sonst kommt eine Meldung zurück.
          const result = await deleteMemberAction(memberId);
          toast.error(result.error);
        })
      }
    />
  );
}

export function CopyLinkButton({ url }: { url: string }) {
  return (
    <Button
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Link kopiert");
        } catch {
          toast.error("Kopieren nicht möglich – bitte den Link markieren und kopieren");
        }
      }}
    >
      <Copy /> Link kopieren
    </Button>
  );
}

export function LinkButtons({ memberId, hasLink }: { memberId: string; hasLink: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Confirm
        trigger={
          <Button variant="outline" disabled={pending}>
            <RefreshCw /> Neuen Link erzeugen
          </Button>
        }
        title="Neuen Link erzeugen?"
        description="Der bisherige Link (und gedruckte QR-Code) funktioniert danach nicht mehr. Das Mitglied braucht den neuen Link."
        confirm="Neuen Link erzeugen"
        onConfirm={() =>
          startTransition(async () => {
            await renewLinkAction(memberId);
            toast.success("Neuer Link erzeugt");
          })
        }
      />
      {hasLink && (
        <Confirm
          trigger={
            <Button variant="destructive" disabled={pending}>
              <ShieldOff /> Link sperren
            </Button>
          }
          title="Link sperren?"
          description="Über den bisherigen Link ist danach nichts mehr zu sehen. Du kannst später einen neuen Link erzeugen."
          confirm="Sperren"
          onConfirm={() =>
            startTransition(async () => {
              await revokeLinkAction(memberId);
              toast.success("Link gesperrt");
            })
          }
        />
      )}
    </div>
  );
}

function Confirm({
  trigger,
  title,
  description,
  confirm,
  onConfirm,
}: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  confirm: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
