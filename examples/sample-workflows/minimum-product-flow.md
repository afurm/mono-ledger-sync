# Minimum local product flow

This is the smallest useful end-to-end workflow for a local personal finance
workspace.

## 1. Install and start the local app

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:3000`. The app starts in fixture mode by default, so the
first run works without network access or banking credentials.

## 2. Add a Monobank token when live sync is needed

Open Settings, switch the data source to `Monobank API`, and paste a personal
Monobank API token for the current local server session.

For shell-driven testing, the same live adapter can be started with:

```sh
MONOBANK_TOKEN=... MONO_LEDGER_SYNC_SOURCE=monobank npm run dev
```

Fixture mode remains available for demos, screenshots, and offline development.

## 3. Sync accounts and statements

Use `Run Sync` from the browser UI. The sync flow should discover accounts, pull
statement windows, store raw payloads separately from normalized ledger entries,
and record sync run status locally.

## 4. Review transactions

Open Transactions to search, filter by account/category/status/amount/date, sort
rows, inspect transaction details, and add local notes, tags, or split plans.

## 5. Categorize spending

Open Rules & Mappings to inspect the current categorization rules, preview rule
matches against local history, and identify conflicts before manual rule writes
are enabled.

## 6. Export local data

Open Exports and choose a local preset such as `monthly-personal-finance`,
`accountant-handoff`, `budget-analysis`, or `raw-transaction-archive`.

Exports are deterministic for the same database state and filters. They should
not contain tokens or secret headers.

## Done state

The local product flow is useful when a user can:

- start the app locally without a cloud account;
- add or remove a token for their own profile;
- sync fixture or live Monobank data into SQLite;
- review and categorize transactions from the browser UI;
- export CSV, JSON, JSONL, or SQLite snapshots from local data;
- see where the local database is stored and keep backups under their control.
