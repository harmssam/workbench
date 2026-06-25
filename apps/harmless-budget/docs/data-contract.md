# Harmless Budget v2 — Data Contract

**Status:** Schema freeze (pre-implementation)  
**Storage:** Local SQLite database (single `.db` file)  
**Scope:** All persistence semantics for the Tauri desktop app. Implementation must not deviate without updating this document.

---

## 1. Money

All monetary values are stored as **signed integer cents** (`INTEGER`). Floating-point types are forbidden for money columns.

| Column pattern | Type | Semantics |
|----------------|------|-----------|
| `*_cents` | `INTEGER NOT NULL` | Amount in smallest currency unit (e.g. USD cents). Sign indicates direction per entity rules. |

**Parsing (import & UI input):** Locale-aware string → cents integer.

1. Strip currency symbols and whitespace.
2. Detect decimal separator from locale (`.` or `,`).
3. Normalize to a canonical decimal string; parse to fixed-point with exactly two fractional digits.
4. Multiply by 100 and round half-away-from-zero to integer cents.
5. Reject ambiguous or unparseable input; never fall back to `float`.

**Display:** Format cents as locale currency strings in the UI only; the database always holds integers.

---

## 2. Categories

Single hierarchical table. No separate subcategories table.

```sql
categories (
  id            INTEGER PRIMARY KEY,
  parent_id     INTEGER REFERENCES categories(id),  -- NULL = root
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
  is_system     INTEGER NOT NULL DEFAULT 0,           -- 1 = seeded, non-deletable
  sort_order    INTEGER NOT NULL DEFAULT 0,
  archived_at   TEXT                                -- ISO-8601 date or NULL
)
```

- **Tree:** `parent_id` defines ancestry. A category's `type` must match its root ancestor's type.
- **`is_system`:** System categories are created at first run and cannot be deleted (may be archived if unused).
- **Budget targets:** Only **leaf** categories (no children) may have budget targets. Parent categories aggregate children for display only.

---

## 3. Accounts

```sql
accounts (
  id                INTEGER PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  include_in_budget INTEGER NOT NULL DEFAULT 1      -- 1 = included in budget totals
)
```

Accounts group transactions. `include_in_budget` excludes an account from budget actuals while still tracking its transactions.

---

## 4. Transactions

```sql
transactions (
  id               INTEGER PRIMARY KEY,
  account_id       INTEGER NOT NULL REFERENCES accounts(id),
  date             TEXT NOT NULL,                   -- ISO-8601 date (YYYY-MM-DD)
  amount_cents     INTEGER NOT NULL,
  memo             TEXT,
  payee            TEXT,
  type             TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
  category_id      INTEGER REFERENCES categories(id),
  import_hash      TEXT,                            -- dedup key; UNIQUE when NOT NULL
  import_batch_id  INTEGER REFERENCES import_batches(id),
  applied_rule_id  INTEGER REFERENCES rules(id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
)
```

| Field | Rules |
|-------|-------|
| `amount_cents` | Expense = negative; income = positive; transfer sign follows source leg convention. |
| `category_id` | Required for expense/income; NULL allowed for transfers and uncategorized rows. |
| `import_hash` | Stable hash of normalized import row (account + date + amount + payee + memo). |
| `applied_rule_id` | Set when a rule assigns `category_id`; NULL for manual categorization. |

**Index:** `UNIQUE(import_hash)` where `import_hash IS NOT NULL`.

---

## 5. Import & Deduplication

### Tiers

| Tier | Trigger | Behavior |
|------|---------|----------|
| **Hard skip** | `import_hash` matches existing transaction | Row is never inserted again. |
| **Re-import UX** | User imports a file/batch that partially overlaps prior imports | Prompt: **Skip duplicates** / **Import all** (ignore hash) / **Review conflicts** (side-by-side staging vs existing). |

### Staging

Raw parsed rows land in `import_staging` before commit:

```sql
import_staging (
  id              INTEGER PRIMARY KEY,
  import_batch_id INTEGER NOT NULL REFERENCES import_batches(id),
  row_index       INTEGER NOT NULL,
  raw_json        TEXT NOT NULL,        -- original parsed fields
  normalized_json TEXT NOT NULL,        -- canonical form used for hash
  import_hash     TEXT NOT NULL,
  conflict_status TEXT NOT NULL CHECK (conflict_status IN ('new','duplicate','conflict')),
  resolution      TEXT CHECK (resolution IN ('skip','import','pending'))
)
```

Commit moves `resolution = 'import'` rows into `transactions` and discards staging for that batch.

---

## 6. Budget

Calendar-month budgeting. Month key: `YYYY-MM` (user's local calendar).

```sql
budget_targets (
  id              INTEGER PRIMARY KEY,
  category_id     INTEGER NOT NULL REFERENCES categories(id),
  month           TEXT NOT NULL,        -- YYYY-MM
  target_cents    INTEGER NOT NULL,
  UNIQUE (category_id, month)
)
```

- **Targets:** Fixed per leaf category per month. Non-leaf categories have no row.
- **Actuals:** Sum of `transactions.amount_cents` for the month where `category_id` is that leaf (or descendant mapping is not used—actuals attach to the assigned leaf only).
- **Display:** `remaining_cents = target_cents - actual_cents` (computed, not stored).

---

## 7. Rules

Auto-categorization by memo matching.

```sql
rules (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  match_type   TEXT NOT NULL CHECK (match_type IN ('CONTAINS','EXACT')),
  match_value  TEXT NOT NULL,
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  priority     INTEGER NOT NULL DEFAULT 0,
  enabled      INTEGER NOT NULL DEFAULT 1
)
```

**Evaluation:**

1. Filter `enabled = 1`.
2. Sort by `priority ASC` (lower number = higher precedence).
3. First match wins; stop evaluation.
4. `CONTAINS`: case-insensitive substring on normalized memo.
5. `EXACT`: case-insensitive full-string equality on normalized memo.

**When rules run:**

- **On import:** After staging normalization, before user commit (preview shows proposed `category_id` and `applied_rule_id`).
- **Apply-to-uncategorized:** Batch job on transactions where `category_id IS NULL`, same evaluation order; sets `category_id` and `applied_rule_id`.

Manual category edits do not re-trigger rules unless the user explicitly runs apply-to-uncategorized.

---

## 8. Import Batches & App Meta

### Import batches

```sql
import_batches (
  id           INTEGER PRIMARY KEY,
  filename     TEXT,
  source       TEXT,                    -- e.g. 'csv', 'qfx'
  imported_at  TEXT NOT NULL,
  row_count    INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('staging','committed','cancelled'))
)
```

### App meta key registry

```sql
app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
)
```

| Key | Value | Purpose |
|-----|-------|---------|
| `schema_version` | integer string | Migration version; current freeze = `1` |
| `locale` | BCP-47 tag | Default locale for money parsing/display |
| `currency` | ISO-4217 code | e.g. `USD` |
| `first_run_at` | ISO-8601 datetime | Initial app open |
| `last_backup_at` | ISO-8601 datetime or empty | Last successful backup export |
| `last_import_at` | ISO-8601 datetime or empty | Last committed import |

New keys must be appended to this registry in this document before use.

---

## 9. Backup & Integrity

- **Export:** Full file copy of the SQLite `.db` to user-chosen path (no partial export in v1).
- **Restore:** Replace active `.db` with chosen backup; app restarts or reloads connection.
- **Startup check:** Run `PRAGMA quick_check;` before serving reads/writes. On failure, block normal operation and prompt restore from backup or reset.
- **No cloud sync:** All data remains on the local machine.

---

## Entity Relationship Summary

```
accounts ──< transactions >── categories (tree via parent_id)
                │
                ├── import_batches
                ├── rules
                └── import_staging (transient)

budget_targets ──> categories (leaf only)
app_meta (singleton keys)
```

**Invariants:**

1. Money is always integer cents.
2. `import_hash` uniqueness is the hard dedup gate.
3. Budget targets exist only on leaf categories.
4. Rules: priority ASC, first match wins.
5. Schema version `1` until this contract is revised.