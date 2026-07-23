#!/usr/bin/env bash
# thin wrapper
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec "$ROOT/install.sh" --uninstall "$@"
