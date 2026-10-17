"use client";

import { Download, FlagTriangleRight, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { planReset, RESET_AREAS, RESET_CONFIRM_WORD, RESET_LABELS, type ResetArea, requiredBy } from "@/domain/reset";
import { useHydrated } from "@/lib/use-hydrated";
import { endTestPhaseAction, resetDataAction } from "@/server/reset-actions";

/** Testphase: Daten gezielt zurücksetzen – und die Testphase endgültig beenden. */
export function TestPhaseCard({ endedOn }: { endedOn: string | null }) {
  if (endedOn) {
    return (
      <Card data-testid="testphase">
        <CardHeader>
          <CardTitle>Testphase</CardTitle>
          <CardDescription>
            Beendet am {endedOn}. Seitdem lassen sich keine Daten mehr zurücksetzen – Korrekturen gehen nur noch per Storno, Mitglieder lassen sich
            unter Datenschutz anonymisieren.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card data-testid="testphase">
      <CardHeader>
        <CardTitle>Testphase</CardTitle>
        <CardDescription>
          Bis zum ersten echten Abend könnt ihr alles ausprobieren und danach gezielt wieder löschen. Sobald es richtig losgeht: Testphase beenden –
          dann sind alle Buchungen dauerhaft geschützt.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <ResetForm />
        <EndTestPhase />
      </CardContent>
    </Card>
  );
}

function ResetForm() {
  const [selected, setSelected] = useState<ResetArea[]>([]);
  const [keepOpening, setKeepOpening] = useState(true);
  const [downloaded, setDownloaded] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const plan = planReset(selected, keepOpening);
  const confirmed = confirm.trim().toUpperCase() === RESET_CONFIRM_WORD;
  const ready = plan.areas.length > 0 && downloaded && confirmed;

  function toggle(area: ResetArea, on: boolean) {
    setSelected((s) => (on ? [...s, area] : s.filter((a) => a !== area)));
  }
  function submit() {
    setError(undefined);
    startTransition(async () => {
      const res = await resetDataAction({ areas: plan.areas, keepOpening: plan.keepOpening, confirm });
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Zurückgesetzt");
      setSelected([]);
      setConfirm("");
      setDownloaded(false);
    });
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="zuruecksetzen">
      <h3 id="zuruecksetzen" className="font-semibold">
        Daten zurücksetzen
      </h3>
      <fieldset disabled={!hydrated || pending} className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-muted-foreground">Was soll gelöscht werden?</legend>
        {RESET_AREAS.map((area) => {
          const forcedBy = requiredBy(area, selected);
          const checked = plan.areas.includes(area);
          return (
            <div key={area} className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-3 has-checked:border-destructive/50 has-checked:bg-destructive/5">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!!forcedBy}
                  onChange={(e) => toggle(area, e.target.checked)}
                  className="mt-1 size-4 accent-destructive"
                />
                <span>
                  <span className="block font-semibold">
                    {RESET_LABELS[area].title}
                    {forcedBy && <span className="font-normal text-muted-foreground"> – nötig für „{RESET_LABELS[forcedBy].title}“</span>}
                  </span>
                  <span className="text-sm text-muted-foreground">{RESET_LABELS[area].text}</span>
                </span>
              </label>
              {area === "einkaeufe" && checked && (
                <label className="ml-7 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={plan.keepOpening}
                    disabled={plan.areas.includes("artikel")}
                    onChange={(e) => setKeepOpening(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  Anfangsbestand behalten (mit seinem Einkaufswert)
                </label>
              )}
            </div>
          );
        })}
        <p className="text-sm text-muted-foreground">
          Bleibt immer: Einstellungen, Logo, Vereinsfarbe, Datenschutz, Kategorien, Anmeldung und PIN.
        </p>
      </fieldset>

      {plan.areas.length > 0 && (
        <div className="flex flex-col gap-4 rounded-2xl bg-muted p-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">1. Erst sichern – falls ihr doch etwas zurückhaben wollt</p>
            <Button
              nativeButton={false}
              variant="outline"
              className="self-start"
              render={<a href="/api/sicherung" download onClick={() => setDownloaded(true)} />}
            >
              <Download /> {downloaded ? "Sicherung heruntergeladen" : "Sicherung herunterladen"}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="loeschen-bestaetigen" className="text-sm font-semibold">
              2. Zum Bestätigen „{RESET_CONFIRM_WORD}“ eintippen
            </label>
            <Input
              id="loeschen-bestaetigen"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              className="h-11 max-w-60"
              disabled={!downloaded || pending}
            />
          </div>
          <FormError message={error} />
          <Button type="button" variant="destructive" size="lg" className="self-start" disabled={!ready || pending} onClick={submit}>
            <Trash2 /> {pending ? "Wird gelöscht …" : "Ausgewähltes endgültig löschen"}
          </Button>
        </div>
      )}
    </section>
  );
}

function EndTestPhase() {
  const [pending, startTransition] = useTransition();
  return (
    <section className="flex flex-col gap-3 border-t pt-6" aria-labelledby="testphase-beenden">
      <h3 id="testphase-beenden" className="font-semibold">
        Testphase beenden
      </h3>
      <p className="text-sm text-muted-foreground">
        Wenn alles eingerichtet ist und der erste echte Abend ansteht. Danach lässt sich nichts mehr zurücksetzen – auch nicht von hier aus.
      </p>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button type="button" variant="outline" className="self-start" disabled={pending}>
              <FlagTriangleRight /> Testphase beenden – jetzt geht’s los
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Testphase endgültig beenden?</AlertDialogTitle>
            <AlertDialogDescription>
              Ab jetzt sind alle Buchungen, Zahlungen, Einkäufe, Kassenbewegungen und Inventuren dauerhaft geschützt. „Daten zurücksetzen“
              verschwindet und lässt sich nicht wieder einschalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                startTransition(async () => {
                  const res = await endTestPhaseAction();
                  if (res.ok) toast.success(res.message ?? "Testphase beendet");
                  else toast.error(res.error ?? "Nicht geklappt");
                })
              }
            >
              Endgültig beenden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
