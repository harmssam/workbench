#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Sysmon"
BUILD_DIR="$(cd "$ROOT" && swift build -c release --show-bin-path)"
APP_BUNDLE="$ROOT/dist/$APP_NAME.app"

cd "$ROOT"
swift build -c release

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

cp "$ROOT/Sources/Sysmon/Info.plist" "$APP_BUNDLE/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable $APP_NAME" "$APP_BUNDLE/Contents/Info.plist"
cp "$BUILD_DIR/$APP_NAME" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"
chmod +x "$APP_BUNDLE/Contents/MacOS/$APP_NAME"

echo "Built $APP_BUNDLE"