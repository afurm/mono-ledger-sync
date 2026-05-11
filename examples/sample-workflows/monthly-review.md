# Monthly review

Use fixture mode to rehearse the review flow without a token:

```sh
mono-ledger-sync sync --source fixture
mono-ledger-sync export --format csv
mono-ledger-sync ui --source fixture
```

For a live profile, keep the token in the current shell and run the same flow:

```sh
MONOBANK_TOKEN=... mono-ledger-sync sync --source monobank --profile personal
mono-ledger-sync export --profile personal --format csv
mono-ledger-sync ui --profile personal --source monobank
```

Review uncategorized rows first, then export the filtered month once categories
and merchant names are stable.
