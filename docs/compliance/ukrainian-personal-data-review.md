# Ukrainian Personal Data Review

The default product assumption is personal local use by the data subject on
their own machine. In that mode, the app stores financial data locally and does
not send it to a hosted service operated by the project.

Data in scope can include names, account identifiers, IBAN-like fields from FOP
statements, merchant names, transaction descriptions, balances, categories,
notes, tags, and exported reports.

Obligations may change when:

- another person operates the app for the user;
- exports or snapshots are sent to an accountant, advisor, employer, or hosted
  BI service;
- provider mode is used to access another Monobank user's data;
- support bundles or screenshots are shared with maintainers.

Practical controls:

- use the redacted SQLite snapshot for handoff by default;
- avoid sharing raw JSON payload exports unless specifically required;
- keep exports in encrypted local storage;
- delete temporary handoff files after review;
- never share Monobank tokens or provider private keys.

This document is an engineering boundary note, not legal advice.
