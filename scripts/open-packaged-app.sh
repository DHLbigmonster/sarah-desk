#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="$ROOT_DIR/out/Sarah-darwin-arm64/Sarah.app"

if [ ! -d "$APP_PATH" ]; then
  echo "Packaged app not found, building Sarah.app..."
  (cd "$ROOT_DIR" && npm run package)
fi

echo "Opening $APP_PATH"
open "$APP_PATH"
