# Backup

Show the active local database path:

```sh
mono-ledger-sync data path --profile personal
```

Create a timestamped SQLite backup next to the profile database:

```sh
mono-ledger-sync db backup --profile personal
```

Inspect and compact the database after a large sync or before archiving:

```sh
mono-ledger-sync db inspect --profile personal
mono-ledger-sync db compact --profile personal
```

Backups are local SQLite files. Store them in an encrypted folder or disk image
when stricter privacy is needed.
