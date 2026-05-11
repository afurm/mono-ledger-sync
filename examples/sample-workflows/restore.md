# Restore

Restore is intentionally manual until the confirmation flow is implemented.
The current safe process is:

1. Open the local UI and note the active database path shown in the sidebar.
2. Stop the local app.
3. Copy the current SQLite database to a timestamped backup location.
4. Replace the active database file with the backup copy you want to restore.
5. Remove stale `-wal` and `-shm` sidecar files next to the active database.
6. Start the local UI and confirm the ledger summary loads.

To remove the restored profile database and start over, stop the local app and
delete the profile database plus any matching SQLite sidecar files.
