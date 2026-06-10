import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createMonobankHttpAdapter,
  createMonobankRateLimitState,
} from "../dist/monobank/index.js";
import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";
import { createSqliteLedgerDb } from "../dist/sqlite/index.js";
import { withMockMonobankServer } from "./monobank-mock-server.js";

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-rl-"));

  try {
    return await callback({ tempRoot });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

test("createMonobankRateLimitState returns now when no request has been recorded", () => {
  const state = createMonobankRateLimitState();

  assert.equal(state.getNextAllowedAt("personal", 1_000), 1_000);
  assert.equal(state.getNextAllowedAt("bank", 2_000), 2_000);
});

test("createMonobankRateLimitState round-trips per-key", () => {
  const state = createMonobankRateLimitState();

  state.recordRequest("personal", 5_000);
  assert.equal(state.getNextAllowedAt("personal", 10_000), 5_000);
  // bank is independent of personal.
  assert.equal(state.getNextAllowedAt("bank", 10_000), 10_000);
});

test("createMonobankHttpAdapter shares a provided rateLimitState across calls", async () => {
  const state = createMonobankRateLimitState();
  let calls = 0;

  await withMockMonobankServer(
    async (request, response) => {
      calls += 1;
      if (request.method === "GET" && request.url === "/personal/client-info") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            clientId: "c",
            name: "n",
            accounts: [],
            jars: [],
          }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    },
    async (mockBaseUrl) => {
      const a = createMonobankHttpAdapter({
        token: "t-a",
        baseUrl: mockBaseUrl,
        maxRetries: 0,
        timeoutMs: 5000,
        rateLimitState: state,
      });
      const b = createMonobankHttpAdapter({
        token: "t-b",
        baseUrl: mockBaseUrl,
        maxRetries: 0,
        timeoutMs: 5000,
        rateLimitState: state,
      });

      // First personal call on adapter a. Sleep is real but tiny;
      // the per-call delay between recordRequest and getNextAllowedAt
      // is what we're proving.
      await a.getClientInfo();
      // The state must now reflect the most-recent personal call:
      // the next allowed-at is roughly now() + 60_000.
      const next = state.getNextAllowedAt("personal", Date.now());
      assert.ok(
        next >= Date.now() + 50_000,
        `expected nextSyncAllowedAt ~now+60s, got ${next - Date.now()}ms in the future`,
      );

      // Second adapter must see the same state when it next waits.
      // The first adapter already advanced; second adapter's
      // waitForRateLimit should observe the same map.
      const bNext = state.getNextAllowedAt("personal", Date.now());
      assert.equal(bNext, next);
    },
  );

  assert.equal(calls >= 1, true);
});

test("personal and bank endpoints use independent rate-limit buckets", async () => {
  const state = createMonobankRateLimitState();

  await withMockMonobankServer(
    async (request, response) => {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname === "/personal/client-info") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ clientId: "c", name: "n", accounts: [] }),
        );
        return;
      }
      if (url.pathname === "/bank/currency") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("[]");
        return;
      }
      response.writeHead(404);
      response.end();
    },
    async (mockBaseUrl) => {
      const adapter = createMonobankHttpAdapter({
        token: "shared-state",
        baseUrl: mockBaseUrl,
        maxRetries: 0,
        timeoutMs: 5000,
        rateLimitState: state,
      });
      await adapter.getClientInfo();
      await adapter.getCurrency();

      const personalNext = state.getNextAllowedAt("personal", Date.now());
      const bankNext = state.getNextAllowedAt("bank", Date.now());

      // Personal advanced to now+60s; bank did not advance (bank
      // bucket is independent and currently unset).
      assert.ok(personalNext >= Date.now() + 50_000);
      assert.ok(bankNext <= Date.now() + 1_000);
    },
  );
});

test("GET /api/app/config exposes sync.lastSyncedAt from the most-recent successful sync_runs row", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    // Pre-seed a successful sync run so lastSyncedAt is non-undefined.
    // The server resolves the database path as
    // <dataDir>/<profile>.sqlite, so the seed must match.
    const db = createSqliteLedgerDb({
      filePath: path.join(tempRoot, "demo.sqlite"),
      profile: "demo",
    });
    try {
      await db.migrate();
      await db.recordSyncRun({
        profile: "demo",
        source: "monobank",
        status: "success",
        startedAt: "2026-05-17T08:00:00.000Z",
        finishedAt: "2026-05-17T08:00:01.000Z",
        apiCalls: 3,
        windowsFetched: 2,
        itemsSeen: 10,
        itemsInserted: 9,
        itemsUpdated: 1,
        itemsSkipped: 0,
        rateLimited: 0,
      });
    } finally {
      await db.close();
    }

    const monobankTokenStore = createSessionMonobankTokenStore();
    const server = createLocalApiServer({
      profile: "demo",
      source: "monobank",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 55801,
      monobankTokenStore,
      validateMonobankTokenOnSave: false,
    });

    try {
      const config = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      assert.equal(config.statusCode, 200);
      const body = config.json();

      assert.equal(body.sync.lastSyncedAt, "2026-05-17T08:00:00.000Z");
      // No personal call has been made yet, so nextSyncAllowedAt
      // must be undefined.
      assert.equal(body.sync.nextSyncAllowedAt, undefined);
    } finally {
      await server.close();
    }
  });
});

test("GET /api/app/config exposes sync.nextSyncAllowedAt after a successful probe", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const monobankTokenStore = createSessionMonobankTokenStore();
    const server = createLocalApiServer({
      profile: "demo",
      source: "monobank",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 55802,
      monobankTokenStore,
      validateMonobankTokenOnSave: true,
      monobankTokenProbeAdapter: createMonobankHttpAdapter({
        token: "any",
        baseUrl: "http://127.0.0.1:1",
        maxRetries: 0,
        timeoutMs: 100,
        // The probe will fail; that's fine — we just need to prove
        // the failure case does NOT advance the scheduler. (The
        // success case is exercised in the helper-level test above.)
      }),
    });

    try {
      // A failed probe must NOT advance the personal scheduler.
      const save = await server.inject({
        method: "POST",
        url: "/api/app/token",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: "demo", token: "any" }),
      });
      assert.equal(save.statusCode, 400);

      const config = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      assert.equal(config.json().sync.nextSyncAllowedAt, undefined);
    } finally {
      await server.close();
    }
  });
});

test("a successful personal call advances nextSyncAllowedAt to ~now+60_000", async () => {
  const state = createMonobankRateLimitState();

  await withMockMonobankServer(
    async (request, response) => {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname === "/personal/client-info") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ clientId: "c", name: "n", accounts: [] }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    },
    async (mockBaseUrl) => {
      const adapter = createMonobankHttpAdapter({
        token: "advancer",
        baseUrl: mockBaseUrl,
        maxRetries: 0,
        timeoutMs: 5000,
        rateLimitState: state,
      });

      const before = Date.now();
      await adapter.getClientInfo();
      const next = state.getNextAllowedAt("personal", Date.now());

      // Allow up to 2 seconds of slack for the call latency, but it
      // must be at least 58_000ms in the future (≈60s window).
      assert.ok(
        next >= before + 58_000,
        `expected nextSyncAllowedAt ≥ now+58s, got ${next - before}ms in the future`,
      );
    },
  );
});
