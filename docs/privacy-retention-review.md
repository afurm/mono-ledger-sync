# Privacy and Retention Review

This review covers the v0.4.0 local-first product boundary. It is an
engineering control document, not legal advice.

## Raw Payload Retention

Raw Monobank statement payload rows are retained for 90 days by default.

Set raw payload retention to `0` to keep raw payload rows until manual deletion.
Any positive value means successful sync runs may delete only
`raw_statement_items` older than that many days.

Retention pruning never deletes:

- normalized `ledger_entries`
- accounts, jars, currency rates, budgets, or categories
- local review state, tags, notes, or split plans

## GDPR Local-Use Boundary

For single-user local use, the user controls the local database, token, backups,
exports, and deletion choices. The project does not receive, process, host, or
subprocess that financial data.

Conditions that change the boundary:

- hosted or remote access to the local API
- multi-user sharing
- accountant handoff
- cloud backups
- BI uploads
- provider mode with access to other clients' data

When those conditions apply, the user or deploying organization must decide
controller/processor roles, retention periods, access controls, and deletion
procedures outside this app.

## Ukrainian Personal Data Review

The local database may contain financial data, account identifiers, merchant
names, transaction descriptions, IBAN-like fields in raw payloads, and
counterparty details. Under local personal use, the app assumes the user is
working with their own data on their own machine.

Obligations may change when data is shared with an accountant, employer,
provider-mode operator, BI service, cloud storage provider, or another person.
Use redacted snapshots and encrypted channels for handoff.

## Support Bundle Retention

Support bundles are temporary, redacted, user-controlled diagnostics exports.
They omit token material and are passed through the privacy redactor.

Rules:

- Generate a support bundle only when troubleshooting requires it.
- Review the payload before sharing.
- Share through a user-controlled channel.
- Delete local and shared copies when the support case is closed.
- Do not attach full SQLite databases or raw export archives to support issues.

## Provider Mode

Provider mode remains a spike in v0.4.0. If it graduates, provider private keys,
company registration data, access requests, and granted user tokens require a
separate retention and access-control review.
