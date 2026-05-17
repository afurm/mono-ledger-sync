# 0008 Secure token storage

Date: 2026-05-17

Status: Accepted

## Context

Live Monobank sync needs a personal API token, but the local product should not
turn that token into normal ledger data. The current server can accept a token
from `MONOBANK_TOKEN` or from the local token endpoint for the running process.
That keeps default development safe, but it does not survive process restarts
and is not the right long-term storage model for packaged desktop builds.

The storage choice has to work across macOS, Windows, Linux, and CI without
making SQLite, fixtures, logs, or exports a credential store.

## Decision

Token persistence will use a small asynchronous secure-storage boundary before
the local API server talks to platform-specific credential stores.

The boundary will store only the Monobank token secret, keyed by local profile.
It will expose `get`, `set`, and `delete` operations and return a status that
lets the UI explain whether a token is available without revealing the token
value.

Provider selection:

- macOS: Keychain Services through the packaged desktop host.
- Windows: Credential Manager through the packaged desktop host.
- Linux: Secret Service when a session keyring is available.
- CI and tests: no persistent provider by default; live validation continues to
  use explicit environment variables.

SQLite remains out of scope for token persistence. A file-based plaintext
fallback is not acceptable as an automatic default. If a platform secure store
is unavailable, the app should fall back to session-only token handling and show
that limitation in the local UI.

## Consequences

The TypeScript server can keep using an in-memory token while the project is a
local web app package. Packaged desktop work should add the platform adapters
behind the secure-storage boundary instead of widening SQLite tables or writing
tokens to app config files.

Tests and CI stay fixture-first. Any live adapter check must remain opt-in and
credential-driven through environment variables so pull-request validation does
not require or leak personal banking credentials.
