#!/usr/bin/env bash
# Creates a permanent signing key and stores it as GitHub secrets, so every APK
# built by CI has the same signature and installs as an update over the last one.
set -euo pipefail

REPO="${1:-KbzonZito/printer-hub}"
DIR="$HOME/.config/printer-hub"
mkdir -p "$DIR" && chmod 700 "$DIR"

if [ ! -f "$DIR/release.p12" ]; then
  PASS=$(openssl rand -hex 16)
  openssl req -x509 -newkey rsa:2048 -nodes -days 10000 -subj "/CN=Printer Hub" \
    -keyout "$DIR/key.pem" -out "$DIR/cert.pem" 2>/dev/null
  openssl pkcs12 -export -name printerhub -inkey "$DIR/key.pem" -in "$DIR/cert.pem" \
    -out "$DIR/release.p12" -passout "pass:$PASS"
  rm "$DIR/key.pem"
  printf 'KEYSTORE_PASSWORD=%s\nKEY_ALIAS=printerhub\n' "$PASS" > "$DIR/signing.env"
  chmod 600 "$DIR"/*
  echo "Clave creada en $DIR (guárdala: sin ella no podrás actualizar la app instalada)."
fi

source "$DIR/signing.env"
base64 < "$DIR/release.p12" | gh secret set KEYSTORE_BASE64 -R "$REPO"
gh secret set KEYSTORE_PASSWORD -R "$REPO" --body "$KEYSTORE_PASSWORD"
gh secret set KEY_ALIAS -R "$REPO" --body "$KEY_ALIAS"
echo "Secretos configurados en $REPO. Lanza una compilación nueva con: gh workflow run android.yml -R $REPO"
