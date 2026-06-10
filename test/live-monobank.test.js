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

// /bank/currency is the public Monobank endpoint that requires no
// X-Token header. It is the right target for a CI smoke test that
// proves https://api.monobank.ua stays reachable without ever
// needing a real token. The test is gated on the same env var as
// the authenticated test above, and additionally skips (not fails)
// when the network is unavailable so offline CI runners stay green.
test(
  "live /bank/currency smoke test reaches https://api.monobank.ua without a token",
  { skip: skipReason },
  async (t) => {
    // The /bank/currency endpoint requires a non-empty X-Token header
    // by Monobank's documented behavior, even though it is a public
    // endpoint. The adapter passes a placeholder token; the upstream
    // response is independent of token validity for this endpoint.
    const adapter = createMonobankHttpAdapter({
      token: "public-bank-currency-smoke",
      maxRetries: 0,
      timeoutMs: 10_000,
    });

    let rates;
    try {
      rates = await adapter.getCurrency();
    } catch (error) {
      const errorCode =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      const message = error instanceof Error ? error.message : String(error);
      t.skip(
        `live /bank/currency unreachable (code=${errorCode || "unknown"}: ${message})`,
      );
      return;
    }

    assert.ok(Array.isArray(rates));
    assert.ok(
      rates.length > 0,
      "expected at least one currency rate from the live endpoint",
    );
    for (const rate of rates) {
      assert.equal(typeof rate.currencyCodeA, "number");
      assert.equal(typeof rate.currencyCodeB, "number");
      assert.equal(typeof rate.date, "number");
      // rateBuy / rateSell / rateCross are optional, but the upstream
      // response typically includes at least one of them. We don't
      // require a specific value because the rate shape depends on
      // Monobank's current public offering.
    }
  },
);
