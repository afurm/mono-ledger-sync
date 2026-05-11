# 0003 Webhook trust model

Date: 2026-05-11

Status: Accepted

## Context

The Monobank personal webhook flow can notify the project about statement activity, but the personal webhook documentation does not define a payload signature comparable to acquiring webhooks.

Personal webhook delivery also has operational constraints: Monobank validates the URL with a GET request, expects fast HTTP 200 responses, retries failed delivery, and may disable a webhook after repeated failures.

## Decision

Personal webhooks are sync hints, not final ledger truth.

When a personal webhook event arrives, the local receiver should acknowledge it quickly, record enough local event metadata for diagnostics, and schedule or mark a follow-up statement pull. Final ledger state must come from the pull-based statement reconciliation path.

Webhook ingestion must be idempotent. Duplicate, delayed, or incomplete webhook events must not create duplicate ledger entries or advance sync cursors as if a statement pull succeeded.

Acquiring webhook signature validation belongs to a future acquiring adapter. It should not be applied to the personal MVP unless Monobank documents a compatible personal webhook signature model.

## Consequences

This keeps the ledger reproducible and avoids trusting unsigned event payloads as financial truth. Webhooks can improve freshness, but the product remains correct when webhook delivery is delayed, duplicated, disabled, or unavailable.
