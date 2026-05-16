import assert from "node:assert/strict";
import test from "node:test";

import { buildLocalActivityEvents } from "../dist/web/api.js";

test("buildLocalActivityEvents emits sync lifecycle events with warning and error states", () => {
  const events = buildLocalActivityEvents(
    [
      {
        id: "run-queued",
        profile: "demo",
        source: "fixture",
        status: "running",
        startedAt: "2026-06-01T12:00:00Z",
        apiCalls: 1,
        windowsFetched: 1,
        itemsSeen: 4,
        itemsInserted: 0,
        itemsUpdated: 0,
        itemsSkipped: 0,
        rateLimited: 0,
      },
      {
        id: "run-failed",
        profile: "demo",
        source: "monobank",
        status: "failed",
        startedAt: "2026-06-01T11:00:00Z",
        finishedAt: "2026-06-01T11:10:00Z",
        apiCalls: 3,
        windowsFetched: 2,
        itemsSeen: 40,
        itemsInserted: 10,
        itemsUpdated: 3,
        itemsSkipped: 2,
        rateLimited: 1,
      },
      {
        id: "run-success",
        profile: "demo",
        source: "monobank",
        status: "success",
        startedAt: "2026-06-01T09:00:00Z",
        finishedAt: "2026-06-01T09:05:00Z",
        apiCalls: 5,
        windowsFetched: 4,
        itemsSeen: 120,
        itemsInserted: 110,
        itemsUpdated: 2,
        itemsSkipped: 8,
        rateLimited: 0,
      },
    ],
    [
      {
        id: "webhook-1",
        profile: "demo",
        accountId: "fixture-account-uah-main",
        type: "StatementItem",
        statementItemId: "fixture-stmt-1",
        receivedAt: "2026-06-01T13:00:00Z",
      },
      {
        id: "webhook-2",
        profile: "demo",
        accountId: "fixture-account-uah-main",
        type: "StatementItem",
        statementItemId: "fixture-stmt-2",
        receivedAt: "2026-06-01T10:00:00Z",
        processedAt: "2026-06-01T10:20:00Z",
      },
    ],
  );

  const eventIds = events.map((event) => event.id);

  assert.equal(events.length, 8);
  assert.equal(eventIds[0], "webhook:webhook-1");
  assert.deepEqual(eventIds[1], "webhook:webhook-1:warning");

  const idsByTimestamp = events.reduce((acc, event) => {
    (acc[event.timestamp] ??= []).push(event.id);
    return acc;
  }, /** @type {Record<string, string[]>} */ ({}));

  assert.equal(idsByTimestamp["2026-06-01T13:00:00Z"].length, 2);
  assert.equal(
    idsByTimestamp["2026-06-01T13:00:00Z"].includes("webhook:webhook-1"),
    true,
  );
  assert.equal(
    idsByTimestamp["2026-06-01T13:00:00Z"].includes(
      "webhook:webhook-1:warning",
    ),
    true,
  );

  assert.equal(idsByTimestamp["2026-06-01T12:00:00Z"].length, 2);
  assert.equal(
    idsByTimestamp["2026-06-01T12:00:00Z"].includes("sync-run:run-queued"),
    true,
  );
  assert.equal(
    idsByTimestamp["2026-06-01T12:00:00Z"].includes(
      "sync-run:run-queued:pending",
    ),
    true,
  );

  assert.equal(idsByTimestamp["2026-06-01T11:10:00Z"].length, 2);
  assert.equal(
    idsByTimestamp["2026-06-01T11:10:00Z"].includes("sync-run:run-failed"),
    true,
  );
  assert.equal(
    idsByTimestamp["2026-06-01T11:10:00Z"].includes(
      "sync-run:run-failed:error",
    ),
    true,
  );

  assert.equal(idsByTimestamp["2026-06-01T10:00:00Z"].length, 1);
  assert.equal(idsByTimestamp["2026-06-01T10:00:00Z"][0], "webhook:webhook-2");
  assert.equal(idsByTimestamp["2026-06-01T09:05:00Z"].length, 1);
  assert.equal(
    idsByTimestamp["2026-06-01T09:05:00Z"][0],
    "sync-run:run-success",
  );

  assert.equal(
    events.some((event) => event.id === "webhook:webhook-1:warning"),
    true,
  );
  assert.equal(
    events.some((event) => event.id === "webhook:webhook-2:warning"),
    false,
  );
  assert.equal(
    events.find((event) => event.id === "sync-run:run-queued")?.severity,
    "info",
  );
  assert.equal(
    events.find((event) => event.id === "sync-run:run-queued:pending")
      ?.severity,
    "warning",
  );
  assert.equal(
    events.find((event) => event.id === "sync-run:run-failed:error")?.severity,
    "error",
  );
  assert.equal(
    events.find((event) => event.id === "sync-run:run-failed")?.severity,
    "error",
  );
  assert.equal(
    events.find((event) => event.id === "sync-run:run-success")?.severity,
    "success",
  );
});
