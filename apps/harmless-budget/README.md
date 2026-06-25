# Harmless Budget v2

Local-only desktop budgeting app. Your data stays on your Mac — no network, no cloud.

## Stack

- **Tauri 2** — native desktop shell
- **React + TypeScript** — UI
- **SQLite** — single local database
- **Tailwind CSS** — styling

## Quick start

```bash
cd apps/harmless-budget
pnpm install
pnpm tauri dev
```

## Data location

`~/Library/Application Support/com.harmless.budget/data.db`

## MVP features

- **Accounts** — create and manage bank accounts
- **CSV import** — map columns, preview, deduplicate, import
- **Transactions** — filter, inline categorization
- **Rules** — keyword auto-categorization
- **Budget** — monthly targets vs actuals
- **Dashboard** — month summary
- **Settings** — export/restore backup, open data folder

## Tests

```bash
pnpm test
```

## Build

```bash
pnpm tauri build
```

## Docs

- [Data contract](docs/data-contract.md) — schema freeze document