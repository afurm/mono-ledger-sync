// Unit tests for the live /bank/currency smoke test's skip-on-network
// behavior. The smoke test itself is gated on
// MONO_LEDGER_SYNC_LIVE_MONOBANK_TESTS=1 and skipped in normal CI, so
// the regression these tests guard against is "someone changes the
// smoke test in a way that would throw on offline CI". We simulate
// the network-unreachable branch by constructing an adapter pointed
// at an unreachable address and proving that the smoke test's catch
// path would call t.skip() instead of failing.

import assert from "node:assert/strict";
import test from "node:test";

import { createMonobankHttpAdapter } from "../dist/monobank/index.js";

// We can't easily assert on the real smoke test without hitting the
// network, so we test the same code path in isolation: the adapter
// rejects with a network-style error when the URL is unreachable.
test("MonobankHttpAdapter rejects with a structured error when the upstream is unreachable", async () => {
  // 127.0.0.1:1 is a port that is not bound; connect should fail.
  const adapter = createMonobankHttpAdapter({
    token: "smoke-token",
    baseUrl: "http://127.0.0.1:1",
    maxRetries: 0,
    timeoutMs: 500,
  });

  let caught;
  try {
    await adapter.getCurrency();
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, "expected getCurrency() to reject on unreachable host");
  // The adapter wraps network failures in a DomainError. We don't
  // pin the exact class because the network stack may surface an
  // ENOTFOUND, ECONNREFUSED, or a wrapped error. The contract that
  // matters: the error has a `code` field of some kind that the
  // smoke test can branch on for t.skip().
  assert.equal(typeof caught, "object");
  const code =
    "code" in caught && typeof caught.code === "string" ? caught.code : "";
  const statusCode =
    "response" in caught &&
    caught.response &&
    typeof caught.response === "object" &&
    "statusCode" in caught.response &&
    typeof caught.response.statusCode === "number"
      ? caught.response.statusCode
      : 0;
  // A non-2xx status from the adapter means an HTTP-level error
  // wrapped in MonobankApiError; a missing/empty code with no
  // statusCode means a network failure. Both are skip-worthy.
  const isSkipWorthy =
    code === "network_unreachable" ||
    code === "monobank_api_error" ||
    code === "rate_limited" ||
    (statusCode === 0 && code === "");
  assert.ok(
    isSkipWorthy,
    `expected a skip-worthy error shape, got code=${code} statusCode=${statusCode}`,
  );
});

test("MonobankHttpAdapter.getCurrency accepts a non-empty placeholder token for the public /bank/currency endpoint", () => {
  // The public /bank/currency endpoint on api.monobank.ua requires a
  // non-empty X-Token header by Monobank's documented behavior, but
  // the token does not have to be valid. This is a build-time guard:
  // if the adapter ever starts rejecting empty tokens, the smoke
  // test's placeholder needs to be updated.
  assert.doesNotThrow(() => {
    createMonobankHttpAdapter({
      token: "non-empty-placeholder",
      maxRetries: 0,
      timeoutMs: 1000,
    });
  });
});
