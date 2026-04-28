#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Sarah.app"
PACKAGED_APP_PATH="$ROOT_DIR/out/Sarah-darwin-arm64/$APP_NAME"
TARGET_DIR="$HOME/Applications"
TARGET_APP_PATH="$TARGET_DIR/$APP_NAME"
APP_PROCESS_PATTERN="Sarah.app/Contents/MacOS/Sarah"

cd "$ROOT_DIR"

echo "Stopping stale development Electron processes..."
npm run stop:dev

if pgrep -f "$APP_PROCESS_PATTERN" >/dev/null 2>&1; then
  echo "Stopping existing Sarah app processes..."
  pkill -f "$APP_PROCESS_PATTERN" || true
  sleep 1
fi

if pgrep -f "$APP_PROCESS_PATTERN" >/dev/null 2>&1; then
  echo "Force killing remaining Sarah app processes..."
  pkill -9 -f "$APP_PROCESS_PATTERN" || true
fi

echo "Packaging $APP_NAME..."
rm -rf "$ROOT_DIR/out/Sarah-darwin-arm64"
npm run package

if [ ! -d "$PACKAGED_APP_PATH" ]; then
  echo "Packaged app not found at $PACKAGED_APP_PATH" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
rm -rf "$TARGET_APP_PATH"
ditto "$PACKAGED_APP_PATH" "$TARGET_APP_PATH"
xattr -dr com.apple.quarantine "$TARGET_APP_PATH" >/dev/null 2>&1 || true

echo "Installed to $TARGET_APP_PATH"
echo "If global hotkeys stop working after reinstall, re-enable Sarah in Accessibility and Input Monitoring."
open "$TARGET_APP_PATH"
