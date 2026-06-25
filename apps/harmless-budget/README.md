# Harmless Budget

A local-only desktop budgeting app for macOS. Your transactions, categories, and budgets stay on your Mac in a single SQLite database — no accounts, no cloud sync, no network calls.

**Current release: v0.1.0**

## Features

### Dashboard

Month-at-a-glance summary with income, spending, and net cash flow. Sparklines and bar charts show recent trends; drill into any month to inspect underlying transactions.

### Transactions

Browse and filter by account, category, month, and text search. Switch between list and sortable grid views. Categorize inline, bulk-update selections, and apply rules to uncategorized rows. Create categorization rules directly from a transaction's payee.

### CSV import

Multi-step import wizard: pick a file, map columns, preview rows, then commit. Built-in presets for common Canadian banks (RBC, TD, Scotiabank, and others). Supports single-amount and separate debit/credit columns, encoding detection, duplicate detection via import hashes, and saved import profiles for repeat uploads.

### Budget

Set monthly spending targets on leaf categories. Progress bars compare targets to actuals for the selected month. Parent categories roll up child totals automatically.

### Analytics

Category breakdown pie chart, spending trends over time, and top payees. Filter by month and account. Click through to underlying transactions.

### Rules

Keyword rules auto-assign categories to matching payees or memos. Drag to reorder priority, preview matches before applying, and enable or disable individual rules.

### Accounts & categories

Manage bank accounts with optional exclusion from budget totals. Hierarchical categories for expenses, income, and transfers — including system-seeded defaults.

### Settings & backup

Export the database to a `.db` file, restore from backup (with a safety copy of the current database), and reveal the data folder in Finder.

## Privacy

- All data stored locally in SQLite
- No telemetry, analytics, or remote APIs
- CSV import reads files you choose via the system file picker only

## Data location

`~/Library/Application Support/com.harmless.budget/data.db`

## Requirements

- macOS 14+
- Apple Silicon (arm64)
- Node 22+, pnpm 9+, and Rust stable (build from source only)

## Install

Download the latest zip from [GitHub Releases](https://github.com/harmssam/workbench/releases), or build locally:

```bash
cd apps/harmless-budget
pnpm install
pnpm tauri build
cp -r "src-tauri/target/release/bundle/macos/Harmless Budget.app" /Applications/
open "/Applications/Harmless Budget.app"
```

On first launch, macOS may block the unsigned build. Right-click the app and choose **Open**.

## Development

```bash
cd apps/harmless-budget
pnpm install
pnpm tauri dev      # hot-reload UI + native shell
pnpm test           # import pipeline unit tests
```

## Stack

- **Tauri 2** — native desktop shell
- **React + TypeScript** — UI
- **SQLite** (rusqlite) — local persistence
- **Tailwind CSS** — styling
- **Recharts** — analytics charts

## Releases

Build artifacts are not committed to git. Published binaries are attached to [GitHub Releases](https://github.com/harmssam/workbench/releases).

### Build locally

```bash
pnpm install
pnpm test
pnpm tauri build
```

The `.app` bundle is written to `src-tauri/target/release/bundle/macos/Harmless Budget.app`.

### Publish via CI

```bash
chmod +x scripts/release.sh
./scripts/release.sh 0.1.0
```

This creates and pushes a `harmless-budget-v0.1.0` tag. GitHub Actions runs tests, builds the app, packages a zip, and publishes the release.

## Architecture

```
Tauri 2 shell (Rust)
├── SQLite (rusqlite)     → accounts, categories, transactions, rules, budget targets
├── Import pipeline       → CSV parse, bank presets, column mapping, dedup hashes
└── React UI (Vite)
    ├── Dashboard         → month summary, trends, category breakdown
    ├── Transactions      → filter, bulk edit, rule application
    ├── Import            → wizard + saved profiles
    ├── Budget            → monthly targets vs actuals
    ├── Analytics         → charts and top payees
    ├── Rules             → keyword auto-categorization
    ├── Accounts          → account management
    ├── Categories        → hierarchical category tree
    └── Settings          → backup export/restore
```

Money is stored as signed integer cents throughout — no floating-point in the database.

## Further reading

- [Data contract](docs/data-contract.md) — schema and persistence rules

## License

MIT — see [LICENSE](../../LICENSE).