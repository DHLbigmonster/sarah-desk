#!/bin/bash
# Create macOS app icon from tray-icon.png

ICON_SOURCE="./assets/tray-icon.png"
ICON_SET="./assets/icon.iconset"

# Create iconset directory
mkdir -p "$ICON_SET"

# Generate different sizes
sips -z 16 16     "$ICON_SOURCE" --out "$ICON_SET/icon_16x16.png"
sips -z 32 32     "$ICON_SOURCE" --out "$ICON_SET/icon_16x16@2x.png"
sips -z 32 32     "$ICON_SOURCE" --out "$ICON_SET/icon_32x32.png"
sips -z 64 64     "$ICON_SOURCE" --out "$ICON_SET/icon_32x32@2x.png"
sips -z 128 128   "$ICON_SOURCE" --out "$ICON_SET/icon_128x128.png"
sips -z 256 256   "$ICON_SOURCE" --out "$ICON_SET/icon_128x128@2x.png"
sips -z 256 256   "$ICON_SOURCE" --out "$ICON_SET/icon_256x256.png"
sips -z 512 512   "$ICON_SOURCE" --out "$ICON_SET/icon_256x256@2x.png"
sips -z 512 512   "$ICON_SOURCE" --out "$ICON_SET/icon_512x512.png"
sips -z 1024 1024 "$ICON_SOURCE" --out "$ICON_SET/icon_512x512@2x.png"

# Convert to icns
iconutil -c icns "$ICON_SET" -o "./assets/icon.icns"

# Clean up
rm -rf "$ICON_SET"

echo "Icon created: ./assets/icon.icns"
