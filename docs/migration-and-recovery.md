# Migration and recovery

## Move a local profile

1. Stop every `mono-ledger-sync` process using the profile.
2. In **Settings -> Storage and local data**, create a backup.
3. Move the backup through a user-controlled encrypted channel.
4. Start the app on the destination machine with the intended data directory.
5. Restore the backup and enter the exact profile and database path shown by
   the confirmation dialog.
6. Save the Monobank token again. Tokens are stored in the source machine's OS
   credential store and are never included in SQLite backups.
7. Run sync and verify account counts and the latest statement date.

Set `MONO_LEDGER_SYNC_DATA_DIR` before startup when the database should live
outside the default application data directory. Never copy an open SQLite file;
use **Backup now** first.

## Restore a backup

Use **Settings -> Storage and local data -> Restore backup**. Restore overwrites
the active database and requires the exact profile and database path. Keep the
pre-restore backup until the restored profile passes SQLite integrity checks and
a normal sync.

## Recover a stuck sync

Restart the local process. Startup marks abandoned `running` rows as
`interrupted`. Open **Sync -> Runs** for the failed account/window and retry
after the displayed rate-limit time. Cursors advance only after completed
statement windows, so retrying does not duplicate normalized ledger rows.

## Rotate or recover a token

Create a new personal token at `https://api.monobank.ua/`, save it in Settings,
run sync, and revoke the old token only after the new one succeeds. If exposure
is suspected, remove the local token first, revoke it in Monobank, then save a
replacement. Tokens are not recoverable from the database, exports, backups,
logs, or diagnostics bundles.

## Recover a failed configuration import

Configuration import validates the JSON and shows category, rule, budget,
period, and tag counts before writing. Create a backup before import. If the
result is wrong, restore that backup; do not hand-edit SQLite tables.

## Reset local data

**Settings -> Storage and local data -> Delete local data** can remove ledger
data, the token, or both. The dialog states what remains and requires exact
profile/database confirmation. This action is irreversible unless a separate
backup exists.
