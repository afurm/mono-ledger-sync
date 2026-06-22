# Accountant Handoff

This project can create user-controlled files for accountant review. It does not
provide tax, accounting, or legal advice.

## Safe SQLite Snapshot

Use a redacted SQLite snapshot for broad review:

```bash
curl -o mono-ledger-redacted.sqlite \
  'http://127.0.0.1:<port>/api/exports/ledger?format=sqlite&redacted=true'
```

The snapshot contains:

- normalized accounts, jars, currency rates, categories, budgets, recurring
  items, ledger entries, review state, notes, tags, and split plans;
- DuckDB-friendly BI views;
- sync/export audit metadata without local export paths.

The redacted snapshot excludes:

- Monobank personal tokens and provider private keys;
- raw statement payload rows;
- webhook event rows and webhook payloads;
- raw Monobank account/jar/currency JSON;
- masked PAN JSON;
- local export-directory paths.

## Narrow Exports

Use CSV, journal CSV, JSON, JSONL, or Parquet when the accountant needs a narrow
table instead of a full snapshot. Prefer `journal-csv` for debit/credit review
and `parquet` for BI tooling.

## Sharing

Share files only through user-controlled encrypted channels. Examples include an
encrypted archive with the password sent separately, an encrypted cloud folder
you control, or a hardware-encrypted drive. Do not paste exports into chat tools
or upload them to public issue trackers.

Delete temporary exports after the handoff is complete.
