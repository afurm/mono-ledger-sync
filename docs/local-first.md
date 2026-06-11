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

## Local webhook exposure

The local webhook receiver starts as a loopback endpoint. Register it directly
only for local checks. For live Monobank personal webhook delivery during local
development, expose the local app through a temporary HTTPS tunnel and register
only the tunnel origin plus the exact high-entropy webhook path from
`/api/app/config`.

The local API binds to `127.0.0.1` by default. Non-loopback binds require a
passcode and should be temporary. Keep tunnels short-lived, avoid public
interface binds unless passcode protection is enabled, never place tokens in
webhook URLs, and remove the Monobank webhook URL or stop the tunnel when the
session ends. Received webhook payloads remain local hints until a statement
pull reconciles them into the ledger.

## Moving and restoring data

The local UI shows the active database path in the sidebar and exposes the same
path through `/api/app/config`. Create portable backups by copying the SQLite
database while the local app is stopped.

Stop the local app before replacing or restoring a database. Remove stale
SQLite WAL/SHM sidecar files next to the database before copying the selected
database into place.

## Removing local account data

Removing a local workspace must include credential cleanup. Delete the saved
Monobank token for the active profile from **Settings -> Monobank token** or
`DELETE /api/app/token` before removing the profile database, SQLite sidecar
files, backups, and generated exports. Token deletion is profile-scoped, so
removing one local profile must not clear credentials for another profile.

## Stronger local privacy

For stricter local privacy, place the data directory on an encrypted volume or encrypted folder before running the app:

- macOS: create an encrypted Disk Utility image and set `MONO_LEDGER_SYNC_DATA_DIR` to its mounted folder.
- Linux: use an encrypted home directory, LUKS volume, or Secret Service-backed encrypted storage.
- Windows: use BitLocker or another encrypted folder/volume and set `MONO_LEDGER_SYNC_DATA_DIR` to that path.

Backups and exports are ordinary local files. Store them in the same encrypted location if they contain sensitive transaction history.

## Personas

- Solo user
  - wants a quick local setup, token-first sync, and a simple dashboard for checking spending without any cloud dependency.
- Privacy-focused user
  - cares that tokens, balances, and raw ledger data never leave their machine and prefers encrypted storage for database and exports.
- Finance analyst / accountant user
  - needs reproducible exports and the ability to annotate categories and split entries before sharing reports or preparing tax documentation.
- Open-source contributor
  - wants fixture-first development and clear local-first boundaries so changes can be tested without a live token.

## First release success criteria

- User can add a token, fetch client information, and discover accounts.
- User can sync statements for selected accounts to a local SQLite ledger.
- Users can review transactions, assign notes/tags, and adjust split plans.
- Querying and exporting of local transactions to CSV/JSON works consistently across fresh and legacy states.
- The release validates structured redaction and fixture tests, with no real banking credentials or personal payloads committed.
