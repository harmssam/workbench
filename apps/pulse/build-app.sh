#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Pulse"
BUILD_DIR="$(cd "$ROOT" && swift build -c release --show-bin-path)"
APP_BUNDLE="$ROOT/dist/$APP_NAME.app"
ICON_ICNS="$ROOT/build/AppIcon.icns"

cd "$ROOT"

# Stale module caches break after moving the repo (e.g. scripts → workbench).
if [[ -d .build ]] && grep -q "_github_repos/scripts/" .build/release.yaml .build/debug.yaml 2>/dev/null; then
    echo "Removing stale .build cache from old repo path..."
    rm -rf .build
fi

swift build -c release
"$ROOT/scripts/generate-app-icon.sh"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

cp "$ROOT/Sources/Pulse/Info.plist" "$APP_BUNDLE/Contents/Info.plist"
cp "$ICON_ICNS" "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable $APP_NAME" "$APP_BUNDLE/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string AppIcon" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Set :CFBundleIconFile AppIcon" "$APP_BUNDLE/Contents/Info.plist"
cp "$BUILD_DIR/$APP_NAME" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"
chmod +x "$APP_BUNDLE/Contents/MacOS/$APP_NAME"

codesign --force --deep --sign - "$APP_BUNDLE" >/dev/null 2>&1 || true

echo "Built $APP_BUNDLE"