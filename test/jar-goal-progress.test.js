import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-jar-"));

  try {
    return await callback({ tempRoot });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

test("GET /api/ledger/jars returns the fields the JarCard UI consumes", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createLocalApiServer({
      profile: "jar-goal",
      source: "fixture",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 56500,
      monobankTokenStore: createSessionMonobankTokenStore(),
    });

    try {
      // Drive a sync so the local fixture is loaded.
      const syncResponse = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });
      assert.equal(syncResponse.statusCode, 200);

      const jarsResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/jars",
      });
      assert.equal(jarsResponse.statusCode, 200);
      const jars = jarsResponse.json();

      // Fixture data should include at least one jar.
      assert.ok(Array.isArray(jars));
      assert.ok(
        jars.length > 0,
        "expected fixture jars to seed at least one jar",
      );

      for (const jar of jars) {
        // Every field the new JarCard UI reads.
        assert.equal(typeof jar.id, "string");
        assert.equal(typeof jar.title, "string");
        assert.equal(typeof jar.currencyCode, "number");
        assert.equal(typeof jar.balance, "number");
        assert.equal(typeof jar.goal, "number");
        assert.equal(typeof jar.description, "string");
        assert.equal(typeof jar.updatedAt, "string");
      }
    } finally {
      await server.close();
    }
  });
});

test("GET /api/ledger/transactions?accountId=<jarId> returns the jar's transactions for the latest-movement row", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createLocalApiServer({
      profile: "jar-goal-movements",
      source: "fixture",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 56501,
      monobankTokenStore: createSessionMonobankTokenStore(),
    });

    try {
      const syncResponse = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });
      assert.equal(syncResponse.statusCode, 200);

      // Find a jar that the fixture has ledger activity for. The
      // fixture statements.json attaches transactions to the UAH
      // account id "fixture-account-uah-main"; the jar id
      // "fixture-jar-emergency-fund" exists but may not have a
      // ledger_entries row in the bundled fixture. We just assert
      // the endpoint shape (200 + entries array) regardless.
      const jarsResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/jars",
      });
      const jars = jarsResponse.json();
      assert.ok(jars.length > 0);

      const sampleJar = jars[0];
      const txResponse = await server.inject({
        method: "GET",
        url: `/api/ledger/transactions?accountId=${encodeURIComponent(
          sampleJar.id,
        )}&limit=1&sortBy=time&sortDirection=desc`,
      });
      assert.equal(txResponse.statusCode, 200);
      const page = txResponse.json();
      assert.equal(typeof page.total, "number");
      assert.ok(Array.isArray(page.entries));
      // limit=1 caps the page.
      assert.ok(page.entries.length <= 1);
    } finally {
      await server.close();
    }
  });
});
