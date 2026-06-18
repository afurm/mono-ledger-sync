# Local-Use Privacy Review

This project is designed for local personal use. In that default mode, the user
runs the app on their own machine, provides their own Monobank personal token,
and controls the local database, backups, exports, and snapshots.

The privacy boundary changes when any of these happen:

- the app is hosted for another person;
- a developer, maintainer, accountant, or advisor receives the database or
  exports;
- BI dashboards are shared outside the local machine;
- provider mode is used to request access to another Monobank user's data;
- support bundles are attached to public or third-party systems.

Default local safeguards:

- tokens are handled through the secure token-store boundary, not SQLite;
- support bundles strip token status and run through the privacy redactor;
- raw statement payload retention defaults to 90 days;
- `0` raw statement retention days means keep raw payloads until the user deletes
  them manually;
- redacted SQLite snapshots remove raw payload tables and local file paths.

When the boundary changes, the user should decide who receives the data, why
they need it, how long they keep it, and how deletion will be confirmed.
