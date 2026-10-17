#!/bin/sh
# Start im Docker-Container: fehlende Geheimnisse beim ersten Start erzeugen und im Datenordner
# ablegen (gehören zur Sicherung des Ordners dazu), dann die App starten.
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

random() {
  node -e "process.stdout.write(require('node:crypto').randomBytes($1).toString('base64url'))"
}

if [ -z "$BETTER_AUTH_SECRET" ]; then
  f="$DATA_DIR/.auth-secret"
  if [ ! -s "$f" ]; then
    (umask 077 && random 32 > "$f")
    echo "Vereinsdeckel: neuer Geheimschlüssel in $f angelegt – zusammen mit dem Datenordner sichern."
  fi
  BETTER_AUTH_SECRET="$(cat "$f")"
  export BETTER_AUTH_SECRET
fi

if [ -z "$SETUP_CODE" ]; then
  f="$DATA_DIR/.setup-code"
  [ -s "$f" ] || (umask 077 && random 18 > "$f")
  SETUP_CODE="$(cat "$f")"
  export SETUP_CODE
  echo "Vereinsdeckel: Einrichtungs-Code für /einrichten: $SETUP_CODE"
fi

exec "$@"
