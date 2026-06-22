# 0011. Provider/FOP mode spike boundary

Date: 2026-06-18

## Status

Accepted for v0.4.0. Provider mode does not graduate.

## Context

`mono-ledger-sync` is a local-first personal finance app. The default and
supported path is still the Monobank personal API: a user copies a personal
token, the local app stores it through the token-store boundary, sync runs from
the user's machine, and data remains in a local SQLite database.

The Monobank provider API serves a different product shape. It requires company
approval, registered secp256k1 public keys, signed requests, provider key IDs,
request IDs, and end-user access grants. That is closer to a third-party
financial service than a simple local personal app.

## Decision

Keep provider/FOP mode as a spike, not a default product path.

The v0.4.0 spike includes:

- A deterministic secp256k1 signing helper behind `src/monobank/provider.ts`.
- Golden-vector tests for signing and verification.
- Mock provider endpoints for registration, registration status, access
  request, access status, client-info, and statement.
- A hidden Settings prototype enabled only with `?provider_spike=1` or
  `localStorage.mono-ledger-provider-spike=1`.
- Redaction rules for provider private-key field names, `X-Sign`, and
  `X-Key-Id`.

The spike does not include:

- Live provider API calls in CI.
- A production provider adapter.
- Hosted provider relay services.
- Plaintext storage of provider private keys or granted user tokens.
- A default Settings workflow that competes with the personal-token flow.

## Personal vs Provider API

Use the personal API when the app runs locally for the same user who owns the
token. This is the primary product model.

Use the provider API only when a registered company needs to request access to
other Monobank clients. That changes the trust boundary: provider keys and user
grants become sensitive operational assets, and the app must prove it can keep
them local, revocable, and redacted.

## Key Handling

Provider request signing uses secp256k1 ECDSA and base64-encoded 64-byte
signatures. The spike accepts raw hex private keys only inside the isolated
signing boundary. The hidden Settings prototype generates session-only key
material and does not persist it. Any UI that persists provider keys must use
the same secure-storage boundary as tokens or a stricter purpose-scoped key
store.

Logs, diagnostics, support bundles, and exported snapshots must redact provider
private-key material.

## Graduation Criteria

Provider mode can graduate only if all of the following are true:

- There is real user demand that cannot be handled by personal-token sync,
  including FOP accounts exposed through the user's own token.
- Secure per-OS storage covers provider private keys and granted user tokens.
- The UI keeps provider setup behind an explicit experimental switch.
- Mock coverage proves registration, access request, client-info, and
  statement flows without live provider calls.
- The simple personal-token flow remains the default path and does not regress.

For v0.4.0, provider mode does not meet the key-storage and product-demand
criteria, so it remains a tested spike.
