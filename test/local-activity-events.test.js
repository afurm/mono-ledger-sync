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
        status: "pending",
        receivedAt: "2026-06-01T13:00:00Z",
      },
      {
        id: "webhook-2",
        profile: "demo",
        accountId: "fixture-account-uah-main",
        type: "StatementItem",
        statementItemId: "fixture-stmt-2",
        status: "processed",
        receivedAt: "2026-06-01T10:00:00Z",
        processedAt: "2026-06-01T10:20:00Z",
      },
    ],
  );

  const eventIds = events.map((event) => event.id);

  assert.equal(events.length, 11);
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

  assert.equal(idsByTimestamp["2026-06-01T11:10:00Z"].length, 3);
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
  assert.equal(
    idsByTimestamp["2026-06-01T11:10:00Z"].includes(
      "sync-run:run-failed:ledger-write",
    ),
    true,
  );

  assert.equal(idsByTimestamp["2026-06-01T10:00:00Z"].length, 1);
  assert.equal(idsByTimestamp["2026-06-01T10:00:00Z"][0], "webhook:webhook-2");
  assert.equal(idsByTimestamp["2026-06-01T09:05:00Z"].length, 3);
  assert.equal(
    idsByTimestamp["2026-06-01T09:05:00Z"][0],
    "sync-run:run-success",
  );
  assert.equal(
    idsByTimestamp["2026-06-01T09:05:00Z"].includes(
      "sync-run:run-success:ledger-write",
    ),
    true,
  );
  assert.equal(
    idsByTimestamp["2026-06-01T09:05:00Z"].includes(
      "sync-run:run-success:report-refresh",
    ),
    true,
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
    events.find((event) => event.id === "sync-run:run-failed:ledger-write")
      ?.severity,
    "error",
  );
  assert.equal(
    events.find((event) => event.id === "sync-run:run-success")?.severity,
    "success",
  );
  assert.equal(
    events.find((event) => event.id === "sync-run:run-success:ledger-write")
      ?.type,
    "ledger_write",
  );
  assert.equal(
    events.find((event) => event.id === "sync-run:run-success:ledger-write")
      ?.correlationId,
    "run-success",
  );
  assert.equal(
    events.find((event) => event.id === "sync-run:run-success:report-refresh")
      ?.type,
    "report_refresh",
  );
});

test("buildLocalActivityEvents maps webhook status-specific activity variants", () => {
  const events = buildLocalActivityEvents(
    [],
    [
      {
        id: "webhook-pending",
        profile: "demo",
        accountId: "fixture-account-uah-main",
        type: "StatementItem",
        statementItemId: "fixture-stmt-pending",
        status: "pending",
        receivedAt: "2026-06-02T10:00:00Z",
      },
      {
        id: "webhook-duplicate",
        profile: "demo",
        accountId: "fixture-account-uah-main",
        type: "StatementItem",
        statementItemId: "fixture-stmt-duplicate",
        status: "duplicate",
        receivedAt: "2026-06-02T09:00:00Z",
      },
      {
        id: "webhook-ignored",
        profile: "demo",
        accountId: "fixture-account-uah-main",
        type: "StatementItem",
        statementItemId: "fixture-stmt-ignored",
        status: "ignored",
        receivedAt: "2026-06-02T08:00:00Z",
      },
      {
        id: "webhook-failed",
        profile: "demo",
        accountId: "fixture-account-uah-main",
        type: "StatementItem",
        statementItemId: "fixture-stmt-failed",
        status: "failed",
        receivedAt: "2026-06-02T07:00:00Z",
        processedAt: "2026-06-02T07:30:00Z",
      },
    ],
  );

  assert.equal(events.length, 7);
  assert.equal(
    events.find((event) => event.id === "webhook:webhook-pending")?.severity,
    "warning",
  );
  assert.equal(
    events.find((event) => event.id === "webhook:webhook-pending:warning")
      ?.severity,
    "warning",
  );
  assert.equal(
    events.find((event) => event.id === "webhook:webhook-duplicate")?.severity,
    "info",
  );
  assert.equal(
    events.find((event) => event.id === "webhook:webhook-ignored")?.severity,
    "warning",
  );
  assert.equal(
    events.find((event) => event.id === "webhook:webhook-ignored:ignored")
      ?.severity,
    "warning",
  );
  assert.equal(
    events.find((event) => event.id === "webhook:webhook-failed")?.severity,
    "error",
  );
  assert.equal(
    events.find((event) => event.id === "webhook:webhook-failed:error")
      ?.severity,
    "error",
  );
});

test("buildLocalActivityEvents emits failed ledger writes without failed report refreshes", () => {
  const events = buildLocalActivityEvents(
    [
      {
        id: "run-partial",
        profile: "demo",
        source: "monobank",
        status: "partial",
        startedAt: "2026-06-03T10:00:00Z",
        finishedAt: "2026-06-03T10:05:00Z",
        apiCalls: 4,
        windowsFetched: 2,
        itemsSeen: 20,
        itemsInserted: 7,
        itemsUpdated: 1,
        itemsSkipped: 2,
        rateLimited: 1,
      },
      {
        id: "run-failed",
        profile: "demo",
        source: "monobank",
        status: "failed",
        startedAt: "2026-06-03T09:00:00Z",
        finishedAt: "2026-06-03T09:01:00Z",
        apiCalls: 1,
        windowsFetched: 0,
        itemsSeen: 0,
        itemsInserted: 3,
        itemsUpdated: 0,
        itemsSkipped: 0,
        rateLimited: 0,
      },
    ],
    [],
  );

  assert.equal(
    events.find((event) => event.id === "sync-run:run-partial:ledger-write")
      ?.severity,
    "partial",
  );
  assert.equal(
    events.find((event) => event.id === "sync-run:run-partial:report-refresh")
      ?.severity,
    "partial",
  );
  assert.equal(
    events.find((event) => event.id === "sync-run:run-failed:ledger-write")
      ?.severity,
    "error",
  );
  assert.equal(
    events.some((event) => event.id === "sync-run:run-failed:report-refresh"),
    false,
  );
});
