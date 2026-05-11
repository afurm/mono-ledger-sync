# 0001 Product scope

Date: 2026-05-11

Status: Accepted

## Context

`mono-ledger-sync` exists for people who want to own their Monobank transaction history locally instead of sending banking tokens and financial data to a hosted finance app.

The main product experience should feel like a local personal finance app, not a developer-only command line tool. Users should be able to install it, run it locally, and land in a browser-based UI for setup, sync, review, reporting, and exports.

The Monobank personal API is enough for the first product slice: account discovery, statement pulls, currency rates, and personal webhook registration. Provider, corporate, and acquiring APIs have different authentication and trust requirements, so they should not shape the MVP.

## Decision

The MVP is a Vite-powered local web app for a user's own Monobank account. The installed command should start the local app server, open the browser UI, and keep all token and ledger data on the user's machine.

The CLI remains part of the package, but it is a launcher and automation surface, not the primary product surface. CLI commands should support setup, diagnostics, scripted sync, exports, and development workflows while sharing the same core services as the web UI.

MVP scope:

- Fixture-backed setup that works without a token or network access.
- Vite web UI that runs locally after install or during local development.
- App pages for onboarding, dashboard, transactions, categories, budgets, recurring payments, reports, exports, and settings.
- Personal Monobank account discovery.
- Cursor-based statement sync into a local ledger.
- SQLite-backed local storage.
- Transaction review, categories, budgets, reports, and basic ledger queries.
- CSV and JSON exports.
- Privacy checks for tokens, logs, fixtures, and package contents.

Deferred scope:

- Hosted token relay or hosted financial data storage.
- Provider, corporate, acquiring, or merchant APIs.
- Multi-user team workflows.
- Required cloud sync.
- Public plugin systems.
- Native desktop or mobile apps.

## Consequences

The package should optimize for end users first. Implementation should keep clean boundaries between the Vite web app, local app server, CLI launcher, sync, storage, adapters, and exports. The UI and CLI must call the same core services so behavior stays consistent across interactive and scripted workflows.
