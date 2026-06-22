import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";

// Four recognisable, distinct secret values seeded into the workspace before
// the test hits any local API surface. None of them should ever appear in a
// response body that the local web UI would render. If any of these strings
// leak, this test will fail.
const SEEDED_TOKEN = "PRIVACY-REGRESSION-DO-NOT-LEAK-token-xyz";
const SEEDED_IBAN = "UA213223130000026007233566001";
const SEEDED_CARD = "4111111111111111";
const SEEDED_RAW_PAYLOAD =
  "PRIVACY-REGRESSION-DO-NOT-LEAK-raw-payload-marker-abc";

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-priv-"));

  try {
    return await callback({ tempRoot });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

function createServer(tempRoot) {
  return createLocalApiServer({
    profile: "privacy",
    source: "fixture",
    dataDir: tempRoot,
    host: "127.0.0.1",
    port: 56100,
    monobankTokenStore: createSessionMonobankTokenStore(),
  });
}

const SEEDS = [
  SEEDED_TOKEN,
  SEEDED_IBAN,
  SEEDED_CARD,
  SEEDED_RAW_PAYLOAD,
  // The header name itself must not appear in CSV exports either.
  "X-Token",
];

function assertNoSeeds(serializedBody, sourceLabel) {
  for (const seed of SEEDS) {
    assert.equal(
      serializedBody.includes(seed),
      false,
      `${sourceLabel} must not contain the seeded secret ${JSON.stringify(
        seed,
      )}; full body was:\n${serializedBody.slice(0, 1000)}`,
    );
  }
}

test("local API responses never leak seeded secrets across the rendered surfaces", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const monobankTokenStore = createSessionMonobankTokenStore();
    await monobankTokenStore.setToken("privacy", SEEDED_TOKEN);

    const server = createServer(tempRoot);
    try {
      const config = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      assert.equal(config.statusCode, 200);
      assertNoSeeds(
        typeof config.body === "string"
          ? config.body
          : JSON.stringify(config.body),
        "GET /api/app/config",
      );

      const diagnostics = await server.inject({
        method: "GET",
        url: "/api/app/diagnostics",
      });
      assert.equal(diagnostics.statusCode, 200);
      assertNoSeeds(
        typeof diagnostics.body === "string"
          ? diagnostics.body
          : JSON.stringify(diagnostics.body),
        "GET /api/app/diagnostics",
      );

      const supportBundle = await server.inject({
        method: "GET",
        url: "/api/app/diagnostics/support-bundle",
      });
      assert.equal(supportBundle.statusCode, 200);
      assertNoSeeds(
        typeof supportBundle.body === "string"
          ? supportBundle.body
          : JSON.stringify(supportBundle.body),
        "GET /api/app/diagnostics/support-bundle",
      );

      const accounts = await server.inject({
        method: "GET",
        url: "/api/ledger/accounts",
      });
      assert.equal(accounts.statusCode, 200);
      assertNoSeeds(
        typeof accounts.body === "string"
          ? accounts.body
          : JSON.stringify(accounts.body),
        "GET /api/ledger/accounts",
      );

      const webhooks = await server.inject({
        method: "GET",
        url: "/api/webhooks/events",
      });
      assert.equal(webhooks.statusCode, 200);
      assertNoSeeds(
        typeof webhooks.body === "string"
          ? webhooks.body
          : JSON.stringify(webhooks.body),
        "GET /api/webhooks/events",
      );

      // CSV / JSON / JSONL export responses must not contain the seeded
      // token, IBAN, card, raw payload, or the X-Token header name.
      for (const format of ["csv", "json", "jsonl"]) {
        const exportResponse = await server.inject({
          method: "GET",
          url: `/api/exports/ledger?format=${format}`,
        });
        assert.equal(
          exportResponse.statusCode,
          200,
          `GET /api/exports/ledger?format=${format} returned ${exportResponse.statusCode}`,
        );
        assertNoSeeds(
          typeof exportResponse.body === "string"
            ? exportResponse.body
            : JSON.stringify(exportResponse.body),
          `GET /api/exports/ledger?format=${format}`,
        );
      }
    } finally {
      await server.close();
    }
  });
});
