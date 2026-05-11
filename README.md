# mono-ledger-sync

[![npm version](https://img.shields.io/npm/v/mono-ledger-sync.svg)](https://www.npmjs.com/package/mono-ledger-sync)
[![CI](https://github.com/afurm/mono-ledger-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/afurm/mono-ledger-sync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Local-first TypeScript CLI for syncing Monobank transactions into a private personal finance ledger.

`mono-ledger-sync` is an early TypeScript CLI/package for building a local-first Monobank ledger workflow. The project is designed for people who want to own their financial data locally: tokens and transaction data should stay on the user's machine, fixture-backed workflows should work without network access, and future live sync code should preserve raw Monobank payloads separately from normalized ledger entries.

## Status

This first public package is a minimal foundation release. It includes package metadata, a strict TypeScript build, a small CLI/API scaffold, docs, and CI. Live Monobank synchronization, SQLite storage, exports, and the local web UI are planned but not implemented in this release.

## Goals

- Sync personal Monobank transactions into a durable local ledger.
- Keep banking tokens and personal finance data off hosted project servers.
- Support fixture-first development for tests, demos, and offline workflows.
- Provide a small TypeScript API and CLI that can grow into SQLite storage, exports, and reports.

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
