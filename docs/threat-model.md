# Threat Model

This document enumerates the realistic threats the local-first `mono-ledger-sync`
product must defend against, the attack surface each threat targets, the
mitigations already in the codebase (with file/line pointers), and the
residual risk that motivates future work.

It is a living document: every new privacy-sensitive feature should add or
extend a section here. SECURITY.md remains the policy page for how to report
issues; this page is the engineering reference for "what are we protecting
against, and how."

## Scope

- **In scope:** the local API server, the local SQLite database, the
  bundled fixtures, the local token store, the local web UI assets, the
  diagnostics and support bundle surfaces, the local CI build, the local
  release tarball, and the third-party dependencies that ship with them.
- **Out of scope:** the live Monobank API (covered by Monobank's own
  security model), the developer's local machine OS security model
  (covered by the OS vendor), and the cloud surfaces this project does
  not run.

## Trust boundaries

- The user trusts the local binary, the local SQLite file, the local
  token store, and the local web UI. The local binary does not trust
  the public internet, the local SQLite file contents, the contents
  of incoming webhooks, or the contents of arbitrary npm packages.
- The support bundle is treated as a sensitive export: it is
  generated locally and shared only by explicit user action. The
  privacy redactor must run over the full payload before it leaves
  the process.

## Threat categories

### 1. Local token theft

**Threat.** A personal Monobank API token saved by the local app is
exfiltrated from disk or from a running process and is then used to
pull the user's bank data from a remote attacker.

**Attack surface.**

- The token file in the local token store (Keychain on macOS, Secret
  Service on Linux, an in-memory session store as a fallback).
- The environment variable `MONOBANK_TOKEN` if the user passes it at
  process start.
- The local API process memory if a memory-dump tool is used.
- Local log files written by the app or by a misconfigured
  container/host logger.

**Existing mitigations.**

- The token is stored behind the `MonobankTokenStore` boundary
  (`src/security/index.ts:4-9`) and never persisted to the SQLite
  database or to the support bundle payload
  (`src/server/diagnostics.ts:344-349` strips the `token` field and
  adds the `tokenRedacted: true` marker).
- The structured logger redacts known sensitive field names
  (`src/logging/index.ts:12-32`) and the CI static check from
  PR #430 (`scripts/check-unsafe-logging.mjs`) prevents raw
  `console.*` calls from being reintroduced.
- The privacy redactor (`src/privacy/index.ts:27`) replaces tokens,
  IBANs, and account identifiers before they reach the support
  bundle or any log line.

**Residual risk.** Token-in-process memory is not encrypted; a
co-located attacker with a memory-dump capability can still read the
token while the process is running. Mitigation is an OS-level concern
(process isolation, full-disk encryption).

### 2. Database leakage

**Threat.** A copy of the local SQLite file (`<dataDir>/<profile>.sqlite`)
leaves the machine and exposes the user's full transaction history,
account metadata, and category/rule data.

**Attack surface.**

- The SQLite file on disk; backups the user makes manually; any
  future cloud-sync feature the user opts into.
- `raw_json` columns in the SQLite schema
  (`src/sqlite/index.ts:791,805,819`) that hold the unmodified
  upstream Monobank payload, including personal counterparty names
  and IBANs.

**Existing mitigations.**

- The default data directory lives under the user's home folder; the
  README documents the path and the deletion flow.
- `raw_json` is opt-in: the local API never includes it in API
  responses unless a route explicitly asks for it, and the
  redactor (`src/privacy/index.ts:27`) treats the field name as
  sensitive in any log line or support bundle payload.
- The local API exposes a clear deletion flow that removes the
  local database and the local token store entry together
  (documented in README).

**Residual risk.** Once a SQLite file leaves the machine, the project
cannot reach back to redact it. Future work should add optional
database-directory encryption guidance and a documented rotation
flow.

### 3. Malicious webhook traffic

**Threat.** An attacker who knows or guesses a webhook URL posts a
forged `StatementItem` event to the local API and either injects
fake transactions, causes the local rate limiter to engage, or
attempts a denial-of-service.

**Attack surface.**

- The `/api/webhooks/monobank-<id>` endpoint allocated at server
  start. The path is meant to be private but the local server has
  no authentication on it by default.

**Existing mitigations.**

- The webhook path is a high-entropy per-process identifier
  (`src/server/index.ts:116` generates the prefix and the route
  builder adds a unique suffix).
- The webhook handler deduplicates by payload and by delivery
  metadata, so a replayed event does not insert duplicate
  transactions (`test/ledger.test.js:5851`).
- The webhook handler reconciles after delivery rather than
  blindly trusting the payload, so even a successful forge does
  not produce ledger rows that disagree with the next statement
  pull (`test/ledger.test.js:2236,2368,2458`).
- The HTTP access control layer (`src/server/index.ts`) supports a
  passcode and host binding that the user can enable to add
  authentication on the local socket.

**Residual risk.** When the local server is bound to a routable
interface with no passcode and the user has not enabled a host
allow-list, a network-adjacent attacker can still POST to the
webhook path. The README documents the default-binding safety
expectation; future work should ship a first-run "secure this
workspace" prompt that walks the user through turning on the
access controls.

### 4. Dependency compromise

**Threat.** A transitive npm dependency in the build or runtime
graph is updated with a malicious version that exfiltrates local
data, opens a network channel, or silently corrupts the SQLite
file.

**Attack surface.**

- The runtime graph: `better-sqlite3`, `fastify`, `react`,
  `radix-ui`, `sonner`, etc.
- The dev graph: `vite`, `tailwindcss`, `typescript`.
- The GitHub Actions runners that run `npm ci` on every PR and
  push.

**Existing mitigations.**

- `npm audit --omit=dev --audit-level=high` runs in CI
  (`.github/workflows/ci.yml:28`) and fails the build on
  high-severity advisories.
- `gitleaks/gitleaks-action@v2` scans every commit for
  accidentally-committed secrets
  (`.github/workflows/ci.yml:17`).
- `package-lock.json` is committed; CI uses `npm ci` so the exact
  pinned graph is what runs in production.
- The release workflow uses GitHub Actions Trusted Publishing
  (`.github/workflows/release.yml`) so the published tarball is
  bound to this repository, not to a maintainer's personal npm
  account.

**Residual risk.** `npm audit` is best-effort: a new advisory that
has not yet been added to the GitHub Advisory Database will not
be caught. Future work should add Dependabot or Renovate for
faster advisory ingestion, and pin the runtime graph with a
deny-list of known-supply-chain-risk packages.

### 5. Accidental support data exposure

**Threat.** A user pastes a support bundle or a log line into a
public chat, a GitHub issue, or a help-desk ticket, and the
payload contains a token, an IBAN, a full card number, or a
counterparty name they did not intend to share.

**Attack surface.**

- The `GET /api/app/diagnostics/support-bundle` endpoint
  (introduced in PR #426, `src/server/diagnostics.ts:341`).
- The `GET /api/app/diagnostics` endpoint and its JSON response.
- The local log stream written by the structured logger.
- The export routes under `/api/exports/...` that produce CSV,
  JSON, and JSONL files the user may share.

**Existing mitigations.**

- The support bundle path explicitly strips the `token` field
  from the snapshot, runs the remaining payload through the
  privacy redactor, and adds a `tokenRedacted: true` marker so a
  leak reviewer can confirm the redaction happened
  (`src/server/diagnostics.ts:341-349`).
- The privacy redactor matches `token`, `accesstoken`,
  `refreshtoken`, `secret`, `xtoken`, `xsign`, `xkeyid`, `iban`,
  `accountiban`, `counteriban`, `counteredrpou`, `countername`,
  `maskedpan`, `rawjson`, `payloadjson`, and any key ending in
  `token` or `secret` (`src/privacy/index.ts:9`,
  `src/logging/index.ts:12-32`, `src/logging/index.ts:55-58`).
- The CSV export route is asserted by a test to never include
  the `X-Token` header reference
  (`test/web-local-api-smoke.test.js:111-122`).
- The CI static logging check from PR #430 prevents raw
  `console.*` calls from bypassing the redactor
  (`scripts/check-unsafe-logging.mjs`).

**Residual risk.** The redactor is pattern-based. A personal name
or a non-standard identifier that does not match a known field
name could still slip through. Future work should add an
end-to-end privacy regression test that round-trips a known
sensitive string through every export endpoint and asserts it
does not appear in the response.

## Cross-references

- `SECURITY.md` — how to report an issue privately.
- `docs/local-first.md` — the data-ownership principles that
  drive these mitigations.
- `docs/decisions/0003-webhook-trust-model.md` — the per-event
  trust model that backs the webhook mitigations above.
- `docs/decisions/0008-secure-token-storage.md` — the token
  storage decision that backs the local-token mitigations above.
