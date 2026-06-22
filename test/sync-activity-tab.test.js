import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";
import { buildLocalActivityEvents } from "../dist/web/api.js";

const SEEDS = [
  "PRIVACY-REGRESSION-DO-NOT-LEAK-token-xyz",
  "PRIVACY-REGRESSION-DO-NOT-LEAK-raw-payload-marker-abc",
  "UA213223130000026007233566001",
  "4111111111111111",
  "X-Token",
];

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-activity-"));

  try {
    return await callback({ tempRoot });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

function assertNoSeeds(serializedBody, sourceLabel) {
  for (const seed of SEEDS) {
    assert.equal(
      serializedBody.includes(seed),
      false,
      `${sourceLabel} must not contain the seeded secret ${JSON.stringify(
        seed,
      )}; full body was:\n${serializedBody.slice(0, 2000)}`,
    );
  }
}

test("buildLocalActivityEvents groups sync runs and webhook events by type", () => {
  const syncRuns = [
    {
      id: "run-1",
      profile: "default",
      source: "monobank",
      status: "success",
      startedAt: "2026-06-19T08:00:00.000Z",
      finishedAt: "2026-06-19T08:01:00.000Z",
      itemsSeen: 5,
      itemsInserted: 5,
      itemsUpdated: 0,
      itemsSkipped: 0,
      apiCalls: 1,
      errorMessage: null,
    },
    {
      id: "run-2",
      profile: "default",
      source: "monobank",
      status: "failed",
      startedAt: "2026-06-19T07:00:00.000Z",
      finishedAt: "2026-06-19T07:00:30.000Z",
      itemsSeen: 0,
      itemsInserted: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      apiCalls: 1,
      errorMessage: "rate limit",
    },
  ];
  const webhookEvents = [
    {
      id: "webhook-1",
      profile: "default",
      accountId: "acc-1",
      type: "StatementItem",
      statementItemId: "stmt-1",
      receivedAt: "2026-06-19T08:30:00.000Z",
      processedAt: "2026-06-19T08:30:01.000Z",
      payloadJson: '{"id":"stmt-1","time":1775001600,"amount":-100}',
    },
  ];

  const events = buildLocalActivityEvents(syncRuns, webhookEvents);

  // run-1 (success) -> sync_run + ledger_write + report_refresh = 3.
  // run-2 (failed)  -> sync_run + error = 2.
  // webhook-1       -> webhook_delivery = 1.
  // Total = 6. The exact split depends on which optional branches the
  // builder fires for a given status; we assert the three required
  // types and the total count.
  assert.equal(events.length, 6);

  const byType = events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] ?? 0) + 1;
    return acc;
  }, {});

  assert.equal(byType.sync_run, 2);
  assert.equal(byType.error, 1);
  assert.equal(byType.webhook_delivery, 1);
  assert.ok(byType.ledger_write >= 1, "expected at least one ledger_write");
  assert.ok(
    byType.report_refresh >= 1,
    "expected at least one report_refresh for the success run",
  );
});

test("Sync activity sources never include the four privacy seeds", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const tokenStore = createSessionMonobankTokenStore();
    await tokenStore.setToken("activity-tab", SEEDS[0]);

    const server = createLocalApiServer({
      profile: "activity-tab",
      source: "fixture",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 56400,
      monobankTokenStore: tokenStore,
    });

    try {
      // Drive a sync so the activity sources are non-empty.
      const syncResponse = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });
      assert.equal(syncResponse.statusCode, 200);

      const syncRunsResponse = await server.inject({
        method: "GET",
        url: "/api/sync/runs",
      });
      assert.equal(syncRunsResponse.statusCode, 200);
      const syncRuns = syncRunsResponse.json();

      const webhookEventsResponse = await server.inject({
        method: "GET",
        url: "/api/webhooks/events",
      });
      assert.equal(webhookEventsResponse.statusCode, 200);
      const webhookEvents = webhookEventsResponse.json();

      // The Sync tab derives activityEvents from syncRuns + webhookEvents
      // using buildLocalActivityEvents (same shape as the snapshot).
      const events = buildLocalActivityEvents(syncRuns, webhookEvents);
      assert.ok(Array.isArray(events));

      // The combined payload, plus the two underlying API responses,
      // must never include the four privacy seeds.
      const serialized = JSON.stringify({
        events,
        syncRuns,
        webhookEvents,
      });
      assertNoSeeds(serialized, "Sync activity sources");
    } finally {
      await server.close();
    }
  });
});
