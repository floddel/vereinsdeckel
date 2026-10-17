# Installation mit Docker (NAS, Raspberry Pi, eigener Server)

So läuft der Vereinsdeckel auf eigener Hardware – z. B. auf einer Synology, einem Raspberry Pi
(ab Modell 4, 64 Bit) oder einem gemieteten Server. Die Daten bleiben bei euch.

Ihr braucht: ein Gerät mit **Docker** und **Docker Compose**.

## 1. Starten

Einen Ordner anlegen, z. B. `vereinsdeckel`, und darin die Datei
[`docker-compose.yml`](../docker-compose.yml) aus diesem Repository speichern. Dann im Ordner:

```bash
docker compose up -d
```

Nach etwa einer Minute ist der Vereinsdeckel unter `http://<adresse-des-geräts>:3000` erreichbar.

**Synology (Container Manager):** Projekt → Erstellen → Ordner wählen → „docker-compose.yml
hochladen“ → Erstellen. Die Adresse ist dann `http://<name-der-synology>:3000`.

## 2. Einrichten

Beim ersten Start erzeugt der Vereinsdeckel selbst einen **Geheimschlüssel** und einen
**Einrichtungs-Code** und legt beide im Datenordner ab. Den Code zeigt:

```bash
docker compose logs vereinsdeckel
```

(Zeile „Einrichtungs-Code für /einrichten: …“; bei Synology unter Container → Protokoll.)
Dann `http://<adresse>:3000/einrichten` öffnen, Code eingeben, Konto anlegen – der
**Einrichtungsassistent** führt durch den Rest.

## 3. Von außen erreichbar machen (für die Handys der Mitglieder)

Im Vereinsheim-WLAN klappt alles über `http://…:3000`. Damit Mitglieder ihren Bierdeckel auch
unterwegs sehen – und damit die Theke offline arbeiten kann –, braucht der Vereinsdeckel eine
Adresse mit **HTTPS**, z. B. `https://theke.mein-verein.de`:

- **Synology:** Systemsteuerung → Anmeldeportal → Erweitert → **Reverse Proxy** (Ziel `localhost:3000`)
  plus Zertifikat über Let's Encrypt.
- **Eigener Server:** z. B. [Caddy](https://caddyserver.com) davorschalten (holt das Zertifikat selbst).
- Alternativ ein Tunnel-Dienst eures Vertrauens.

Danach in `docker-compose.yml` die Adresse eintragen (Zeile `APP_URL` einkommentieren) und neu
starten: `docker compose up -d`. **Erst dann QR-Karten drucken.**

## Daten und Sicherung

Alles liegt im Ordner `daten` neben der `docker-compose.yml`:

| Datei/Ordner | Inhalt |
|---|---|
| `daten/db` | die Datenbank |
| `daten/.auth-secret` | der Geheimschlüssel – ohne ihn funktioniert der zweite Faktor nicht mehr |
| `daten/.setup-code` | der Einrichtungs-Code (nach der Einrichtung nicht mehr nötig) |

Sichert den **ganzen Ordner `daten`** (z. B. mit Hyper Backup) – am besten bei gestopptem
Container (`docker compose stop`). Zusätzlich gibt es in der App Verwaltung → Einstellungen →
**Sichern & Umziehen** eine Sicherungsdatei, z. B. für einen Umzug.

## Updates

```bash
docker compose pull
docker compose up -d
```

Nötige Datenbank-Änderungen spielt der Vereinsdeckel beim Start selbst ein. Vorher eine Sicherung
machen. Eine bestimmte Version statt der neuesten: in `docker-compose.yml` z. B.
`ghcr.io/floddel/vereinsdeckel:1.0.0` statt `:latest`.

## PostgreSQL statt eingebauter Datenbank (optional)

Die eingebaute Datenbank reicht für einen Verein. Wer lieber PostgreSQL nutzt:
[`docker-compose.postgres.yml`](../docker-compose.postgres.yml) daneben speichern, darin das
Passwort ändern und so starten:

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

Eine bestehende Installation zieht ihr über **Sichern & Umziehen** um (Sicherung herunterladen,
neu starten, im Assistenten übernehmen).

## Einstellungen

| Name | Wofür |
|---|---|
| `APP_URL` | feste Adresse (mit https) für Mitglieder-Links und QR-Karten |
| `DATABASE_URL` | PostgreSQL statt eingebauter Datenbank |
| `BETTER_AUTH_SECRET`, `SETUP_CODE` | nur, wenn ihr sie selbst vorgeben wollt (sonst automatisch) |
| `TZ` | Zeitzone, Standard `Europe/Berlin` |

Hinweis im Protokoll „Base URL is not set“: harmlos, solange keine `APP_URL` gesetzt ist.
