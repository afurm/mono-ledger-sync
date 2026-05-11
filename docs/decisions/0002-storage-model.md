# 0002 Storage model

Date: 2026-05-11

Status: Accepted

## Context

The project needs durable local storage that can be inspected, backed up, migrated, and used offline. The ledger must preserve enough source data to make sync behavior reproducible while also exposing normalized tables for reports, categories, budgets, and exports.

## Decision

SQLite is the canonical MVP storage engine.

The storage layer will expose a `LedgerDb` boundary instead of letting CLI, adapter, or UI code write directly to SQLite. The database model will keep raw Monobank-shaped payloads separate from normalized ledger records.

The initial schema should include forward-only migrations and tables for profiles, accounts, jars, sync cursors, sync runs, raw statement items, ledger entries, webhook events, currency rates, categories, category rules, merchants, budgets, recurring items, and transaction splits as the product grows.

Tokens should not be stored in SQLite by default. They should live in OS secure storage when available, with explicit fallback behavior documented for environments where secure storage is unavailable.

## Consequences

SQLite keeps the MVP portable and local-first. Users can back up a single database file, inspect it with standard tools, and work offline. The tradeoff is that concurrent write behavior must stay simple and explicit, especially if a local UI and CLI can run at the same time.
