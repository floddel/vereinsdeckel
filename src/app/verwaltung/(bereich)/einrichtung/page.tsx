import { count, eq } from "drizzle-orm";
import { CircleCheck, Globe, Heart, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { article, member, settings } from "@/db/schema";
import { isTestOrigin } from "@/lib/origin";
import { getAppOrigin, originSource } from "@/server/app-url";
import { getPrivacySettings } from "@/server/privacy";
import { requireVerwaltung } from "@/server/session";
import { HostingForm, PrivacySettingsForm } from "../datenschutz/privacy-forms";
import { TwoFactorCard } from "../einstellungen/security-settings";
import { GeneralSettingsForm, LogoForm } from "../einstellungen/settings-forms";
import { FinishButton, StarterArticlesButton, StepNav } from "./wizard-parts";

const STEPS = ["Verein & Theke", "Sicherheit", "Adresse", "Datenschutz", "Artikel & Mitglieder", "Fertig"] as const;

export default function EinrichtungPage({ searchParams }: PageProps<"/verwaltung/einrichtung">) {
  return (
    <>
      <PageHeader title="Einrichtung" description="Schritt für Schritt startklar – alles lässt sich später unter Einstellungen und Datenschutz ändern." />
      <Suspense fallback={<Loading />}>
        <Wizard searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Wizard({ searchParams }: Pick<PageProps<"/verwaltung/einrichtung">, "searchParams">) {
  const { user } = await requireVerwaltung();
  const { schritt } = await searchParams;
  const step = Math.min(Math.max(Number(schritt) || 1, 1), STEPS.length);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <StepNav steps={[...STEPS]} step={step} />
      {step === 1 && <StepVerein />}
      {step === 2 && <TwoFactorCard enabled={!!user.twoFactorEnabled} />}
      {step === 3 && <StepAdresse />}
      {step === 4 && <StepDatenschutz />}
      {step === 5 && <StepStammdaten />}
      {step === 6 && <StepFertig />}
      <StepNav steps={[...STEPS]} step={step} bottom />
    </div>
  );
}

async function StepVerein() {
  const [s] = await getDb().select().from(settings).where(eq(settings.id, 1));
  return (
    <>
      <LogoForm logoFileId={s.logoFileId} />
      <GeneralSettingsForm
        s={{
          clubName: s.clubName,
          paypalName: s.paypalName,
          warnLimitCents: s.warnLimitCents,
          businessDayCutoffHour: s.businessDayCutoffHour,
          lowStockEvenings: s.lowStockEvenings,
          logoFileId: s.logoFileId,
        }}
      />
    </>
  );
}

async function StepAdresse() {
  const origin = await getAppOrigin();
  const source = originSource();
  const fixed = source !== "request";
  const test = isTestOrigin(origin);
  return (
    <Card data-testid="einrichtung-adresse">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="size-5" aria-hidden /> Adresse der App
        </CardTitle>
        <CardDescription>
          Unter dieser Adresse erreichen Mitglieder ihren Bierdeckel. Sie steht in jedem QR-Code – gedruckte Karten funktionieren nur, solange
          die Adresse gleich bleibt.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="font-mono text-lg break-all">{origin}</p>
        {test ? (
          <p className="flex gap-2 rounded-2xl bg-highlight/10 p-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-highlight" aria-hidden />
            Das ist eine Test-Adresse (ohne https oder nur im Heimnetz). QR-Karten erst drucken, wenn die App unter ihrer endgültigen
            Adresse läuft.
          </p>
        ) : fixed ? (
          <p className="flex gap-2 rounded-2xl bg-secondary/70 p-3">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />{" "}
              {source === "vercel" ? "Automatisch von Vercel erkannt – passt für die QR-Karten." : "Fest eingestellt (APP_URL) – passt für die QR-Karten."}
          </p>
        ) : (
          <p className="flex gap-2 rounded-2xl bg-highlight/10 p-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-highlight" aria-hidden />
            Empfehlung: diese Adresse fest einstellen (Umgebungsvariable APP_URL, z. B. bei Vercel oder in der .env-Datei). Sonst könnten
            QR-Codes eine andere Adresse bekommen, falls die App einmal über eine zweite Adresse aufgerufen wird.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

async function StepDatenschutz() {
  const p = await getPrivacySettings(getDb());
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Wo läuft die App?</CardTitle>
          <CardDescription>Danach richten sich Datenschutzhinweis, Auftragsverarbeiter und Checkliste.</CardDescription>
        </CardHeader>
        <CardContent>
          <HostingForm initial={p.hosting} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Angaben für den Datenschutzhinweis</CardTitle>
          <CardDescription>Erscheinen auf der Seite „Datenschutz“, die Mitglieder vom Bierdeckel aus öffnen können.</CardDescription>
        </CardHeader>
        <CardContent>
          <PrivacySettingsForm initial={p} />
        </CardContent>
      </Card>
    </>
  );
}

async function StepStammdaten() {
  const db = getDb();
  const [[a], [m]] = await Promise.all([db.select({ n: count() }).from(article), db.select({ n: count() }).from(member)]);
  const fresh = a.n === 0 && m.n === 0;
  return (
    <>
      {fresh && (
        <Card data-testid="einrichtung-sicherung">
          <CardHeader>
            <CardTitle>Umzug oder Neustart?</CardTitle>
            <CardDescription>Hast du eine Sicherungsdatei (z. B. aus einer Testversion)? Dann kommen Artikel, Mitglieder samt Links und Bestand auf einmal herüber.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/verwaltung/sicherung" className="rounded-full border px-4 py-2 font-medium hover:bg-muted">
              Aus einer Sicherung übernehmen
            </Link>
          </CardContent>
        </Card>
      )}
      <Card data-testid="einrichtung-artikel">
        <CardHeader>
          <CardTitle>Artikel · {a.n} angelegt</CardTitle>
          <CardDescription>Was es an der Theke gibt. Danach unter Bestand → Inventur einmal zählen, was da ist.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <StarterArticlesButton disabled={a.n > 0} />
          <Link href="/verwaltung/artikel" className="rounded-full border px-4 py-2 font-medium hover:bg-muted">
            Selbst anlegen
          </Link>
        </CardContent>
      </Card>
      <Card data-testid="einrichtung-mitglieder">
        <CardHeader>
          <CardTitle>Mitglieder · {m.n} angelegt</CardTitle>
          <CardDescription>Nur der Name wird gespeichert. Eine Liste (z. B. aus Excel) lässt sich auf einmal übernehmen.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/verwaltung/mitglieder/import" className="rounded-full border px-4 py-2 font-medium hover:bg-muted">
            Liste importieren (CSV)
          </Link>
          <Link href="/verwaltung/mitglieder" className="rounded-full border px-4 py-2 font-medium hover:bg-muted">
            Einzeln anlegen
          </Link>
        </CardContent>
      </Card>
    </>
  );
}

async function StepFertig() {
  return (
    <Card data-testid="einrichtung-fertig">
      <CardHeader>
        <CardTitle>Geschafft!</CardTitle>
        <CardDescription>Die wichtigsten nächsten Schritte:</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <Link href="/verwaltung/bestand/inventur" className="text-primary underline">
              Inventur
            </Link>{" "}
            – einmal zählen, was da ist (sonst lässt die Theke nichts verkaufen, was Bestand führt).
          </li>
          <li>
            <Link href="/verwaltung/mitglieder/qr" className="text-primary underline">
              QR-Karten drucken
            </Link>{" "}
            und{" "}
            <Link href="/verwaltung/heute/aufsteller" className="text-primary underline">
              Aufsteller für den Tresen
            </Link>{" "}
            – erst, wenn die Adresse endgültig ist.
          </li>
          <li>Auf dem Theken-Tablet die Theke öffnen und „Zum Home-Bildschirm“ wählen – dann startet sie wie eine App im Vollbild.</li>
        </ul>
        <p className="flex items-start gap-2 rounded-2xl bg-highlight/10 p-3">
          <Heart className="mt-0.5 size-5 shrink-0 text-highlight" aria-hidden />
          <span>
            Gefällt euch der Vereinsdeckel? Er ist kostenlos und wird in der Freizeit entwickelt –{" "}
            <Link href="/verwaltung/ueber" className="text-primary underline">
              hier könnt ihr die Entwicklung unterstützen
            </Link>
            .
          </span>
        </p>
        <FinishButton />
      </CardContent>
    </Card>
  );
}
