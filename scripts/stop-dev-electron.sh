#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_BIN="$PROJECT_ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"

if pgrep -f "$ELECTRON_BIN" >/dev/null 2>&1; then
  echo "Stopping development Electron processes..."
  pkill -f "$ELECTRON_BIN" || true
  sleep 1
fi

if pgrep -f "$ELECTRON_BIN" >/dev/null 2>&1; then
  echo "Force killing remaining development Electron processes..."
  pkill -9 -f "$ELECTRON_BIN" || true
fi

echo "Done."
