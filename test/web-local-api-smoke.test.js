import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";
import { createSqliteLedgerDb } from "../dist/sqlite/index.js";

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-smoke-"));

  try {
    return await callback({ tempRoot });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

function createSmokeServer(tempRoot) {
  return createLocalApiServer({
    profile: "smoke",
    source: "fixture",
    dataDir: tempRoot,
    host: "127.0.0.1",
    port: 56001,
    monobankTokenStore: createSessionMonobankTokenStore(),
  });
}

test("first-run config: GET /api/app/config on a fresh workspace reports fixture source and no token", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createSmokeServer(tempRoot);
    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });

      assert.equal(response.statusCode, 200);
      const body = response.json();

      // First-run contract: a fresh workspace with no saved token.
      assert.equal(body.profile, "smoke");
      assert.equal(body.source, "fixture");
      assert.equal(body.localOnly, true);
      assert.equal(body.token.hasToken, false);
      assert.equal(body.token.storage, "session");
      assert.equal(body.token.persistence, "session");
      // Webhook endpoint is allocated on the workspace.
      assert.ok(
        typeof body.webhook.path === "string" && body.webhook.path.length > 0,
        `webhook.path should be a non-empty string, got ${JSON.stringify(
          body.webhook,
        )}`,
      );
    } finally {
      await server.close();
    }
  });
});

test("built favicon assets are served without favicon.ico 404", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createSmokeServer(tempRoot);
    try {
      const ico = await server.inject({
        method: "GET",
        url: "/favicon.ico",
      });
      assert.notEqual(ico.statusCode, 404);
      assert.equal(ico.statusCode, 200);
      assert.match(String(ico.headers["content-type"] ?? ""), /image\/x-icon/i);
      assert.ok(ico.body.length > 0);

      const svg = await server.inject({
        method: "GET",
        url: "/favicon.svg",
      });
      assert.equal(svg.statusCode, 200);
      assert.match(
        String(svg.headers["content-type"] ?? ""),
        /image\/svg\+xml/i,
      );
      assert.ok(svg.body.includes("<svg"));
    } finally {
      await server.close();
    }
  });
});

test("fixture source selection: POST /api/app/source fixture makes ledger accounts available", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createSmokeServer(tempRoot);
    try {
      const sourceResponse = await server.inject({
        method: "POST",
        url: "/api/app/source",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "fixture" }),
      });

      assert.equal(sourceResponse.statusCode, 200);
      const sourceBody = sourceResponse.json();
      assert.equal(sourceBody.source, "fixture");

      // Trigger a fixture-driven sync so accounts land in the local ledger,
      // then assert the ledger route reports them.
      const syncResponse = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });
      assert.equal(syncResponse.statusCode, 200);
      const syncBody = syncResponse.json();
      assert.equal(syncBody.run.status, "success");

      // Fixture-driven accounts should be reachable through the ledger routes
      // after a successful sync.
      const accountsResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/accounts",
      });

      assert.equal(accountsResponse.statusCode, 200);
      const accounts = accountsResponse.json();
      assert.ok(
        Array.isArray(accounts) && accounts.length >= 1,
        `fixture accounts should be a non-empty array, got ${JSON.stringify(
          accounts,
        )}`,
      );
    } finally {
      await server.close();
    }
  });
});

test("stale running sync runs are interrupted before listing and a new fixture sync can start", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const profile = "smoke";
    const dbPath = path.join(tempRoot, `${profile}.sqlite`);
    const db = createSqliteLedgerDb({
      filePath: dbPath,
      profile,
    });

    try {
      await db.migrate();
      await db.recordSyncRun({
        id: "stale-running-sync",
        profile,
        source: "fixture",
        status: "running",
        startedAt: "2026-05-17T08:00:00.000Z",
        apiCalls: 0,
        windowsFetched: 0,
        itemsSeen: 0,
        itemsInserted: 0,
        itemsUpdated: 0,
        itemsSkipped: 0,
        rateLimited: 0,
      });
    } finally {
      await db.close();
    }

    const server = createLocalApiServer({
      profile,
      source: "fixture",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 56002,
      monobankTokenStore: createSessionMonobankTokenStore(),
      now: () => Date.parse("2026-05-17T09:00:00.000Z"),
    });

    try {
      const runsResponse = await server.inject({
        method: "GET",
        url: "/api/sync/runs",
      });
      assert.equal(runsResponse.statusCode, 200);
      const runs = runsResponse.json();
      assert.equal(runs[0].id, "stale-running-sync");
      assert.equal(runs[0].status, "interrupted");
      assert.equal(runs[0].finishedAt, "2026-05-17T09:00:00.000Z");
      assert.match(runs[0].errorMessage, /more than 30 minutes/);
      assert.equal(
        runs.some((run) => run.status === "queued" || run.status === "running"),
        false,
      );

      const syncResponse = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });
      assert.equal(syncResponse.statusCode, 200);
      assert.equal(syncResponse.json().run.status, "success");
    } finally {
      await server.close();
    }
  });
});

test("CSV export: GET /api/exports/ledger?format=csv returns a text/csv body with download headers", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createSmokeServer(tempRoot);
    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/exports/ledger?format=csv",
      });

      assert.equal(response.statusCode, 200);
      // text/csv is the export content type.
      const contentType = response.headers["content-type"] ?? "";
      assert.match(
        contentType,
        /text\/csv/i,
        `content-type should be text/csv, got ${contentType}`,
      );
      // content-disposition triggers a download with a filename.
      const contentDisposition = response.headers["content-disposition"] ?? "";
      assert.match(
        contentDisposition,
        /attachment; filename="[^"]+\.csv"/i,
        `content-disposition should set a .csv filename, got ${contentDisposition}`,
      );

      const body = typeof response.body === "string" ? response.body : "";
      assert.ok(
        body.length > 0,
        "CSV export body should be a non-empty string",
      );
      // CSV must not contain the stored Monobank token (a UI-screen privacy
      // guarantee; the export flow should only include ledger data).
      assert.equal(
        body.includes("X-Token"),
        false,
        "CSV export body must not include the Monobank token header reference",
      );
    } finally {
      await server.close();
    }
  });
});

test("diagnostics: GET /api/app/diagnostics reports source=fixture and the session token status", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createSmokeServer(tempRoot);
    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/app/diagnostics",
      });

      assert.equal(response.statusCode, 200);
      const body = response.json();

      assert.equal(body.profile, "smoke");
      assert.equal(body.source, "fixture");
      assert.equal(body.token.present, false);
      assert.equal(body.token.storage, "session");
      assert.equal(body.token.persistence, "session");
      // Database section is populated from the actual sqlite file.
      assert.equal(body.database.integrity, "ok");
      assert.match(body.database.filePath, /smoke\.sqlite$/);
    } finally {
      await server.close();
    }
  });
});
