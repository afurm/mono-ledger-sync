import { test } from "node:test";
import assert from "node:assert/strict";

import { summarizeSyncRuns } from "../dist/web/sync-summary.js";

function syncRun(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    profile: "demo",
    source: "fixture",
    status: "success",
    startedAt: "2026-05-17T08:00:00.000Z",
    finishedAt: "2026-05-17T08:00:01.000Z",
    apiCalls: 0,
    windowsFetched: 0,
    itemsSeen: 0,
    itemsInserted: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    rateLimited: 0,
    ...overrides,
  };
}

test("summarizes sync run counters across loaded runs", () => {
  const summary = summarizeSyncRuns([
    syncRun({
      apiCalls: 3,
      windowsFetched: 2,
      itemsSeen: 10,
      itemsInserted: 6,
      itemsUpdated: 3,
      itemsSkipped: 1,
      rateLimited: 0,
    }),
    syncRun({
      apiCalls: 2,
      windowsFetched: 1,
      itemsSeen: 5,
      itemsInserted: 1,
      itemsUpdated: 2,
      itemsSkipped: 2,
      rateLimited: 1,
    }),
  ]);

  assert.deepEqual(summary, {
    runs: 2,
    apiCalls: 5,
    windowsFetched: 3,
    itemsSeen: 15,
    itemsInserted: 7,
    itemsUpdated: 5,
    itemsSkipped: 3,
    rateLimited: 1,
  });
});

test("returns zero counters when there are no sync runs", () => {
  assert.deepEqual(summarizeSyncRuns([]), {
    runs: 0,
    apiCalls: 0,
    windowsFetched: 0,
    itemsSeen: 0,
    itemsInserted: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    rateLimited: 0,
  });
});
