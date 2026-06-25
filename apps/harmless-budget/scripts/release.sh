#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
    echo "Usage: ./scripts/release.sh <version>" >&2
    echo "Example: ./scripts/release.sh 0.1.0" >&2
    exit 1
fi

TAG="harmless-budget-v${VERSION}"

cd "$ROOT"

echo "Running tests..."
pnpm test

echo "Building app..."
pnpm tauri build

echo "Packaging zip..."
mkdir -p release
ditto -c -k --sequesterRsrc --keepParent \
    "src-tauri/target/release/bundle/macos/Harmless Budget.app" \
    "release/Harmless-Budget-${VERSION}-macos-arm64.zip"

echo "Creating tag ${TAG}..."
git tag "$TAG"

echo "Pushing tag to origin..."
git push origin "$TAG"

echo "Done. GitHub Actions will publish:"
echo "  https://github.com/harmssam/workbench/releases/tag/${TAG}"