# Restore

Restore is intentionally manual until the confirmation flow is implemented.
The current safe process is:

```sh
mono-ledger-sync data path --profile personal
mono-ledger-sync db backup --profile personal
```

After creating a fresh backup, stop the local app and replace the database file
reported by `data path` with the backup copy you want to restore. Run
`mono-ledger-sync doctor --profile personal` afterward to verify that the
database opens and migrations are current.

To remove the restored profile database and start over:

```sh
mono-ledger-sync data delete --profile personal --yes
```
