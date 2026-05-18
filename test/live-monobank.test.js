import assert from "node:assert/strict";
import test from "node:test";

import { createMonobankHttpAdapter } from "../dist/monobank/index.js";

const liveTestsEnabled =
  process.env.MONO_LEDGER_SYNC_LIVE_MONOBANK_TESTS === "1";
const monobankToken = process.env.MONOBANK_TOKEN?.trim();
const skipReason = !liveTestsEnabled
  ? "Set MONO_LEDGER_SYNC_LIVE_MONOBANK_TESTS=1 to run live Monobank adapter validation."
  : monobankToken
    ? false
    : "Set MONOBANK_TOKEN to run live Monobank adapter validation.";

test(
  "live Monobank adapter validates MONOBANK_TOKEN against client info",
  { skip: skipReason },
  async () => {
    assert.ok(monobankToken);

    const adapter = createMonobankHttpAdapter({
      token: monobankToken,
      maxRetries: 0,
      timeoutMs: 10_000,
    });
    const clientInfo = await adapter.getClientInfo();

    assert.equal(typeof clientInfo.clientId, "string");
    assert.ok(clientInfo.clientId.length > 0);
    assert.ok(Array.isArray(clientInfo.accounts));
  },
);
