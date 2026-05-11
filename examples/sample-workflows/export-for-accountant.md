# Export for accountant

Create a local ledger export without including tokens. Start the local UI, run
fixture or live sync, then download CSV and JSONL exports from the Exports
section.

```sh
npm run dev
```

Use CSV for spreadsheet review and JSONL for deterministic row-by-row archive
processing. Generated export files are local files and should be shared only
through the user's normal secure handoff process.
