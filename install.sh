#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:-$HOME/.local/bin}"
mkdir -p "$DEST"
install -m 755 "$ROOT/bin/mn" "$DEST/mn"
printf 'installed: %s/mn\n' "$DEST"
printf 'version:   %s\n' "$("$DEST/mn" --version)"
if ! command -v mn >/dev/null 2>&1; then
  printf 'note: %s is not on PATH — add it to your shell rc\n' "$DEST"
fi
