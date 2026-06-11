# mono-ledger-sync

[![npm version](https://img.shields.io/npm/v/mono-ledger-sync.svg)](https://www.npmjs.com/package/mono-ledger-sync)
[![CI](https://github.com/afurm/mono-ledger-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/afurm/mono-ledger-sync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Local-first TypeScript app for syncing Monobank transactions into a private personal finance ledger.

`mono-ledger-sync` is an early TypeScript app/package for building a local-first Monobank ledger workflow. The product direction is a local web app backed by a local API server and SQLite. The project is designed for people who want to own their financial data locally: tokens and transaction data should stay on the user's machine, fixture-backed workflows should work without network access, and future live sync code should preserve raw Monobank payloads separately from normalized ledger entries.

## Status

This package ships a local-first Monobank personal finance workspace: a Fastify local app, SQLite-backed storage, a typed Monobank HTTP adapter, ledger queries, webhook hint recording, CSV/JSON exports, and a compact browser UI. The product talks to the real Monobank personal API at `https://api.monobank.ua` for a real user session. Sanitized JSON fixtures exist only to drive offline development, tests, and contributor onboarding; they are never used to render data for a real user.

## Live by default

For a real user, every account, jar, statement, currency rate, and webhook comes from that user's own Monobank account via the personal API. The first-run flow leads with **Sign in with Monobank**: open `https://api.monobank.ua/` to create a personal API token, paste it into the local app, and the local Fastify server validates the token with a live `GET /personal/client-info` before saving it. The product never sends the token to any server controlled by this project.

The Monobank personal API is for the user's own data on their own machine. Do not use this project as a hosted, team, or business service for other people's banking data.

`MONOBANK_TOKEN` is a CI-only escape hatch. It exists so the opt-in live smoke test (`npm run test:live-monobank`, gated by `MONO_LEDGER_SYNC_LIVE_MONOBANK_TESTS=1`) can call the real bank without going through the in-app paste-token flow. It is not part of the user-facing product flow and should not be set in a normal local dev shell.

## Release notes

- [v0.2.0 — Live by default](docs/release/0.2.0.md): first-run greeting leads with Sign in with Monobank, every route shows a sign-in prompt instead of fixture demo data when no token is saved, Re-check Monobank connection button, live bank/currency smoke test, and a new privacy test suite.
- v0.1.1: GitHub Release `v0.1.1`; `mono-ledger-sync@0.1.1` on npm. Public discoverability metadata follow-up.
- v0.1.0: Initial public package release. `mono-ledger-sync@0.1.0`; initial commit `5b1b6c2`.

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

The in-app sign-in flow is the supported way to start syncing a real Monobank account: open `http://127.0.0.1:3000`, paste a personal API token from `https://api.monobank.ua/`, and the local server validates it before saving. `MONOBANK_TOKEN` is for the opt-in live smoke test only — see **Live by default** above.

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
- Secure token persistence should follow
  [`docs/decisions/0008-secure-token-storage.md`](docs/decisions/0008-secure-token-storage.md):
  use OS credential stores for packaged builds, keep SQLite out of token
  storage, and fall back to session-only handling when no secure provider is
  available.

## Webhook endpoint safety

The local server exposes webhook settings in `/api/app/config.webhook`:

- `webhook.host`: usually `127.0.0.1`
- `webhook.port`: local API port
- `webhook.path`: one high-entropy per-instance path (for example `/api/webhooks/monobank-ab12...`)
- `webhook.url`: full URL to register in Monobank personal webhook settings

The default `webhook.url` is a loopback URL for the local app. It is useful for
local health checks, but Monobank cannot deliver webhooks to `127.0.0.1` from
outside your machine.

If you need live personal webhook delivery while developing locally:

1. Start the local app with the intended port, then read the current
   `webhook.path` from the UI or `/api/app/config`.
2. Expose only that local port through a temporary HTTPS tunnel controlled by
   you.
3. Register the tunnel origin plus the exact high-entropy `webhook.path` in
   Monobank personal webhook settings.
4. Keep the tunnel open only while you are actively using it, then remove the
   webhook URL from Monobank or stop the tunnel.

Do not bind the local API to a public interface, reuse stale tunnel URLs, share
the tunnel URL publicly, or put tokens in webhook URLs. The route path is an
unguessable local receiver path, not an authentication system.

Webhook payloads are recorded as local hints and are reconciled through
statement pulls before they affect the final ledger state.

## Disclaimer

This project is a local data ownership tool, not financial, tax, accounting, or legal advice. Verify exported data before making financial decisions or sending records to an accountant.

## Development

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run test:live-monobank
npm run coverage
npm run format
```

`npm run dev` starts the local Fastify app server on `http://127.0.0.1:3000`.
The app exposes the browser UI at `/`, health and configuration endpoints,
ledger summary/account/transaction endpoints, sync run endpoints, webhook
hint ingestion, and CSV/JSON/JSONL exports. The default product path is
live — the local server talks to `https://api.monobank.ua` once a personal
API token is saved in the in-app sign-in flow. Sanitized fixture endpoints
remain available for development; pass `MONO_LEDGER_SYNC_SOURCE=fixture npm
run dev` to skip live calls.
Use `MONO_LEDGER_SYNC_PORT=3001 npm run dev` if port 3000 is already in use.
Use `npm run web:dev` when working on the Vite UI; it starts the same local API
server and proxies browser requests through `http://127.0.0.1:5173`.

`npm run test:live-monobank` is an opt-in smoke test for the real Monobank
adapter. It skips unless `MONO_LEDGER_SYNC_LIVE_MONOBANK_TESTS=1` and
`MONOBANK_TOKEN` are set, so default local and pull-request validation never
calls the live API. This is the only supported use of `MONOBANK_TOKEN`.

The local API token endpoint stores saved Monobank tokens through the default
token store. Linux uses Secret Service when available. macOS and Windows keep
session-only handling until a packaged desktop host can bridge Keychain Services
and Credential Manager without passing secrets through shell arguments.
Unsupported or unavailable secure stores fall back to the running session
instead of writing plaintext credentials to SQLite or config files.

### Rotating a Monobank token

Rotate the personal API token from the local settings screen or the local API;
do not edit SQLite, generated exports, or config files to change credentials.

1. Create a replacement personal token in Monobank.
2. Open **Settings -> Monobank token**, paste the replacement token, confirm the
   local-only handling checkbox, and save it for the active local profile. The
   same flow is available through `POST /api/app/token` with the active
   `profile` and replacement `token`.
3. Confirm the token status in settings. Persistent secure storage means the
   token survived through the OS credential store; session-only storage means it
   is available only until the local server process stops.
4. Run a Monobank sync after saving the replacement token.
5. Revoke the old token in Monobank after the replacement token works.

If a token may have been exposed, remove it from **Settings -> Monobank token**
with the explicit deletion checkbox, revoke it in Monobank, and restart the
local server if the UI reported session-only token handling.

Release automation is documented in [docs/release.md](docs/release.md).
Domain contracts are documented in [docs/domain-model.md](docs/domain-model.md).
Common local workflows are documented in
[examples/sample-workflows](examples/sample-workflows).
Start with the
[minimum local product flow](examples/sample-workflows/minimum-product-flow.md)
for the install, token, sync, review, categorization, and export path.

## License

MIT
