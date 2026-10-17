import { Download } from "lucide-react";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { isFreshInstallation } from "@/server/backup";
import { requireVerwaltung } from "@/server/session";
import { DownloadForm, ImportForm } from "./backup-forms";

export default function SicherungPage() {
  return (
    <>
      <PageHeader
        title="Sichern & Umziehen"
        description="Alle Daten als eine Datei – zum Aufheben oder um die App zu einem anderen Anbieter mitzunehmen."
      />
      <Suspense fallback={<Loading />}>
        <Sicherung />
      </Suspense>
    </>
  );
}

async function Sicherung() {
  await requireVerwaltung();
  const fresh = await isFreshInstallation(getDb());
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="size-5" aria-hidden /> Sicherung herunterladen
          </CardTitle>
          <CardDescription>
            Einstellungen, Logo, Artikel, Mitglieder samt ihren Links, alle Abende, Buchungen, Zahlungen, Einkäufe, Kasse und Inventuren.
            Nicht enthalten: Passwort, PIN, zweiter Faktor und der KI-Schlüssel – die richtest du am neuen Ort neu ein. Die Datei enthält
            Mitgliedernamen und ihre geheimen Links: sicher aufbewahren und nicht weitergeben.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DownloadForm />
        </CardContent>
      </Card>

      <Card data-testid="sicherung-uebernehmen">
        <CardHeader>
          <CardTitle>Aus einer Sicherung übernehmen</CardTitle>
          <CardDescription>
            {fresh
              ? "Diese Installation ist noch leer – hier kannst du eine Sicherung übernehmen."
              : "Geht nur in eine frische Installation (noch ohne Artikel, Mitglieder und Buchungen) – damit nichts doppelt oder durcheinander gerät."}
          </CardDescription>
        </CardHeader>
        {fresh && (
          <CardContent>
            <ImportForm />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
