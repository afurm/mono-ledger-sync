import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-g3-"));

  try {
    return await callback({ tempRoot });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

test("GET /api/ledger/transactions returns the total the export preview shows", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createLocalApiServer({
      profile: "g3-export",
      source: "fixture",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 56700,
      monobankTokenStore: createSessionMonobankTokenStore(),
    });

    try {
      const syncResponse = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });
      assert.equal(syncResponse.statusCode, 200);

      const txResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?limit=1",
      });
      assert.equal(txResponse.statusCode, 200);
      const page = txResponse.json();
      assert.equal(typeof page.total, "number");
      // The fixture has at least one transaction.
      assert.ok(page.total > 0);

      // The export preview's estimated-rows counter sources from
      // page.total, so this is the value the UI will render.
      assert.ok(Array.isArray(page.entries));
      assert.ok(page.entries.length <= 1);
    } finally {
      await server.close();
    }
  });
});

test("GET /api/ledger/transactions supports from/to date range filters for the export preview", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createLocalApiServer({
      profile: "g3-range",
      source: "fixture",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 56701,
      monobankTokenStore: createSessionMonobankTokenStore(),
    });

    try {
      const syncResponse = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });
      assert.equal(syncResponse.statusCode, 200);

      // A far-future from bound should yield zero rows.
      const farFuture = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?from=9999999999&limit=10",
      });
      assert.equal(farFuture.statusCode, 200);
      const farFuturePage = farFuture.json();
      assert.equal(farFuturePage.total, 0);
      assert.equal(farFuturePage.entries.length, 0);
    } finally {
      await server.close();
    }
  });
});
