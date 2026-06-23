#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGO_DIR="$ROOT/logo"
ICONSET="$ROOT/build/AppIcon.iconset"
OUTPUT="$ROOT/build/AppIcon.icns"
SOURCE_PNG="$ROOT/build/icon-source.png"

rm -rf "$ICONSET"
mkdir -p "$ROOT/build" "$ICONSET"

render_source_png() {
    if command -v rsvg-convert >/dev/null 2>&1; then
        rsvg-convert -w 1024 -h 1024 "$LOGO_DIR/logo.svg" -o "$SOURCE_PNG"
        return
    fi

    if command -v magick >/dev/null 2>&1; then
        magick -background none "$LOGO_DIR/logo.svg" -resize 1024x1024 "$SOURCE_PNG"
        return
    fi

    if [[ -f "$LOGO_DIR/logo.png" ]]; then
        cp "$LOGO_DIR/logo.png" "$SOURCE_PNG"
        sips -z 1024 1024 "$SOURCE_PNG" >/dev/null
        return
    fi

    echo "Need logo.png or install rsvg-convert (brew install librsvg)" >&2
    exit 1
}

make_icon() {
    local size="$1"
    local name="$2"
    sips -z "$size" "$size" "$SOURCE_PNG" --out "$ICONSET/$name" >/dev/null
}

render_source_png

make_icon 16 icon_16x16.png
make_icon 32 icon_16x16@2x.png
make_icon 32 icon_32x32.png
make_icon 64 icon_32x32@2x.png
make_icon 128 icon_128x128.png
make_icon 256 icon_128x128@2x.png
make_icon 256 icon_256x256.png
make_icon 512 icon_256x256@2x.png
make_icon 512 icon_512x512.png
make_icon 1024 icon_512x512@2x.png

iconutil -c icns "$ICONSET" -o "$OUTPUT"
echo "Generated $OUTPUT"