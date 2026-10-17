"use client";

import { KeyRound, ScanText, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/form-utils";
import { useHydrated } from "@/lib/use-hydrated";
import type { AiSettings } from "@/server/anthropic";
import { removeApiKeyAction, saveApiKeyAction, setAiEnabledAction } from "@/server/settings-actions";

/**
 * Kassenbon-Erkennung per KI: freiwillig, mit eigenem Anthropic-Schlüssel.
 * Der Schlüssel wird nach dem Speichern nie wieder vollständig angezeigt.
 */
export function AiSettingsCard({ ai }: { ai: AiSettings }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Eingabe erst nach dem Start der Seite – vorher Getipptes käme nicht an
  const hydrated = useHydrated();

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Hat nicht geklappt");
      toast.success(r.message ?? "Gespeichert");
      after?.();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanText className="size-5" /> Kassenbon-Erkennung (KI)
        </CardTitle>
        <CardDescription>
          Beim Einkauf den Kassenbon fotografieren – die KI „Claude“ von Anthropic liest Positionen und Preise und füllt das Formular aus,
          du korrigierst nur noch. Dafür wird das Foto an Anthropic (USA) übertragen. Kosten: etwa 1 Cent pro Bon über dein eigenes
          Anthropic-Konto. Ausgeschaltet wird nichts übertragen.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Field orientation="horizontal">
          <Switch
            id="ai-enabled"
            checked={ai.enabled}
            disabled={pending || (!ai.enabled && !ai.keyHint)}
            onCheckedChange={(on) => run(() => setAiEnabledAction(on))}
          />
          <div>
            <FieldLabel htmlFor="ai-enabled">Kassenbon-Erkennung verwenden</FieldLabel>
            <FieldDescription>{ai.keyHint ? "Erscheint beim Erfassen eines Einkaufs." : "Erst einen API-Schlüssel hinterlegen."}</FieldDescription>
          </div>
        </Field>

        <div className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-4" data-testid="ai-schluessel">
          <p className="flex items-center gap-2 font-medium">
            <KeyRound className="size-4" />
            {ai.keySource === "app" && <>API-Schlüssel hinterlegt: <code>{ai.keyHint}</code></>}
            {ai.keySource === "env" && <>API-Schlüssel aus der Server-Einstellung: <code>{ai.keyHint}</code></>}
            {!ai.keySource && "Kein API-Schlüssel hinterlegt"}
          </p>
          {ai.keyBroken && (
            <p role="alert" className="text-sm text-destructive">
              Der gespeicherte Schlüssel ist nicht mehr lesbar (der geheime Schlüssel der App wurde geändert). Bitte neu eingeben.
            </p>
          )}
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveApiKeyAction(key), () => setKey(""));
            }}
          >
            <Field className="min-w-64 flex-1">
              <FieldLabel htmlFor="ai-key">{ai.keySource === "app" ? "Neuen Schlüssel eingeben" : "API-Schlüssel"}</FieldLabel>
              <Input
                id="ai-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-…"
                value={key}
                disabled={!hydrated}
                onChange={(e) => setKey(e.target.value)}
                className="h-10 font-mono"
              />
            </Field>
            <Button type="submit" disabled={pending || key.trim().length < 20}>
              {pending ? "Wird geprüft …" : "Prüfen & speichern"}
            </Button>
            {ai.keySource === "app" && (
              <Button type="button" variant="ghost" className="text-destructive" disabled={pending} onClick={() => run(removeApiKeyAction)}>
                <Trash2 /> Entfernen
              </Button>
            )}
          </form>
          <p className="text-sm text-muted-foreground">
            Den Schlüssel bekommst du unter console.anthropic.com → „API Keys“. Tipp: Dort ein monatliches Ausgabenlimit festlegen. Der
            Schlüssel wird verschlüsselt gespeichert und danach nie wieder ganz angezeigt.
          </p>
        </div>
        <FormError message={error ?? undefined} />
      </CardContent>
    </Card>
  );
}
