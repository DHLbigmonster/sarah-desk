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
# rsync without -E does NOT preserve xattrs (ditto preserves com.apple.provenance
# which blocks codesign). rsync is the only reliable way to get a clean copy.
rsync -a "$PACKAGED_APP_PATH" "$TARGET_APP_PATH"

# Sign with a stable identity so TCC remembers the grant across reinstalls.
# Signing happens here (after ditto) rather than in forge.config.ts so that
# the clean ditto output has no resource forks that would block codesign.
IDENTITY="${CODESIGN_IDENTITY:-}"
if [ -z "$IDENTITY" ]; then
  IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | grep -Eo '[0-9A-F]{40}' | head -1 || true)"
fi

if [ -n "$IDENTITY" ]; then
  echo "Signing $APP_NAME with identity $IDENTITY..."
  # Sign helpers and frameworks inside-out, then sign the root bundle
  find "$TARGET_APP_PATH/Contents/Frameworks" -name "*.app" -maxdepth 2 | sort -r | while read -r helper; do
    codesign --force --sign "$IDENTITY" "$helper" 2>/dev/null || true
  done
  find "$TARGET_APP_PATH/Contents/Frameworks" \( -name "*.dylib" -o -name "*.framework" \) -maxdepth 3 | sort -r | while read -r lib; do
    codesign --force --sign "$IDENTITY" "$lib" 2>/dev/null || true
  done
  codesign --force --sign "$IDENTITY" "$TARGET_APP_PATH"
  IDENT_LINE="$(codesign -dvvv "$TARGET_APP_PATH" 2>&1 | grep -E '^Authority=' | head -1 || true)"
  echo "Signed: ${IDENT_LINE:-$IDENTITY}"
else
  echo "WARNING: No codesigning identity found. App is adhoc-signed. TCC permissions will reset on every reinstall."
  echo "         Set CODESIGN_IDENTITY or add an Apple Development cert to your keychain."
fi

# Only reset TCC entries when the signing identity changed (or signing failed).
# A stable Apple Development cert keeps the grant across reinstalls — resetting
# it every time defeats the entire point of stable signing and forces the user
# to re-authorize on every install. Set FORCE_TCC_RESET=1 to override.
NEW_AUTHORITY="$(codesign -dvvv "$TARGET_APP_PATH" 2>&1 | grep -E '^Authority=' | head -1 || true)"
NEW_TEAM="$(codesign -dvvv "$TARGET_APP_PATH" 2>&1 | grep -E '^TeamIdentifier=' | head -1 || true)"
LAST_AUTH_FILE="$ROOT_DIR/.last-install-authority"
LAST_AUTHORITY=""
if [ -f "$LAST_AUTH_FILE" ]; then
  LAST_AUTHORITY="$(cat "$LAST_AUTH_FILE")"
fi
SIGNATURE_DRIFTED=0
if [ "${FORCE_TCC_RESET:-0}" = "1" ]; then
  SIGNATURE_DRIFTED=1
elif [ -n "$NEW_AUTHORITY" ] && [ "$NEW_AUTHORITY" != "$LAST_AUTHORITY" ]; then
  SIGNATURE_DRIFTED=1
elif [ -z "$NEW_AUTHORITY" ]; then
  # adhoc — every adhoc rebuild has a new CDHash, so TCC will treat it as a new
  # app anyway. Reset to avoid having ghost entries.
  SIGNATURE_DRIFTED=1
fi

if [ "$SIGNATURE_DRIFTED" = "1" ]; then
  echo "Signature changed (or adhoc). Clearing TCC entries for com.sarah.app..."
  echo "  was: ${LAST_AUTHORITY:-<none>}"
  echo "  now: ${NEW_AUTHORITY:-<adhoc>}"
  sudo tccutil reset Accessibility com.sarah.app 2>/dev/null || true
  sudo tccutil reset ListenEvent com.sarah.app 2>/dev/null || true
  sudo tccutil reset Microphone com.sarah.app 2>/dev/null || true
  echo "TCC entries cleared. Re-grant permissions once; future installs with the same identity will keep them."
else
  echo "Signature matches previous install ($NEW_AUTHORITY). Keeping TCC grants."
fi

# Persist the current authority so the next install can compare.
if [ -n "$NEW_AUTHORITY" ]; then
  echo "$NEW_AUTHORITY" > "$LAST_AUTH_FILE"
fi

# Remove the build output so macOS Launch Services / Dock can't surface a
# duplicate Sarah icon from `out/Sarah-darwin-arm64/Sarah.app` after install.
# Keeping two Sarah.app on disk with the same bundle id (com.sarah.app) makes
# the Dock show two "running" indicators when either is launched.
if [ -d "$PACKAGED_APP_PATH" ]; then
  echo "Removing build output to avoid duplicate Dock icon..."
  /usr/bin/lsregister -u "$PACKAGED_APP_PATH" 2>/dev/null \
    || /System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -u "$PACKAGED_APP_PATH" 2>/dev/null \
    || true
  rm -rf "$ROOT_DIR/out/Sarah-darwin-arm64"
fi

# Final guard: kill any process whose path is NOT $TARGET_APP_PATH but matches
# the Sarah pattern (e.g. an old `out/...` instance the user opened by hand).
STRAYS="$(pgrep -af "$APP_PROCESS_PATTERN" | grep -v -F "$TARGET_APP_PATH" | awk '{print $1}' || true)"
if [ -n "$STRAYS" ]; then
  echo "Killing stray Sarah processes from non-installed paths..."
  echo "$STRAYS" | xargs kill -9 2>/dev/null || true
fi

echo "Installed to $TARGET_APP_PATH"
open "$TARGET_APP_PATH"
