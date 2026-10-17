"use client";

import { Download, UserRoundX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
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
import { formatCents } from "@/lib/money";
import { anonymizeMemberAction } from "@/server/privacy-actions";

/** Auskunft (Datei herunterladen) und Löschen (anonymisieren) eines Mitglieds. */
export function PrivacyButtons({ memberId, name, openCents }: { memberId: string; name: string; openCents: number }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const base = `/api/datenschutz/mitglied/${memberId}`;
  return (
    <div className="flex flex-wrap gap-2">
      <Button nativeButton={false} variant="outline" render={<a href={`${base}?format=json`} download />}>
        <Download /> Alle Daten (JSON)
      </Button>
      <Button nativeButton={false} variant="outline" render={<a href={`${base}?format=csv`} download />}>
        <Download /> Buchungen (CSV)
      </Button>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button variant="outline" className="text-destructive" disabled={pending}>
              <UserRoundX /> Anonymisieren
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{openCents > 0 ? "Erst den Deckel begleichen" : `${name} anonymisieren?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {openCents > 0
                ? `Bei ${name} sind noch ${formatCents(openCents)} offen. Nach dem Anonymisieren wüsste niemand mehr, wer das schuldet – deshalb geht es erst, wenn alles bezahlt ist.`
                : `Der Name wird überall durch „Ehemaliges Mitglied #…“ ersetzt, der Link und der QR-Code werden gesperrt, Handy-Bestellungen gelöscht. Buchungen bleiben ohne Namen erhalten, damit Kasse und Statistik stimmen. Das lässt sich nicht rückgängig machen.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{openCents > 0 ? "Schließen" : "Abbrechen"}</AlertDialogCancel>
            {openCents <= 0 && (
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() =>
                  startTransition(async () => {
                    const r = await anonymizeMemberAction(memberId);
                    if (!r.ok) return void toast.error(r.error);
                    toast.success(`${name} ist jetzt „${r.newName}“`);
                    router.push("/verwaltung/mitglieder");
                  })
                }
              >
                Endgültig anonymisieren
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
