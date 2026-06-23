#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
    echo "Usage: ./scripts/release.sh <version>" >&2
    echo "Example: ./scripts/release.sh 0.1.1" >&2
    exit 1
fi

TAG="pulse-v${VERSION}"

cd "$ROOT"

echo "Running tests..."
swift test

echo "Building app..."
chmod +x build-app.sh scripts/generate-app-icon.sh
./build-app.sh

echo "Creating tag ${TAG}..."
git tag "$TAG"

echo "Pushing tag to origin..."
git push origin "$TAG"

echo "Done. GitHub Actions will publish:"
echo "  https://github.com/harmssam/workbench/releases/tag/${TAG}"