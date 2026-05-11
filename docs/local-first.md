# Local-First Model

`mono-ledger-sync` is designed around local ownership of financial data.

## Principles

- The local machine is the source of truth for synced ledger data.
- Tokens should never be stored on a service controlled by this project.
- Fixture-backed development must work without live banking credentials.
- Exports should be portable and easy to inspect.
- Deletion should remove local credentials, local databases, and generated exports.

## Sync direction

The planned sync flow is pull-first. Webhook events can improve freshness, but final ledger state should be reconciled through statement pulls so retries, duplicate events, and missing signatures do not corrupt the ledger.
