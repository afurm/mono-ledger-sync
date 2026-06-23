# v1 public demo and release checklist

Run this checklist on a fresh OS user or isolated VM, a new profile, and an
empty data directory. Record the OS, Node version, package version, and result.

- [ ] Install Node.js 20 or newer and run `npx mono-ledger-sync --help`.
- [ ] Start `npx mono-ledger-sync`; confirm it binds to loopback and opens the
      working finance workspace without a hosted account.
- [ ] Choose **Переглянути демо-дані**; confirm every route labels the data as demo.
- [ ] Save a valid personal Monobank token; confirm demo rows are removed before
      the source changes to live.
- [ ] Run sync; inspect successful and partial-run account/window details.
- [ ] Review one transaction, edit merchant/category/tags, create a rule, undo,
      and complete a bulk review action.
- [ ] Create, copy, close, and reopen a monthly budget.
- [ ] Confirm/ignore a recurring suggestion and create a manual stream.
- [ ] Run browser, folder, and redacted SQLite exports; inspect preview/history.
- [ ] Export and re-import local configuration after reviewing the preview.
- [ ] Create a backup, change local data, restore, and verify SQLite integrity.
- [ ] Delete only the token, then only ledger data, then both in a disposable
      profile; verify every exact-confirmation boundary.
- [ ] Restart and confirm persistent token behavior or the explicit session-only
      warning for the current OS credential-store availability.
- [ ] Run `npm run typecheck`, `npm test`, `npm run smoke:web`,
      `npm run lint:logging`, `npm run scan:secrets`, and `npm pack --dry-run`.
- [ ] Verify the clean-install package, tag, npm version, provenance, GitHub
      Release notes, and package contents all match.

Never use a personal token in CI, screenshots, fixtures, logs, issue text, or
release artifacts.
