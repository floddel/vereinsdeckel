"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ActionForm, FormError, SubmitButton } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { importMembersAction } from "@/server/member-actions";

/** Excel speichert CSV oft als Windows-1252; dann wären Umlaute kaputt. */
async function readFileText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function ImportForm() {
  const [state, action, pending] = useActionState(importMembersAction, undefined);
  const [csv, setCsv] = useState("");

  if (state?.step === "done") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import abgeschlossen</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-lg">
            {plural(state.imported, "Mitglied", "Mitglieder")} importiert
            {state.skipped > 0 && `, ${state.skipped} übersprungen`}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button nativeButton={false} render={<Link href="/verwaltung/mitglieder" />}>Zur Mitgliederliste</Button>
            <Button nativeButton={false} variant="outline" render={<Link href="/verwaltung/mitglieder/qr" />}>
              QR-Codes drucken
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state?.step === "preview") {
    const { result, existing } = state;
    const newCount = result.rows.length - existing.length;
    return (
      <ActionForm action={action} pending={pending} className="flex flex-col gap-4">
        <input type="hidden" name="csv" value={state.csv} />
        <input type="hidden" name="confirm" value="1" />
        {result.ignoredColumns.length > 0 && (
          <p className="rounded-2xl bg-secondary p-4 text-secondary-foreground">
            Nur der Name wird übernommen. Nicht übernommen (Datensparsamkeit):{" "}
            <strong>{result.ignoredColumns.join(", ")}</strong>
          </p>
        )}
        {result.errors.length > 0 && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">{plural(result.errors.length, "Zeile", "Zeilen")} mit Fehlern (werden übersprungen)</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5">
                {result.errors.map((e) => (
                  <li key={e.line}>
                    Zeile {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        <div className="overflow-hidden rounded-2xl bg-card px-2 shadow-soft dark:ring-1 dark:ring-white/5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zeile</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((r) => {
                const exists = existing.includes(r.line);
                return (
                  <TableRow key={r.line} className={exists ? "text-muted-foreground" : undefined}>
                    <TableCell>{r.line}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      {exists ? <Badge variant="outline">schon vorhanden</Badge> : <Badge>neu</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap gap-2">
          <SubmitButton size="lg" disabled={newCount === 0}>
            {plural(newCount, "Mitglied", "Mitglieder")} importieren
          </SubmitButton>
          <Button variant="outline" size="lg" type="button" onClick={() => window.location.reload()}>
            Andere Datei
          </Button>
        </div>
      </ActionForm>
    );
  }

  return (
    <ActionForm action={action} pending={pending} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>CSV-Datei wählen oder Inhalt einfügen</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground">
            Eine Spalte <strong>Name</strong> – oder <strong>Vorname</strong> und <strong>Nachname</strong>. Andere
            Spalten (Nummer, E-Mail, Adresse …) dürfen drinbleiben, sie werden nicht übernommen. Namen, die es schon
            gibt, werden übersprungen. In Excel: „Speichern unter“ → „CSV (Trennzeichen-getrennt)“.
          </p>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            aria-label="CSV-Datei"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setCsv(await readFileText(file));
            }}
            className="text-sm file:mr-3 file:rounded-lg file:border file:bg-muted file:px-3 file:py-2"
          />
          <Textarea
            name="csv"
            aria-label="CSV-Inhalt"
            rows={10}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"Vorname;Nachname\nKlaus;Müller\nJürgen;Weiß"}
            className="font-mono text-sm"
          />
          <FormError message={state?.step === "error" ? state.error : undefined} />
          <div>
            <SubmitButton size="lg">Vorschau anzeigen</SubmitButton>
          </div>
        </CardContent>
      </Card>
    </ActionForm>
  );
}
