#!/usr/bin/env bash
# Publishes a tested version: sets the version, dates its CHANGELOG section, commits,
# tags and pushes. GitHub Actions then builds the APK and creates the release.
#
#   scripts/release.sh 0.3.0
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:?Uso: scripts/release.sh MAJOR.MINOR.PATCH}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Versión inválida: $VERSION" >&2; exit 1; }
[ "$(git branch --show-current)" = main ] || { echo "Hay que estar en main" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Hay cambios sin commitear" >&2; exit 1; }
git rev-parse "v$VERSION" >/dev/null 2>&1 && { echo "La versión v$VERSION ya existe" >&2; exit 1; }

# The Unreleased section becomes this version's release notes.
NOTES=$(awk '/^## \[Unreleased\]/{p=1; next} /^## /{p=0} p' CHANGELOG.md | grep -v '^\s*$' || true)
[ -n "$NOTES" ] || { echo "CHANGELOG.md no tiene nada en [Unreleased]" >&2; exit 1; }

npm version "$VERSION" --no-git-tag-version >/dev/null
TODAY=$(date +%Y-%m-%d)
awk -v v="$VERSION" -v d="$TODAY" '
  /^## \[Unreleased\]/ { print; print ""; print "## [" v "] - " d; next }
  { print }
' CHANGELOG.md > CHANGELOG.tmp && mv CHANGELOG.tmp CHANGELOG.md

git add package.json package-lock.json CHANGELOG.md
git commit -m "Release v$VERSION"
git tag -a "v$VERSION" -m "Printer Hub $VERSION"
git push origin main "v$VERSION"
echo "Publicado v$VERSION. GitHub Actions creará la release con el APK en unos minutos."
