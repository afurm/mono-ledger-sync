# mono-ledger-sync

[![npm version](https://img.shields.io/npm/v/mono-ledger-sync.svg)](https://www.npmjs.com/package/mono-ledger-sync)
[![CI](https://github.com/afurm/mono-ledger-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/afurm/mono-ledger-sync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Local-first TypeScript app for syncing Monobank transactions into a private personal finance ledger.

`mono-ledger-sync` is an early TypeScript app/package for building a local-first Monobank ledger workflow. The product direction is a local web app backed by a local API server and SQLite. The project is designed for people who want to own their financial data locally: tokens and transaction data should stay on the user's machine, fixture-backed workflows should work without network access, and future live sync code should preserve raw Monobank payloads separately from normalized ledger entries.

## Status

This package now includes a fixture-first local ledger loop: a Fastify local app, SQLite-backed storage, fixture sync, a typed Monobank HTTP adapter, ledger queries, webhook hint recording, CSV/JSON exports, and a compact browser UI. Fixture mode is the default so the app works without network access or banking credentials.

Live Monobank sync is available through the same adapter boundary when `MONOBANK_TOKEN` is present. The first production hardening pass should still focus on secure token storage, richer category rules, and packaged Vite UI assets.

## Goals

- Sync personal Monobank transactions into a durable local ledger.
- Keep banking tokens and personal finance data off hosted project servers.
- Support fixture-first development for tests, demos, and offline workflows.
- Provide a small TypeScript API, local server boundary, and browser UI that can grow into SQLite storage, exports, reports, and a Vite web app.

## Install

```sh
npm install mono-ledger-sync
```

## Local UI

```sh
npm run dev
```

`npm run dev` builds the package and starts the local Fastify server at
`http://127.0.0.1:3000`. Fixture mode is the default, so the browser UI works
without network access or banking credentials.

Export presets are available through the local API and browser UI for
`accountant-handoff`, `monthly-personal-finance`, `bookkeeping`,
`budget-analysis`, and `raw-transaction-archive`. Export file contents are
deterministic for the same database state and filters so users can diff or
version their own local data.

For live personal Monobank sync, keep the token in the environment for the current shell session:

```sh
MONOBANK_TOKEN=... MONO_LEDGER_SYNC_SOURCE=monobank npm run dev
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

## Webhook endpoint safety

The local server exposes webhook settings in `/api/app/config.webhook`:

- `webhook.host`: usually `127.0.0.1`
- `webhook.port`: local API port
- `webhook.path`: one high-entropy per-instance path (for example `/api/webhooks/monobank-ab12...`)
- `webhook.url`: full URL to register in Monobank personal webhook settings

Webhook registration should always use the returned `webhook.url` and remain local-only.
Webhook payloads are recorded as local hints and are reconciled through statement pulls before
they affect the final ledger state.

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
Use `MONO_LEDGER_SYNC_PORT=3001 npm run dev` if port 3000 is already in use.
Use `npm run web:dev` when working on the Vite UI; it starts the same local API
server and proxies browser requests through `http://127.0.0.1:5173`.

Release automation is documented in [docs/release.md](docs/release.md).
Domain contracts are documented in [docs/domain-model.md](docs/domain-model.md).
Common local workflows are documented in
[examples/sample-workflows](examples/sample-workflows).
Start with the
[minimum local product flow](examples/sample-workflows/minimum-product-flow.md)
for the install, token, sync, review, categorization, and export path.

## License

MIT
