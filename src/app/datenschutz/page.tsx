import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import { activeProcessors, missingPrivacyFields, privacyFacts } from "@/domain/privacy";
import { getPrivacySettings } from "@/server/privacy";

export const metadata: Metadata = { title: "Datenschutz" };

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" });

/** Datenschutzhinweis für Mitglieder (öffentlich, verlinkt vom Bierdeckel und vom Login). */
export default function DatenschutzPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Suspense fallback={<p className="text-muted-foreground">Lädt …</p>}>
        <Hinweis />
      </Suspense>
    </main>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-8 mb-2 font-heading text-xl font-bold">{children}</h2>;
}

const placeholder = (v: string | null, label: string) => v?.trim() || <span className="rounded bg-highlight/15 px-1 text-highlight">[{label} – in der Verwaltung eintragen]</span>;

async function Hinweis() {
  await connection();
  const db = getDb();
  const [p, [s]] = await Promise.all([getPrivacySettings(db), db.select({ clubName: settings.clubName, updatedAt: settings.updatedAt }).from(settings)]);
  const processors = activeProcessors(p.hosting, p.aiEnabled);
  const incomplete = missingPrivacyFields(p).length > 0;

  return (
    <article className="flex flex-col leading-relaxed">
      <p className="text-sm text-muted-foreground">{s?.clubName ?? "Verein"} · Vereinsdeckel</p>
      <h1 className="font-heading text-3xl font-bold tracking-tight">Datenschutz</h1>
      <p className="mt-3">
        Hier steht, welche Daten der digitale Bierdeckel über dich speichert, wofür und wie lange – kurz und verständlich. Das Wichtigste vorweg:
        gespeichert wird nur dein Name und was du an der Theke anschreibst bzw. bezahlst.
      </p>
      {incomplete && (
        <p role="note" className="mt-4 rounded-xl bg-highlight/10 p-3 text-sm">
          Dieser Hinweis ist noch nicht vollständig ausgefüllt.
        </p>
      )}

      <H2>Wer ist verantwortlich?</H2>
      <p>
        {placeholder(p.controller, "Name")}
        <br />
        <span className="whitespace-pre-line">{placeholder(p.address, "Anschrift")}</span>
        <br />
        E-Mail: {p.email ? <a href={`mailto:${p.email}`} className="text-primary underline">{p.email}</a> : placeholder(null, "E-Mail")}
      </p>

      <H2>Welche Daten werden gespeichert?</H2>
      <ul className="list-disc pl-5">
        <li>
          <strong>Dein Name</strong>, so wie man dich an der Theke kennt. Keine Adresse, keine E-Mail, kein Geburtsdatum.
        </li>
        <li>
          <strong>Dein persönlicher Link</strong> (QR-Code) – ein zufälliger Schlüssel, mit dem du deinen Bierdeckel siehst. Ein Konto oder Passwort gibt es
          nicht.
        </li>
        <li>
          <strong>Was du anschreibst</strong>: Artikel, Menge, Preis, Zeitpunkt; auch Stornos mit Grund.
        </li>
        <li>
          <strong>Was du bezahlst</strong>: Betrag, bar oder PayPal, Trinkgeld.
        </li>
        <li>
          <strong>Essensbestellungen per Handy</strong> samt Wunsch („mit Senf“) – sie werden nach 30 Tagen automatisch gelöscht.
        </li>
      </ul>

      <H2>Wofür und auf welcher Grundlage?</H2>
      <p>
        Damit abgerechnet werden kann, was du verzehrst, und du deinen Deckel jederzeit selbst sehen kannst (Art. 6 Abs. 1 lit. b DSGVO – Abrechnung
        deiner Bestellungen). Soweit Aufzeichnungen der Kasse gesetzlich aufbewahrt werden müssen, zusätzlich Art. 6 Abs. 1 lit. c DSGVO. Es gibt
        keine Werbung, keine Auswertung einzelner Personen und keine Weitergabe zu anderen Zwecken.
      </p>

      <H2>Wie lange?</H2>
      <p>
        Solange du den Bierdeckel nutzt. Möchtest du gelöscht werden, wird dein Name überall entfernt („anonymisiert“), sobald dein Deckel beglichen
        ist. Die Buchungen bleiben danach <em>ohne Namen</em> erhalten, damit die Kasse stimmt. Handy-Bestellungen werden nach 30 Tagen gelöscht.
      </p>

      <H2>Wer verarbeitet die Daten noch?</H2>
      {p.hosting.kind === "own" && (
        <p>Die App läuft auf einem eigenen Gerät – deine Daten liegen bei keinem fremden Anbieter.</p>
      )}
      {processors.length > 0 && (
        <>
          <p className={p.hosting.kind === "own" ? "mt-2" : undefined}>
            {p.hosting.kind === "own"
              ? "Nur für eine Zusatzfunktion hilft ein Dienstleister, der Daten nur in unserem Auftrag und nach Vertrag (Auftragsverarbeitung) verarbeitet:"
              : "Die App läuft bei Dienstleistern, die die Daten nur in unserem Auftrag und nach Vertrag (Auftragsverarbeitung) verarbeiten:"}
          </p>
          <ul className="mt-2 list-disc pl-5">
            {processors.map((x) => (
              <li key={x.id}>
                <strong>{x.name}</strong> – {x.purpose}; {x.location}.{x.onlyWithAi && " Bekommt keine Daten über dich."}
              </li>
            ))}
          </ul>
          {processors.some((x) => x.us) && (
            <p className="mt-2">Bei US-Unternehmen sichern die EU-Standardvertragsklauseln bzw. das EU-US Data Privacy Framework die Übermittlung ab.</p>
          )}
        </>
      )}
      <p className="mt-2">
        <strong>PayPal:</strong> Bezahlst du per PayPal, öffnet die App nur PayPal mit dem Betrag. Die Zahlung selbst läuft bei PayPal (Europe) S.à r.l.
        et Cie, S.C.A., Luxemburg, nach deren Datenschutzbestimmungen.
      </p>

      <H2>Keine Tracker, keine Cookies</H2>
      <p>
        Deine Bierdeckel-Seite setzt keine Cookies und bindet keine Analyse- oder Werbedienste ein. Schriften und Bilder kommen nicht von fremden
        Servern. Die Verbindung ist verschlüsselt.
      </p>

      <H2>Deine Rechte</H2>
      <p>
        Du kannst jederzeit Auskunft über deine Daten verlangen (du bekommst sie als Datei), sie berichtigen oder löschen lassen, die Verarbeitung
        einschränken lassen und ihr widersprechen (Art. 15–18, 20, 21 DSGVO). Melde dich dafür einfach an der Theke oder per E-Mail. Hast du deinen Link
        verloren oder weitergegeben, wird er gesperrt und du bekommst einen neuen.
      </p>
      <p className="mt-2">Außerdem kannst du dich bei der Datenschutz-Aufsichtsbehörde beschweren: {placeholder(p.authority, "Aufsichtsbehörde")}</p>

      <H2>Kurz gesagt</H2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {privacyFacts(p.hosting).slice(0, 4).map((f) => (
          <li key={f.title} className="rounded-xl bg-card p-3 text-sm shadow-soft dark:ring-1 dark:ring-white/5">
            <strong className="block">{f.title}</strong>
            {f.text}
          </li>
        ))}
      </ul>

      {s?.updatedAt && <p className="mt-8 text-sm text-muted-foreground">Stand: {dateFormat.format(s.updatedAt)}</p>}
    </article>
  );
}
