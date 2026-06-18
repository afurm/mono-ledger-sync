# Support Bundle Retention

Support bundles are temporary, redacted, and user-controlled.

Rules:

- create a support bundle only for a specific troubleshooting task;
- inspect it before sharing;
- do not share it in public issues if it contains transaction context;
- delete local bundle copies after the troubleshooting task closes;
- maintainers should not ask for tokens, provider private keys, raw payloads, or
  unredacted databases.

The support bundle endpoint removes the token field and runs the payload through
the privacy redactor. The redactor also treats provider private key fields,
token-like headers, IBAN-like values, raw JSON, and payload JSON as sensitive.

For data-heavy investigations, prefer a redacted SQLite snapshot or a narrow CSV
export over a support bundle.
