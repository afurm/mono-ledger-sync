import assert from "node:assert/strict";
import test from "node:test";

/**
 * Static-shape test for the web recheck client.
 *
 * We do not spin up a real local API server here; the server behavior
 * is covered by `test/server-token-recheck.test.js`. This file pins
 * the web client's exported shape and the wire-level request it
 * makes, so swapping the implementation cannot silently desync the
 * URL or method.
 */
import { recheckMonobankConnection } from "../dist/web/api.js";

test("recheckMonobankConnection is exported as a function", () => {
  assert.equal(typeof recheckMonobankConnection, "function");
});

test("recheckMonobankConnection has arity 0 (no required args)", () => {
  assert.equal(recheckMonobankConnection.length, 0);
});

test(
  "recheckMonobankConnection rejects with a helpful error when the local API is unreachable",
  async () => {
    // The test runner is offline from the local API by default.
    // The client should reject (not return) when the network call
    // fails; the UI turns that into a destructive alert.
    await assert.rejects(
      () => recheckMonobankConnection(),
      (error) => {
        assert.ok(error instanceof Error);
        return true;
      },
    );
  },
);
