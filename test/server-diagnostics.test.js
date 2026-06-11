import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-diag-"));

  try {
    return await callback({ tempRoot });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

test("GET /api/app/diagnostics returns a snapshot with token info redacted from secret values", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const monobankTokenStore = createSessionMonobankTokenStore();
    // Save a token with a clearly identifiable string so the test can
    // assert it never appears in the serialized response.
    await monobankTokenStore.setToken(
      "demo",
      "super-secret-token-DO-NOT-LEAK-xyz",
    );

    const server = createLocalApiServer({
      profile: "demo",
      source: "fixture",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 55901,
      monobankTokenStore,
    });

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/app/diagnostics",
      });

      assert.equal(response.statusCode, 200);
      const body = response.json();

      assert.equal(body.profile, "demo");
      assert.equal(body.source, "fixture");
      assert.equal(body.schemaVersion, "1");
      assert.equal(typeof body.generatedAt, "string");
      assert.equal(typeof body.version, "string");
      assert.equal(typeof body.architecture, "object");

      // Token metadata is present, but the raw secret must NOT be.
      assert.equal(body.token.present, true);
      // The session-backed store reports "session" with a fallback reason.
      assert.equal(
        body.token.storage,
        "session",
        `body.token=${JSON.stringify(body.token)}`,
      );
      assert.equal(body.token.persistence, "session");
      assert.equal(body.token.fallbackReason, "secure_storage_unavailable");

      // Database section is populated from the actual sqlite file.
      assert.equal(body.database.integrity, "ok");
      assert.match(body.database.filePath, /demo\.sqlite$/);
      assert.ok(body.database.fileSize >= 0);
      assert.equal(typeof body.database.lastModified, "string");

      // Sync section defaults to null/empty for a fresh ledger.
      assert.equal(body.sync.lastSuccessfulAt, null);
      // ageHours is null when no successful run has ever happened.
      assert.equal(body.sync.ageHours, null);
      assert.ok(Array.isArray(body.sync.staleCursors));

      // Webhook counters are zero on a fresh ledger.
      assert.equal(body.webhooks.pending, 0);
      assert.equal(body.webhooks.processed, 0);
      assert.equal(body.webhooks.failed, 0);
      assert.equal(body.webhooks.ignored, 0);
      assert.equal(body.webhooks.duplicate, 0);

      // Duplicates counters.
      assert.equal(body.duplicates.last24h, 0);
      assert.equal(body.duplicates.sinceFirstRun, 0);

      // Privacy: the secret token value must not appear anywhere in the body.
      const serialized = JSON.stringify(body);
      assert.equal(
        serialized.includes("super-secret-token-DO-NOT-LEAK-xyz"),
        false,
        "secret token value must not appear in diagnostics response",
      );
    } finally {
      await server.close();
    }
  });
});

test("GET /api/app/diagnostics reports token absent when nothing is stored", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const monobankTokenStore = createSessionMonobankTokenStore();
    // Intentionally do not save a token.

    const server = createLocalApiServer({
      profile: "demo",
      source: "fixture",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 55902,
      monobankTokenStore,
    });

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/app/diagnostics",
      });

      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.equal(body.token.present, false);
      assert.equal(body.token.storage, "session");
      assert.equal(body.token.persistence, "session");
    } finally {
      await server.close();
    }
  });
});

test("GET /api/app/diagnostics/support-bundle omits the token field and redaction markers", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const monobankTokenStore = createSessionMonobankTokenStore();
    await monobankTokenStore.setToken("demo", "another-secret-DO-NOT-LEAK-abc");

    const server = createLocalApiServer({
      profile: "demo",
      source: "fixture",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 55903,
      monobankTokenStore,
    });

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/app/diagnostics/support-bundle",
      });

      assert.equal(
        response.statusCode,
        200,
        `support bundle returned ${response.statusCode}: ${response.body?.slice(0, 500)}`,
      );
      const body = response.json();

      // Redaction markers present.
      assert.equal(body.supportBundle, true);
      assert.equal(body.tokenRedacted, true);

      // Token field itself is stripped.
      assert.equal(body.token, undefined);

      // Secret never leaks even with redaction markers.
      const serialized = JSON.stringify(body);
      assert.equal(
        serialized.includes("another-secret-DO-NOT-LEAK-abc"),
        false,
        "secret token value must not appear in support bundle response",
      );
    } finally {
      await server.close();
    }
  });
});
