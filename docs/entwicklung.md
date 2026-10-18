# Entwicklung

Für alle, die am Vereinsdeckel mitarbeiten oder ihn anpassen wollen.

## Lokal starten

```bash
npm install
cp .env.example .env.local   # nur beim ersten Mal
npm run dev                  # → http://localhost:3000
```

## Wichtige Befehle

| Befehl | Was er tut |
|---|---|
| `npm run dev` | Entwicklungsserver starten |
| `npm test` | Tests der Geschäftslogik (Vitest) |
| `npm run test:e2e` | Browser-Tests auf Tablet, Desktop, iPhone, Android (Playwright) |
| `npm run typecheck` | TypeScript prüfen |
| `npm run lint` | Code-Stil prüfen |
| `npm run db:generate` | Datenbank-Migration aus dem Schema erzeugen |

## Technik

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · PostgreSQL mit Drizzle ORM
(eingebaut: PGlite; mit `DATABASE_URL` jedes PostgreSQL, z. B. Neon Frankfurt) · Vitest · Playwright.
Die Oberfläche nutzt die Systemschrift des Geräts; die Schriften für Bierdeckel, Kassenzettel und
Rohdaten liegen in `src/fonts` (SIL Open Font License) – es gibt keine externen Quellen.
Farben, Hell/Dunkel, Glas und Vereinsfarben stehen als Variablen in `src/app/globals.css`.

Die Bilder in `docs/bilder` entstehen automatisch mit erfundenen Daten: `npm run docs:bilder`.

Geheimnisse (Passwörter, Schlüssel) gehören nur in `.env.local` bzw. zu Vercel, nie ins Repository.

## Einstellungen (Umgebungsvariablen)

Siehe [`.env.example`](../.env.example). Die wichtigsten:

| Name | Wofür |
|---|---|
| `DATABASE_URL` | PostgreSQL (z. B. Neon). Ohne: eingebaute Datenbank (PGlite) in `PGLITE_DIR` bzw. `DATA_DIR/db` |
| `BETTER_AUTH_SECRET` | Geheimschlüssel, mindestens 32 Zeichen |
| `SETUP_CODE` | Einrichtungs-Code für das erste Konto (in Produktion Pflicht), mindestens 16 Zeichen |
| `APP_URL` | Feste Adresse für Mitglieder-Links und QR-Codes (bei Vercel automatisch) |
| `SOURCE_CODE_URL` | Link zum Quellcode einer veränderten Version (AGPL § 13) |
| `DEMO_MODE` | Nur für Vorführungen: `1` schaltet den Demo-Betrieb ein (siehe unten) – im Verein nie setzen |

## Demo-Betrieb

Für Vorführungen gibt es einen Demo-Betrieb. Er ist nur an, wenn `DEMO_MODE=1` gesetzt ist.

- Beim Start legt der Server in einer **frischen** Datenbank den erfundenen Verein „TSV Musterstadt“ an:
  Mitglieder, drei vergangene Abende, offene Deckel von heute, Tagesgericht, Tipp des Hauses und eine
  Handy-Bestellung (`src/server/demo-data.ts`). Gibt es schon ein Konto, wird nichts angelegt.
- Die Anmeldung ist schon ausgefüllt (`demo@example.org`, Passwort `vereinsdeckel`, PIN `1234`).
- Jede Seite zeigt unten rechts „Demo“, mit `DEMO_ENDS_AT` (ISO-Zeit, z. B. `2026-10-18T12:35:00Z`) auch bis wann.
- Ausgeschaltet sind Passwort, PIN und zweiten Faktor ändern, die Kassenbon-Erkennung, das Vereinslogo und
  das Übernehmen einer Sicherung.

Zum Ausprobieren mit eigener Datenbank:

```bash
rm -rf .data/demo && DEMO_MODE=1 PGLITE_DIR=.data/demo npm run dev
```

## Lizenz

Beiträge stehen unter derselben Lizenz wie das Projekt (AGPL-3.0, siehe [`NOTICE.md`](../NOTICE.md)).
