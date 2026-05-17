# Domain model

`src/domain/index.ts` is the shared domain contract for the local ledger. It is
kept independent from UI components, Fastify route handlers, process-level
configuration, and direct filesystem behavior.

## Profiles and sources

- `Profile` identifies a local workspace.
- `LedgerSource` identifies the adapter family: `fixture` or `monobank`.

## Monobank source shapes

- `MonobankAccount` represents a personal API account with currency, balance,
  credit limit, type, and optional masked identifiers.
- `MonobankJar` represents a Monobank jar with currency, balance, and goal.
- `MonobankStatementItem` represents a statement row before it is normalized
  into the local ledger.
- `MonobankRawEvent` represents stored raw source or webhook material used for
  replay, diagnostics, and reconciliation.

## Ledger state

- `LedgerAccount` is the normalized local account shape used by storage,
  queries, and the web UI.
- `LedgerEntry` is the normalized local transaction shape, including category,
  merchant, hold status, local notes, tags, split plans, and source reference.
- `SyncCursor` records the last successful statement window per profile,
  account, and source.
- `SyncRun` records lifecycle and summary counters for a sync attempt.

## Finance workflow types

- `Category` defines local category metadata used by sync, rules, filters, and
  exports.
- `CategoryRule` defines the stored rule metadata used to explain and later edit
  category assignment behavior.
- `Budget` defines the planned category-period budget contract before richer
  budget storage and UI are enabled.
- `RecurringItem` defines the recurring transaction detection contract before
  recurring calendars and alerts are enabled.

## Error and activity contracts

- `DomainError` carries a stable error code and category for auth, rate limit,
  validation, network, storage, migration, config, privacy, and internal
  failures. `domainErrorCodeCategories` is the canonical code-to-category map.
- `LocalActivityEvent` is the local event stream contract for sync lifecycle,
  ledger writes, webhook delivery, exports, report refreshes, rule application,
  warnings, and errors.
