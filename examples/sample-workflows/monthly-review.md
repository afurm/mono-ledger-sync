# Monthly review

Use fixture mode to rehearse the review flow without a token. Start the local
UI, run fixture sync from the browser, then review transactions, categories,
accounts, and export previews.

```sh
npm run dev
```

For a live profile, keep the token in the current shell and run the same browser
flow against the Monobank source:

```sh
MONOBANK_TOKEN=... MONO_LEDGER_SYNC_SOURCE=monobank MONO_LEDGER_SYNC_PROFILE=personal npm run dev
```

Review uncategorized rows first, then export the filtered month once categories
and merchant names are stable.
