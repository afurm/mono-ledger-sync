# mono-ledger-sync

Local-first Monobank ledger sync toolkit.

`mono-ledger-sync` is an early TypeScript CLI/package for syncing personal Monobank data into a local ledger that the user owns. The project is intentionally local-first: tokens and financial data should stay on the user's machine, fixture-backed workflows should work without network access, and future live sync code should preserve raw payloads separately from normalized ledger entries.

## Status

This first public package is a minimal foundation release. It includes package metadata, a strict TypeScript build, a small CLI/API scaffold, docs, and CI. Live Monobank synchronization, SQLite storage, exports, and the local web UI are planned but not implemented in this release.

## Install

```sh
npm install -g mono-ledger-sync
```

## Usage

```sh
mono-ledger-sync init --source fixture
mono-ledger-sync version
```

The current `init` command prints the local sync plan that later commands will execute against.

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
- Personal API tokens should be stored in OS secure storage once live sync is implemented.
- Webhook events should be treated as hints and reconciled through statement pulls.
- Logs and errors must redact tokens and sensitive financial identifiers.

## Development

```sh
npm install
npm run typecheck
npm test
npm run format
```

## License

MIT
