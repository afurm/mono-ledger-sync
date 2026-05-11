# Export for accountant

Create a local ledger export without including tokens:

```sh
mono-ledger-sync sync --source fixture
mono-ledger-sync export --format csv > mono-ledger-transactions.csv
mono-ledger-sync export --format jsonl > mono-ledger-transactions.jsonl
```

Use CSV for spreadsheet review and JSONL for deterministic row-by-row archive
processing. Generated export files are local files and should be shared only
through the user's normal secure handoff process.
