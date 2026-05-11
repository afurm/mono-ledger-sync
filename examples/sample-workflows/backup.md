# Backup

Open the local UI and use the database path shown in the sidebar. The same
path is also available from `/api/app/config`.

Stop the local app before copying the SQLite database. Copy the database file
and any matching `-wal` or `-shm` sidecar files if SQLite created them during
the session.

After copying, start the local UI again and verify the ledger summary, account
list, and recent transactions still load.

Backups are local SQLite files. Store them in an encrypted folder or disk image
when stricter privacy is needed.
