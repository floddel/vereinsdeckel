/**
 * Datenschutz: Bausteine für den Datenschutzhinweis, die Liste der Auftragsverarbeiter und die
 * Checkliste des Betreibers. Nichts Persönliches im Code – Verantwortlicher, Anschrift usw.
 * trägt jeder Betreiber in den Einstellungen ein.
 */

/** Datenschutz-Aufsichtsbehörden der Länder (nicht-öffentlicher Bereich). Bitte vor Gebrauch prüfen. */
export const AUTHORITIES: { state: string; name: string; web: string }[] = [
  { state: "Baden-Württemberg", name: "Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg", web: "www.baden-wuerttemberg.datenschutz.de" },
  { state: "Bayern", name: "Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)", web: "www.lda.bayern.de" },
  { state: "Berlin", name: "Berliner Beauftragte für Datenschutz und Informationsfreiheit", web: "www.datenschutz-berlin.de" },
  { state: "Brandenburg", name: "Landesbeauftragte für den Datenschutz und für das Recht auf Akteneinsicht Brandenburg", web: "www.lda.brandenburg.de" },
  { state: "Bremen", name: "Landesbeauftragte für Datenschutz und Informationsfreiheit der Freien Hansestadt Bremen", web: "www.datenschutz.bremen.de" },
  { state: "Hamburg", name: "Hamburgische Beauftragte für Datenschutz und Informationsfreiheit", web: "datenschutz-hamburg.de" },
  { state: "Hessen", name: "Hessische Beauftragte für Datenschutz und Informationsfreiheit", web: "datenschutz.hessen.de" },
  { state: "Mecklenburg-Vorpommern", name: "Landesbeauftragte für Datenschutz und Informationsfreiheit Mecklenburg-Vorpommern", web: "www.datenschutz-mv.de" },
  { state: "Niedersachsen", name: "Landesbeauftragte für den Datenschutz Niedersachsen", web: "www.lfd.niedersachsen.de" },
  { state: "Nordrhein-Westfalen", name: "Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen", web: "www.ldi.nrw.de" },
  { state: "Rheinland-Pfalz", name: "Landesbeauftragte für den Datenschutz und die Informationsfreiheit Rheinland-Pfalz", web: "www.datenschutz.rlp.de" },
  { state: "Saarland", name: "Unabhängiges Datenschutzzentrum Saarland", web: "www.datenschutz.saarland.de" },
  { state: "Sachsen", name: "Sächsische Datenschutz- und Transparenzbeauftragte", web: "www.datenschutz.sachsen.de" },
  { state: "Sachsen-Anhalt", name: "Landesbeauftragte für den Datenschutz Sachsen-Anhalt", web: "datenschutz.sachsen-anhalt.de" },
  { state: "Schleswig-Holstein", name: "Unabhängiges Landeszentrum für Datenschutz Schleswig-Holstein (ULD)", web: "www.datenschutzzentrum.de" },
  { state: "Thüringen", name: "Thüringer Landesbeauftragte für den Datenschutz und die Informationsfreiheit (TLfDI)", web: "www.tlfdi.de" },
];

export const authorityText = (a: (typeof AUTHORITIES)[number]) => `${a.name}, ${a.web}`;

export interface Processor {
  id: string;
  name: string;
  purpose: string;
  data: string;
  location: string;
  /** wo der Auftragsverarbeitungsvertrag steht */
  contract: string;
  /** Hinweis für den Betreiber */
  hint?: string;
  /** nur wenn die Kassenbon-Erkennung eingeschaltet ist */
  onlyWithAi?: boolean;
  /** US-Unternehmen (Hinweis auf Standardvertragsklauseln / Data Privacy Framework) */
  us?: boolean;
}

/** Wo die App läuft – bestimmt Auftragsverarbeiter, Checkliste und „Auf einen Blick“. */
export type HostingKind = "vercel-neon" | "own" | "provider";

export interface Hosting {
  kind: HostingKind;
  /** nur bei „provider“ */
  name: string | null;
  location: string | null;
  contract: string | null;
}

export const HOSTING_OPTIONS: { id: HostingKind; label: string; description: string }[] = [
  { id: "vercel-neon", label: "Vercel + Neon", description: "Im Internet bei Vercel (Server) und Neon (Datenbank), beide in Frankfurt am Main." },
  { id: "own", label: "Eigenes Gerät", description: "Auf einem eigenen Rechner des Vereins oder Betreibers, z. B. NAS oder Raspberry Pi." },
  { id: "provider", label: "Anderer Anbieter", description: "Gemieteter Server oder eine andere Plattform (z. B. Hetzner, Railway) – Angaben selbst eintragen." },
];

export const isHostingKind = (v: unknown): v is HostingKind => HOSTING_OPTIONS.some((o) => o.id === v);

const VERCEL_NEON: Processor[] = [
  {
    id: "avv-db",
    name: "Neon (Databricks)",
    purpose: "Datenbank – speichert alle Daten der App",
    data: "Mitgliedernamen, Buchungen, Zahlungen, Bestellungen, Einkäufe, Einstellungen",
    location: "Frankfurt am Main (EU); US-Unternehmen",
    contract: "neon.com/dpa – gilt mit den Nutzungsbedingungen",
    us: true,
  },
  {
    id: "avv-hosting",
    name: "Vercel",
    purpose: "Hosting – liefert die App aus und führt sie aus",
    data: "alle Daten, die durch die App fließen; technische Zugriffsdaten (Server-Protokolle)",
    location: "Frankfurt am Main (Region fra1); US-Unternehmen",
    contract: "vercel.com/legal/dpa",
    hint: "Den Vertrag gibt es laut Vercel nur in den bezahlten Tarifen (Pro) – vor dem Livegang prüfen.",
    us: true,
  },
];

const ANTHROPIC: Processor = {
  id: "avv-ai",
  name: "Anthropic",
  purpose: "Kassenbon-Erkennung (KI) – nur wenn eingeschaltet",
  data: "Fotos von Kassenbons bzw. Ware und die Artikelliste – keine Mitgliederdaten",
  location: "USA",
  contract: "anthropic.com/legal/data-processing-addendum – gilt mit den Commercial Terms automatisch",
  onlyWithAi: true,
  us: true,
};

/** Auftragsverarbeiter je nach Hosting (eigenes Gerät: keine), dazu Anthropic, wenn die KI eingeschaltet ist. */
export function activeProcessors(hosting: Hosting, aiEnabled: boolean): Processor[] {
  const base: Processor[] =
    hosting.kind === "vercel-neon"
      ? VERCEL_NEON
      : hosting.kind === "provider"
        ? [
            {
              id: "avv-provider",
              name: hosting.name?.trim() || "Hosting-Anbieter",
              purpose: "Hosting und Datenbank – führt die App aus und speichert alle Daten",
              data: "alle Daten der App; technische Zugriffsdaten (Server-Protokolle)",
              location: hosting.location?.trim() || "– bitte eintragen –",
              contract: hosting.contract?.trim() || "– bitte eintragen –",
            },
          ]
        : [];
  return aiEnabled ? [...base, ANTHROPIC] : base;
}

/** Was die App von sich aus für den Datenschutz tut („auf einen Blick“ – auch als Verkaufsargument). */
export function privacyFacts(hosting: Hosting): { title: string; text: string }[] {
  const where =
    hosting.kind === "vercel-neon"
      ? { title: "Daten in Deutschland", text: "Datenbank und Server stehen in Frankfurt am Main." }
      : hosting.kind === "own"
        ? { title: "Daten bleiben bei uns", text: "Die App läuft auf einem eigenen Gerät – die Daten liegen bei keinem fremden Anbieter." }
        : {
            title: "Bekannter Standort",
            text: `Die App läuft bei ${hosting.name?.trim() || "einem Hosting-Anbieter"}${hosting.location?.trim() ? ` (${hosting.location.trim()})` : ""}.`,
          };
  return [
    { title: "Nur ein Name", text: "Von Mitgliedern speichert die App nur den Namen – keine Adresse, keine E-Mail, kein Geburtsdatum." },
    { title: "Kein Konto, kein Passwort", text: "Mitglieder öffnen ihren Bierdeckel über einen geheimen Link oder QR-Code. Der Link lässt sich jederzeit sperren." },
    { title: "Keine Tracker, keine Werbung", text: "Keine Analyse-Dienste, keine Cookies in der Mitgliederansicht, keine Schriften oder Bilder von fremden Servern." },
    where,
    { title: "Auskunft per Knopfdruck", text: "Alle Daten eines Mitglieds als Datei herunterladen – für Auskunftsanfragen." },
    { title: "Löschen per Knopfdruck", text: "Mitglieder anonymisieren: Der Name verschwindet überall, die Kasse stimmt trotzdem weiter." },
    { title: "Löscht von selbst", text: "Handy-Bestellungen samt Wunschtext werden nach 30 Tagen gelöscht. Anmeldungen speichern weder IP-Adresse noch Browser." },
    { title: "KI nur, wenn gewollt", text: "Die Kassenbon-Erkennung ist aus, bis du sie einschaltest – und bekommt nie Mitgliederdaten." },
  ];
}

/** Alle Punkte, die es in der Checkliste geben kann (zum Prüfen beim Abhaken). */
const ALL_CHECKS: { id: string; label: string; when?: (h: Hosting, ai: boolean) => boolean }[] = [
  { id: "avv-db", label: "Auftragsverarbeitungsvertrag mit dem Datenbank-Anbieter (Neon) liegt vor", when: (h) => h.kind === "vercel-neon" },
  { id: "avv-hosting", label: "Auftragsverarbeitungsvertrag mit dem Hosting (Vercel) liegt vor", when: (h) => h.kind === "vercel-neon" },
  { id: "avv-provider", label: "Auftragsverarbeitungsvertrag mit dem Hosting-Anbieter liegt vor", when: (h) => h.kind === "provider" },
  { id: "geraet", label: "Das Gerät ist mit Passwort geschützt, wird aktualisiert und regelmäßig gesichert", when: (h) => h.kind === "own" },
  { id: "avv-ai", label: "Anthropic: Commercial Terms akzeptiert (Vertrag ist darin enthalten)", when: (_h, ai) => ai },
  { id: "geprueft", label: "Datenschutzhinweis gelesen und geprüft (z. B. vom Vorstand)" },
  { id: "bekannt", label: "Mitglieder wissen, wo der Hinweis steht (Link auf dem Bierdeckel, Aushang im Vereinsheim)" },
];

export const isCheckId = (id: string) => ALL_CHECKS.some((c) => c.id === id);

/** Checkliste des Betreibers für dieses Hosting (abhakbar, Angaben werden automatisch geprüft). */
export function checksFor(hosting: Hosting, aiEnabled: boolean): { id: string; label: string }[] {
  return ALL_CHECKS.filter((c) => !c.when || c.when(hosting, aiEnabled)).map(({ id, label }) => ({ id, label }));
}

export interface PrivacySettings {
  controller: string | null;
  address: string | null;
  email: string | null;
  authority: string | null;
}

/** Was im Datenschutzhinweis noch fehlt. */
export function missingPrivacyFields(s: PrivacySettings): string[] {
  const missing: string[] = [];
  if (!s.controller?.trim()) missing.push("Verantwortliche Person oder Verein");
  if (!s.address?.trim()) missing.push("Anschrift");
  if (!s.email?.trim()) missing.push("E-Mail für Datenschutzfragen");
  if (!s.authority?.trim()) missing.push("Aufsichtsbehörde");
  return missing;
}

/** „Ehemaliges Mitglied #4“ – fortlaufend, ohne Rückschluss auf die Person. */
export function anonymousName(existingNames: readonly string[]): string {
  const used = existingNames.map((n) => /^Ehemaliges Mitglied #(\d+)$/.exec(n)?.[1]).filter(Boolean).map(Number);
  return `Ehemaliges Mitglied #${Math.max(0, ...used) + 1}`;
}
