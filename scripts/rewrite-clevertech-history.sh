#!/usr/bin/env bash
# Rewrites git history to remove all Clevertech references from README.md.
# Usage: ./scripts/rewrite-clevertech-history.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPLACEMENTS="$(mktemp)"
cat > "$REPLACEMENTS" <<'EOF'
literal:Small scripts and applications — separate from [Clevertech](https://github.com/harmssam/Clevertech_v1).==>A collection of macOS applications and utility scripts.
literal:Personal apps and scripts — separate from [Clevertech](https://github.com/harmssam/Clevertech_v1).==>A collection of macOS applications and utility scripts.
regex:[Cc]lever[Tt]ech==>
regex:clevertech_v1==>
EOF

echo "Searching history for Clevertech..."
git log -S "Clevertech" --oneline --all || true

if command -v git-filter-repo >/dev/null 2>&1; then
    echo "Rewriting with git-filter-repo..."
    git filter-repo --force --replace-text "$REPLACEMENTS"
    git remote add origin https://github.com/harmssam/workbench.git 2>/dev/null || \
        git remote set-url origin https://github.com/harmssam/workbench.git
else
    echo "git-filter-repo not found; using filter-branch..."
    git filter-branch --force --tree-filter \
        'if [[ -f README.md ]]; then
            perl -pi -e "s/Small scripts and applications — separate from \[Clevertech\]\(https:\/\/github\.com\/harmssam\/Clevertech_v1\)\./A collection of macOS applications and utility scripts./g" README.md
            perl -pi -e "s/Personal apps and scripts — separate from \[Clevertech\]\(https:\/\/github\.com\/harmssam\/Clevertech_v1\)\./A collection of macOS applications and utility scripts./g" README.md
            perl -pi -e "s/[Cc]lever[Tt]ech//g" README.md
        fi' \
        --tag-name-filter cat -- --all
    rm -rf .git/refs/original/
fi

rm -f "$REPLACEMENTS"

echo "Verifying history is clean..."
if git grep -i "clevertech" "$(git rev-list --all)" >/dev/null 2>&1; then
    echo "ERROR: Clevertech still found in history." >&2
    exit 1
fi

echo "History clean. Stage current files and push with:"
echo "  git add -A && git commit -m 'Polish READMEs and remove Clevertech references'"
echo "  git push --force origin main"