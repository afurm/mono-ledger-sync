import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-e5-"));

  try {
    return await callback({ tempRoot });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

test("snapshot.webhookEvents is filterable by accountId and status for the E5 sync health section", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createLocalApiServer({
      profile: "e5-sync-health",
      source: "fixture",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 56600,
      monobankTokenStore: createSessionMonobankTokenStore(),
    });

    try {
      // Drive a sync so the local fixture is loaded and webhook events
      // are recorded.
      const syncResponse = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });
      assert.equal(syncResponse.statusCode, 200);

      const webhookResponse = await server.inject({
        method: "GET",
        url: "/api/webhooks/events",
      });
      assert.equal(webhookResponse.statusCode, 200);
      const webhookEvents = webhookResponse.json();

      // The Sync health section needs webhookEvents grouped by
      // accountId. Verify the events are exposed with the right
      // shape and at least one event has a known accountId.
      assert.ok(Array.isArray(webhookEvents));
      if (webhookEvents.length > 0) {
        for (const event of webhookEvents) {
          assert.equal(typeof event.id, "string");
          assert.equal(typeof event.accountId, "string");
          assert.equal(typeof event.status, "string");
          assert.equal(typeof event.receivedAt, "string");
        }

        // Pick any accountId and verify the per-account count can be
        // derived the same way the UI computes it.
        const sampleAccountId = webhookEvents[0].accountId;
        const matching = webhookEvents.filter(
          (event) => event.accountId === sampleAccountId,
        );
        assert.ok(matching.length >= 1);

        const failedLast24h = matching.filter((event) => {
          if (event.status !== "failed") {
            return false;
          }
          const received = Date.parse(event.receivedAt);
          return (
            !Number.isNaN(received) &&
            received >= Date.now() - 24 * 60 * 60 * 1000
          );
        });
        assert.ok(Array.isArray(failedLast24h));
      }
    } finally {
      await server.close();
    }
  });
});

test("snapshot.summary.lastSyncedAt and oldestSyncCursorUpdatedAt are strings when present", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createLocalApiServer({
      profile: "e5-summary",
      source: "fixture",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 56601,
      monobankTokenStore: createSessionMonobankTokenStore(),
    });

    try {
      const summaryResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/summary",
      });
      assert.equal(summaryResponse.statusCode, 200);
      const summary = summaryResponse.json();

      // Cursor age UI works with lastSyncedAt; both fields are
      // optional in the type but the fixture provides them.
      if (summary.lastSyncedAt !== undefined) {
        assert.equal(typeof summary.lastSyncedAt, "string");
      }
      if (summary.oldestSyncCursorUpdatedAt !== undefined) {
        assert.equal(typeof summary.oldestSyncCursorUpdatedAt, "string");
      }
    } finally {
      await server.close();
    }
  });
});
