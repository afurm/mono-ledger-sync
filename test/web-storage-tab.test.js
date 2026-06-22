import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";

const SEEDED_TOKEN = "PRIVACY-REGRESSION-DO-NOT-LEAK-token-xyz";
const SEEDED_IBAN = "UA213223130000026007233566001";
const SEEDED_CARD = "4111111111111111";
const SEEDED_RAW_PAYLOAD =
  "PRIVACY-REGRESSION-DO-NOT-LEAK-raw-payload-marker-abc";

const SEEDS = [
  SEEDED_TOKEN,
  SEEDED_IBAN,
  SEEDED_CARD,
  SEEDED_RAW_PAYLOAD,
  "X-Token",
];

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-storage-"));

  try {
    return await callback({ tempRoot });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

function createServer(tempRoot) {
  return createLocalApiServer({
    profile: "storage-tab",
    source: "fixture",
    dataDir: tempRoot,
    host: "127.0.0.1",
    port: 56300,
    monobankTokenStore: createSessionMonobankTokenStore(),
  });
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

test("GET /api/app/storage returns the fields the Sync Storage tab consumes", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    // Seed the token in the session store so diagnostics etc. would see
    // it, but the storage endpoint should never echo it back.
    const tokenStore = createSessionMonobankTokenStore();
    await tokenStore.setToken("storage-tab", SEEDED_TOKEN);

    const server = createLocalApiServer({
      profile: "storage-tab",
      source: "fixture",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 56300,
      monobankTokenStore: tokenStore,
    });

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/app/storage",
      });
      assert.equal(response.statusCode, 200);
      const body = response.json();

      // Every field the new SyncStorageTab UI reads.
      assert.equal(typeof body.profile, "string");
      assert.equal(typeof body.dataDir, "string");
      assert.equal(typeof body.databasePath, "string");
      assert.equal(typeof body.databaseBytes, "number");
      assert.equal(
        body.databaseModifiedAt === undefined ||
          typeof body.databaseModifiedAt === "string",
        true,
        "databaseModifiedAt must be a string when present",
      );
      assert.equal(typeof body.integrityCheck, "string");
      assert.equal(typeof body.pageCount, "number");
      assert.equal(typeof body.pageSize, "number");
      assert.ok(Array.isArray(body.migrations));
      assert.equal(typeof body.accounts, "number");
      assert.equal(typeof body.ledgerEntries, "number");
      assert.equal(typeof body.syncRuns, "number");
      assert.equal(typeof body.webhookEvents, "number");
      assert.equal(typeof body.backupDirectory, "string");
      assert.ok(Array.isArray(body.backups));

      // The four recognisable privacy seeds must not appear anywhere
      // in the storage snapshot, even when the user has a token in the
      // session store.
      const serialized = JSON.stringify(body);
      assertNoSeeds(serialized, "GET /api/app/storage");
    } finally {
      await server.close();
    }
  });
});

test("POST /api/app/storage/backup returns the new backup path and updates the snapshot", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createServer(tempRoot);
    try {
      const backup = await server.inject({
        method: "POST",
        url: "/api/app/storage/backup",
      });
      assert.equal(backup.statusCode, 200);
      const body = backup.json();
      assert.equal(typeof body.backupPath, "string");
      assert.ok(body.backupPath.length > 0);

      const serialized = JSON.stringify(body);
      assertNoSeeds(serialized, "POST /api/app/storage/backup");
    } finally {
      await server.close();
    }
  });
});
