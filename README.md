# mono-ledger-sync

[![npm version](https://img.shields.io/npm/v/mono-ledger-sync.svg)](https://www.npmjs.com/package/mono-ledger-sync)
[![CI](https://github.com/afurm/mono-ledger-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/afurm/mono-ledger-sync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Local-first TypeScript app for syncing Monobank transactions into a private personal finance ledger.

`mono-ledger-sync` is an early TypeScript app/package for building a local-first Monobank ledger workflow. The product direction is a local web app opened by the installed command, backed by a local API server and SQLite. The project is designed for people who want to own their financial data locally: tokens and transaction data should stay on the user's machine, fixture-backed workflows should work without network access, and future live sync code should preserve raw Monobank payloads separately from normalized ledger entries.

## Status

This package now includes a fixture-first local ledger loop: a Fastify local app, SQLite-backed storage, fixture sync, a typed Monobank HTTP adapter, ledger queries, webhook hint recording, CSV/JSON exports, and a compact browser UI. Fixture mode is the default so the app works without network access or banking credentials.

Live Monobank sync is available through the same adapter boundary when `MONOBANK_TOKEN` is present. The first production hardening pass should still focus on secure token storage, richer category rules, and packaged Vite UI assets.

## Goals

- Sync personal Monobank transactions into a durable local ledger.
- Keep banking tokens and personal finance data off hosted project servers.
- Support fixture-first development for tests, demos, and offline workflows.
- Provide a small TypeScript API, local server boundary, and CLI launcher that can grow into SQLite storage, exports, reports, and a Vite web UI.

## Install

```sh
npm install -g mono-ledger-sync
```

## Usage

```sh
mono-ledger-sync
mono-ledger-sync init --source fixture
mono-ledger-sync sync --source fixture
mono-ledger-sync sync run --source fixture --dry-run
mono-ledger-sync sync run --source fixture --account fixture-account-uah-main --from 1775001600 --to 1777593599 --slice 1000000
mono-ledger-sync export --format csv
mono-ledger-sync export --format jsonl --account fixture-account-uah-main
mono-ledger-sync export --preset accountant-handoff
mono-ledger-sync data path
mono-ledger-sync db backup
mono-ledger-sync db export
mono-ledger-sync db restore --from ~/.mono-ledger-sync/exports/default-2026-05-11T10-00-00Z.sqlite --yes
mono-ledger-sync db inspect
mono-ledger-sync db compact
mono-ledger-sync data delete --yes
mono-ledger-sync auth status --source fixture
mono-ledger-sync auth test --source fixture
mono-ledger-sync doctor
mono-ledger-sync serve --source fixture
mono-ledger-sync version
```

Running `mono-ledger-sync` without a command starts the local browser app. `sync run` writes Monobank-shaped data into the local SQLite ledger, `export` prints CSV, JSON, JSONL, or journal-style CSV from the active local database, `data path` shows where local files live, `db backup` creates a timestamped SQLite backup, `db export` creates a portable SQLite copy without secrets, `db restore --from <path> --yes` restores a local database copy, `db inspect` checks migrations and SQLite integrity, `db compact` runs SQLite vacuum, `data delete --yes` removes the local profile database files, `auth status` and `auth test` validate the selected source without revealing tokens, and `doctor` checks the local setup without printing secrets.

Export presets are available for `accountant-handoff`, `monthly-personal-finance`, `bookkeeping`, `budget-analysis`, and `raw-transaction-archive`. Export file contents are deterministic for the same database state and filters so users can diff or version their own local data.

For live personal Monobank sync, keep the token in the environment for the current shell session:

```sh
MONOBANK_TOKEN=... mono-ledger-sync sync --source monobank
```

## Library API

```ts
import { createSyncPlan } from "mono-ledger-sync";

const plan = createSyncPlan({
  profile: "default",
  source: "fixture",
});
```

## Privacy model

- No hosted token relay.
- No default cloud storage.
- No cloud account is required for fixture-backed setup, local browsing, local backups, or local exports.
- Personal API tokens should be stored in OS secure storage once live sync is implemented.
- Use personal Monobank API tokens only for your own data on your own machine; do not use this project as a hosted or shared service for other people's banking data.
- Webhook events should be treated as hints and reconciled through statement pulls.
- Logs and errors must redact tokens and sensitive financial identifiers.

## Disclaimer

This project is a local data ownership tool, not financial, tax, accounting, or legal advice. Verify exported data before making financial decisions or sending records to an accountant.

## Development

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run coverage
npm run format
```

`npm run dev` starts the local Fastify app server against sanitized fixture data
on `http://127.0.0.1:3000`. The app exposes the browser UI at `/`, health and
configuration endpoints, fixture endpoints, ledger summary/account/transaction
endpoints, sync run endpoints, webhook hint ingestion, and CSV/JSON/JSONL exports.
Use `npm run dev -- --port 3001` if port 3000 is already in use.

Release automation is documented in [docs/release.md](docs/release.md).
Common local workflows are documented in
[examples/sample-workflows](examples/sample-workflows).

## License

MIT
