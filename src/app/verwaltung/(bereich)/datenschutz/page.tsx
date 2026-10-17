import { CircleAlert, CircleCheck, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Section } from "@/components/admin/report-parts";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { activeProcessors, checksFor, missingPrivacyFields, privacyFacts } from "@/domain/privacy";
import { getPrivacySettings } from "@/server/privacy";
import { requireVerwaltung } from "@/server/session";
import { CheckItem, HostingForm, PrivacySettingsForm } from "./privacy-forms";

export default function DatenschutzVerwaltungPage() {
  return (
    <>
      <PageHeader
        title="Datenschutz"
        description="Was die App von sich aus für den Datenschutz tut – und die wenigen Dinge, die du als Betreiber erledigst."
        actions={
          <Button nativeButton={false} variant="outline" size="lg" render={<Link href="/datenschutz" target="_blank" />}>
            <ExternalLink /> Datenschutzhinweis ansehen
          </Button>
        }
      />
      <Suspense fallback={<Loading />}>
        <Datenschutz />
      </Suspense>
    </>
  );
}

async function Datenschutz() {
  await requireVerwaltung();
  const s = await getPrivacySettings(getDb());
  const missing = missingPrivacyFields(s);
  const checks = checksFor(s.hosting, s.aiEnabled);
  const processors = activeProcessors(s.hosting, s.aiEnabled);
  const done = checks.filter((c) => s.checks[c.id]).length + (missing.length === 0 ? 1 : 0);
  const total = checks.length + 1;

  return (
    <div className="flex flex-col gap-6">
      <Section title="Auf einen Blick" testId="datenschutz-fakten">
        <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {privacyFacts(s.hosting).map((f) => (
            <li key={f.title} className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block font-semibold">{f.title}</span>
                <span className="text-sm text-muted-foreground">{f.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`Deine Checkliste · ${done} von ${total} erledigt`} testId="datenschutz-checkliste">
          <div className="flex flex-col divide-y">
            <p className="flex items-start gap-3 py-2">
              {missing.length === 0 ? (
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              ) : (
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-highlight" aria-hidden />
              )}
              <span className={missing.length === 0 ? "text-muted-foreground" : undefined}>
                Angaben für den Datenschutzhinweis ausgefüllt
                {missing.length > 0 && <span className="block text-sm text-highlight">Es fehlt: {missing.join(", ")}</span>}
              </span>
            </p>
            {checks.map((c) => (
              <CheckItem key={c.id} id={c.id} label={c.label} checked={!!s.checks[c.id]} />
            ))}
          </div>
        </Section>

        <div className="flex flex-col gap-6">
          <Section
            title="Angaben für den Datenschutzhinweis"
            description="Erscheinen auf der Seite „Datenschutz“, die Mitglieder vom Bierdeckel aus öffnen können."
            testId="datenschutz-angaben"
          >
            <PrivacySettingsForm initial={s} />
          </Section>
          <Section title="Wo läuft die App?" description="Danach richten sich Datenschutzhinweis, Auftragsverarbeiter und Checkliste." testId="hosting">
            <HostingForm initial={s.hosting} />
          </Section>
        </div>
      </div>

      <Section
        title="Auftragsverarbeiter"
        description="Dienste, die Daten im Auftrag verarbeiten. Mit jedem braucht es einen Vertrag zur Auftragsverarbeitung (AVV) – meist reicht ein Klick in deren Konto."
        testId="auftragsverarbeiter"
      >
        {processors.length === 0 && <p className="mb-3">Keine – die App läuft auf einem eigenen Gerät.</p>}
        <div className={processors.length === 0 ? "hidden" : "overflow-x-auto"}>
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Dienst</th>
                <th className="py-2 pr-3 font-medium">Wofür · welche Daten</th>
                <th className="py-2 pr-3 font-medium">Wo</th>
                <th className="py-2 font-medium">Vertrag</th>
              </tr>
            </thead>
            <tbody className="divide-y align-top">
              {processors.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-3 font-semibold">{p.name}</td>
                  <td className="py-2 pr-3">
                    {p.purpose}
                    <span className="block text-muted-foreground">{p.data}</span>
                  </td>
                  <td className="py-2 pr-3">{p.location}</td>
                  <td className="py-2">
                    {p.contract}
                    {p.hint && <span className="block text-highlight">{p.hint}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Kein Auftragsverarbeiter, sondern eigenständig verantwortlich: PayPal – nur wenn ein Mitglied per PayPal bezahlt; die App öffnet dafür lediglich
          PayPal.me mit dem Betrag.
        </p>
      </Section>

      <Section title="Wenn ein Mitglied fragt">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <span className="font-semibold">„Was habt ihr über mich gespeichert?“</span> – Mitglieder → Name → Datenschutz → <em>Alle Daten (JSON)</em> und{" "}
            <em>Buchungen (CSV)</em> herunterladen und weitergeben (innerhalb eines Monats).
          </li>
          <li>
            <span className="font-semibold">„Bitte löscht mich.“</span> – Deckel begleichen lassen, dann Mitglieder → Name → Datenschutz →{" "}
            <em>Anonymisieren</em>.
          </li>
          <li>
            <span className="font-semibold">„Mein Link ist in falsche Hände geraten.“</span> – Mitglieder → Name → <em>Link sperren</em> bzw. neuen Link erzeugen.
          </li>
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Hinweis: Die Texte sind sorgfältige Entwürfe, aber keine Rechtsberatung. Lass den Datenschutzhinweis vor dem Start einmal von jemand Kundigem prüfen.
        </p>
      </Section>
    </div>
  );
}
