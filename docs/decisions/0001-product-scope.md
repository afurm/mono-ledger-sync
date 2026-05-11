# 0001 Product scope

Date: 2026-05-11

Status: Accepted

## Context

`mono-ledger-sync` exists for people who want to own their Monobank transaction history locally instead of sending banking tokens and financial data to a hosted finance app.

The main product experience should feel like a local personal finance app, not a developer utility. Users should be able to run it locally and land in a browser-based UI for setup, sync, review, reporting, and exports.

The product is not an MCP server, agent tool, or integration layer. It should be built and evaluated as a real end-user finance product with a local app experience.

The Monobank personal API is enough for the first production release: account discovery, statement pulls, currency rates, and personal webhook registration. Provider, corporate, and acquiring APIs have different authentication and trust requirements, so they should not shape the initial product scope.

## Decision

The product is a Vite-powered local web app for a user's own Monobank account. The local app server should power the browser UI and keep all token and ledger data on the user's machine.

Initial production scope:

- Fixture-backed setup that works without a token or network access.
- Vite web UI that runs locally after install or during local development.
- Fastify local API server that powers the UI without becoming a public API product.
- shadcn/ui component system with the white, ink, slate, and Monobank-green app theme defined in [0006 UI system and theme](0006-ui-system-and-theme.md).
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
- MCP server, agent-tool, or ChatGPT app surfaces.
- Native desktop or mobile apps.

## Consequences

The package should optimize for end users first. Implementation should keep clean boundaries between the Vite web app, local app server, sync, storage, adapters, and exports. Browser UI behavior should stay consistent with the same core services used by tests and local API routes.
