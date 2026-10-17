# Installation bei Vercel + Neon (ohne eigenen Server)

So läuft der Vereinsdeckel im Internet, ohne dass ihr einen Server betreiben müsst:
**Vercel** führt die App aus, **Neon** speichert die Daten. Beide stehen in Frankfurt am Main.

Dauer: etwa 15 Minuten. Ihr braucht ein kostenloses Konto bei [GitHub](https://github.com) –
Vercel und Neon legt ihr dabei mit GitHub an.

> **Tarif:** Vercels kostenloser Tarif „Hobby“ ist laut Vercel nur für private, nicht-kommerzielle
> Nutzung gedacht und enthält keinen Vertrag zur Auftragsverarbeitung (DSGVO). Wer über die App
> verkauft, sollte den Tarif „Pro“ prüfen. Neon reicht im kostenlosen Tarif für einen Verein.

## 1. Auf den Knopf

[![Mit Vercel installieren](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffloddel%2Fvereinsdeckel&project-name=vereinsdeckel&repository-name=vereinsdeckel&env=BETTER_AUTH_SECRET%2CSETUP_CODE&envDescription=Zwei%20lange%20Zufallswerte%3A%20Geheimschl%C3%BCssel%20%28mind.%2032%20Zeichen%29%20und%20Einrichtungs-Code%20%28mind.%2016%20Zeichen%29%20%E2%80%93%20z.%20B.%20aus%20einem%20Passwort-Generator.&envLink=https%3A%2F%2Fgithub.com%2Ffloddel%2Fvereinsdeckel%2Fblob%2Fmain%2Fdocs%2Finstallation-vercel.md%23die-zwei-werte&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

Vercel führt euch dann durch drei Dinge:

1. **Repository anlegen:** Vercel legt eine Kopie des Vereinsdeckels in eurem GitHub-Konto an.
2. **Datenbank (Neon):** „Add“ bzw. „Create“ wählen und als Region **Frankfurt (eu-central-1)**.
   Vercel trägt die Datenbankadresse (`DATABASE_URL`) selbst ein.
3. **Die zwei Werte** eintragen (siehe unten) und **Deploy** klicken.

Nach ein paar Minuten zeigt Vercel die Adresse eurer App, z. B. `https://vereinsdeckel-xyz.vercel.app`.

## Die zwei Werte

Beide denkt ihr euch selbst aus – am einfachsten mit dem Passwort-Generator eures Browsers
oder Passwort-Managers. Nur Buchstaben und Ziffern, je länger, desto besser.

| Name | Was | Länge |
|---|---|---|
| `BETTER_AUTH_SECRET` | Geheimschlüssel der App. Damit sind Anmeldungen und der zweite Faktor gesichert. | mindestens 32 Zeichen |
| `SETUP_CODE` | Einrichtungs-Code: Nur wer ihn kennt, kann das erste Admin-Konto anlegen. | mindestens 16 Zeichen |

**Wichtig:** Den Geheimschlüssel in eurem Passwort-Manager aufheben. Vercel zeigt ihn später
nicht mehr an, und bei einem Umzug wird genau dieser Schlüssel gebraucht (sonst funktioniert
der zweite Faktor nicht mehr).

## 2. Einrichten

1. Die Adresse eurer App öffnen und `/einrichten` anhängen, z. B. `https://vereinsdeckel-xyz.vercel.app/einrichten`.
2. Einrichtungs-Code, Name, E-Mail, Passwort und PIN eingeben.
3. Der **Einrichtungsassistent** führt durch den Rest: Verein und Logo, zweiter Faktor,
   Datenschutz, Artikel und Mitglieder.

Den Einrichtungs-Code braucht ihr danach nicht mehr (ihr könnt ihn bei Vercel löschen).

## 3. Eigene Adresse (optional)

Statt `…vercel.app` z. B. `theke.mein-verein.de`:

1. Vercel → Projekt → **Settings → Domains** → Adresse eintragen.
2. Beim Anbieter eurer Domain (Strato, IONOS, …) den **CNAME-Eintrag** setzen, den Vercel anzeigt –
   nur für die Subdomain, **nicht** die Nameserver der ganzen Domain umstellen.
3. Fertig – die App erkennt die neue Adresse selbst. **Erst danach QR-Karten drucken.**

## Updates

Neue Versionen erscheinen im Repository [floddel/vereinsdeckel](https://github.com/floddel/vereinsdeckel).
So holt ihr sie in eure Kopie:

1. Vorher sichern: Verwaltung → Einstellungen → **Sichern & Umziehen** → Sicherung herunterladen.
2. In **eurer** Kopie bei GitHub: Reiter **Actions** → links **„Update holen“** → **„Run workflow“**.
3. Ein paar Minuten warten: GitHub übernimmt die neueste Version, Vercel veröffentlicht sie
   automatisch und spielt nötige Datenbank-Änderungen dabei selbst ein.

Eure Kopie entspricht danach genau der neuen Version. Habt ihr den Code selbst verändert, gehen
diese Änderungen dabei verloren – wer selbst entwickelt, holt Updates besser von Hand (`git merge`).
