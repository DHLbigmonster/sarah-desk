#!/bin/bash
set -e

REPO="DHLbigmonster/sarah-desk"
APP_NAME="Sarah"
INSTALL_DIR="/Applications"

echo "Installing Sarah..."

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  ASSET_PATTERN="arm64"
elif [ "$ARCH" = "x86_64" ]; then
  ASSET_PATTERN="x64"
else
  echo "Unsupported architecture: $ARCH"
  exit 1
fi

# Get latest release ZIP URL from GitHub
echo "Fetching latest release..."
LATEST_URL=$(curl -sL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -o "https://github.com/$REPO/releases/download/[^\"]*${ASSET_PATTERN}.*\.zip" \
  | head -1)

if [ -z "$LATEST_URL" ]; then
  echo "Could not find a release for $ASSET_PATTERN architecture."
  echo "Make sure a release exists at https://github.com/$REPO/releases"
  exit 1
fi

echo "Downloading: $LATEST_URL"
TMPDIR=$(mktemp -d)
curl -sL "$LATEST_URL" -o "$TMPDIR/sarah.zip"

# Extract
echo "Extracting..."
unzip -qo "$TMPDIR/sarah.zip" -d "$TMPDIR"

# Find the .app bundle
APP_PATH=$(find "$TMPDIR" -name "${APP_NAME}.app" -maxdepth 2 | head -1)
if [ -z "$APP_PATH" ]; then
  echo "Could not find ${APP_NAME}.app in the downloaded archive."
  exit 1
fi

# Move to Applications
echo "Installing to $INSTALL_DIR..."
rm -rf "$INSTALL_DIR/${APP_NAME}.app"
cp -R "$APP_PATH" "$INSTALL_DIR/"

# Clean up
rm -rf "$TMPDIR"

echo ""
echo "Done! Sarah is installed at $INSTALL_DIR/${APP_NAME}.app"
echo ""
echo "First launch: right-click the app and select 'Open' to bypass Gatekeeper."
echo "Then grant Microphone, Input Monitoring, and Accessibility permissions when prompted."
echo ""
echo "Launching Sarah..."
open "$INSTALL_DIR/${APP_NAME}.app"
