#!/usr/bin/env bash
# Builds a test APK locally, signed with the same key as the GitHub releases so it installs
# as an update over the app on your phone. Nothing is uploaded anywhere.
#
#   scripts/build-apk.sh           build, and install over USB/Wi-Fi debugging if a phone is connected
#   scripts/build-apk.sh --serve   also serve it on the local network to download from the phone
set -euo pipefail
cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$(brew --prefix)/share/android-commandlinetools}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

KEYDIR="$HOME/.config/printer-hub"
if [ -f "$KEYDIR/release.p12" ]; then
  source "$KEYDIR/signing.env"
  export KEYSTORE_PATH="$KEYDIR/release.p12" KEYSTORE_PASSWORD KEY_ALIAS
else
  echo "Aviso: no está la clave en $KEYDIR; el APK no se podrá instalar encima de la app." >&2
fi

VERSION=$(node -p "require('./package.json').version")
SUFFIX="-test.$(git rev-parse --short HEAD)"
[ -n "$(git status --porcelain)" ] && SUFFIX="$SUFFIX-wip"
export VERSION_SUFFIX="$SUFFIX"

npm run build
npx cap sync android
(cd android && ./gradlew assembleRelease --quiet)

mkdir -p builds
APK="builds/printer-hub-$VERSION$SUFFIX.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$APK"
echo
echo "APK de prueba: $APK"

if command -v adb >/dev/null && adb get-state >/dev/null 2>&1; then
  echo "Instalando en el teléfono conectado…"
  adb install -r "$APK"
fi

if [ "${1:-}" = "--serve" ]; then
  IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
  echo "Ábrelo desde el teléfono (misma Wi-Fi): http://$IP:8765/$(basename "$APK")"
  echo "Ctrl+C para parar."
  cd builds && python3 -m http.server 8765 --bind "$IP"
fi
