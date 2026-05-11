# 0001 Product scope

Date: 2026-05-11

Status: Accepted

## Context

`mono-ledger-sync` exists for people who want to own their Monobank transaction history locally instead of sending banking tokens and financial data to a hosted finance app.

The Monobank personal API is enough for the first product slice: account discovery, statement pulls, currency rates, and personal webhook registration. Provider, corporate, and acquiring APIs have different authentication and trust requirements, so they should not shape the MVP.

## Decision

The MVP is a CLI-first local personal finance ledger for a user's own Monobank account. The core services must be reusable so a local web UI can be added later without changing sync or storage behavior, but the first production target is not a required web app.

MVP scope:

- Fixture-backed setup that works without a token or network access.
- Personal Monobank account discovery.
- Cursor-based statement sync into a local ledger.
- SQLite-backed local storage.
- Transaction review, categories, and basic ledger queries.
- CSV and JSON exports.
- Privacy checks for tokens, logs, fixtures, and package contents.

Deferred scope:

- Hosted token relay or hosted financial data storage.
- Provider, corporate, acquiring, or merchant APIs.
- Multi-user team workflows.
- Required cloud sync.
- Public plugin systems.
- Full local web UI before the CLI and core services are stable.

## Consequences

The package should optimize for end users first, but implementation should keep clean boundaries between CLI, sync, storage, adapters, and exports. A future local UI should call the same core services as the CLI.
