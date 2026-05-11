# Local-First Model

`mono-ledger-sync` is designed around local ownership of financial data.

## Principles

- The local machine is the source of truth for synced ledger data.
- Tokens should never be stored on a service controlled by this project.
- Fixture-backed development must work without live banking credentials.
- No cloud account is required to run fixture mode, inspect local data, create backups, or export the ledger.
- Exports should be portable and easy to inspect.
- Deletion should remove local credentials, local databases, and generated exports.

## Sync direction

The planned sync flow is pull-first. Webhook events can improve freshness, but final ledger state should be reconciled through statement pulls so retries, duplicate events, and missing signatures do not corrupt the ledger.

## Moving and restoring data

Use `mono-ledger-sync data path --profile <name>` to find the active database path. A portable copy can be created with `mono-ledger-sync db export --profile <name>`, and restored with `mono-ledger-sync db restore --from <copy.sqlite> --profile <name> --yes`.

Stop the local app before replacing or restoring a database. The restore command removes stale SQLite WAL/SHM sidecar files before copying the selected database into place.

## Stronger local privacy

For stricter local privacy, place the data directory on an encrypted volume or encrypted folder before running the app:

- macOS: create an encrypted Disk Utility image and pass its mounted folder with `--data-dir`.
- Linux: use an encrypted home directory, LUKS volume, or Secret Service-backed encrypted storage.
- Windows: use BitLocker or another encrypted folder/volume and pass that path with `--data-dir`.

Backups and exports are ordinary local files. Store them in the same encrypted location if they contain sensitive transaction history.
