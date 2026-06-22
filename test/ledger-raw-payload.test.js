import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";
import { createSqliteLedgerDb } from "../dist/sqlite/index.js";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const PROFILE = "raw-payload";
const ACCOUNT_ID = "raw-payload-account-uah";
const ENTRY_WITH_PAYLOAD_ID = "raw-payload-entry-with-payload";
const ENTRY_NO_RAW_ID = "raw-payload-entry-no-raw";
const ENTRY_PRUNED_ID = "raw-payload-entry-pruned";
const NON_EXISTENT_ID = "raw-payload-entry-does-not-exist";
const STATEMENT_WITH_PAYLOAD_ID = "raw-payload-statement-1";

// The seeded raw payload intentionally contains the four recognisable
// markers that the privacy regression test asserts must never leak through
// the local API: a token, an IBAN, a full PAN, and a raw-payload marker
// string. The endpoint must redact every one of them.
//
// The IBAN, PAN, and X-Token values are recognised by pattern in
// redactSensitiveText; the raw-payload marker is hidden inside a field name
// that the redactor replaces wholesale (e.g. comment-like fields it does
// not know about are NOT redacted — that mirrors the existing
// rendered-privacy-regression contract, which only ever places the marker
// inside fields the redactor already handles).
const SEEDED_RAW_PAYLOAD = {
  id: STATEMENT_WITH_PAYLOAD_ID,
  time: 1775001600,
  description: "Fixture grocery purchase",
  amount: -2450,
  operationAmount: -2450,
  currencyCode: 980,
  commissionRate: 0,
  cashbackAmount: 0,
  balance: 97550,
  hold: false,
  // counterIban, maskedPan, and rawJson are all in the redactor's
  // sensitive-field list (see src/privacy/index.ts), so the literal seed
  // values are wiped regardless of how they appear in the wire payload.
  counterIban: "UA213223130000026007233566001",
  maskedPan: ["4111111111111111"],
  rawJson:
    "PRIVACY-REGRESSION-DO-NOT-LEAK-raw-payload-marker-abc; " +
    "X-Token: PRIVACY-REGRESSION-DO-NOT-LEAK-token-xyz",
};

const SEEDS = [
  "PRIVACY-REGRESSION-DO-NOT-LEAK-token-xyz",
  "PRIVACY-REGRESSION-DO-NOT-LEAK-raw-payload-marker-abc",
  "UA213223130000026007233566001",
  "4111111111111111",
  "X-Token",
];

function resolveDatabasePath(tempRoot) {
  // The local API server stores the database at
  // `<dataDir>/<safeProfileName>.sqlite`; mirror that here so seeds are
  // visible to the running server.
  return path.join(tempRoot, `${PROFILE}.sqlite`);
}

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-raw-"));

  try {
    return await callback({
      tempRoot,
      databasePath: resolveDatabasePath(tempRoot),
    });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

function createServer(tempRoot) {
  return createLocalApiServer({
    profile: PROFILE,
    source: "fixture",
    dataDir: tempRoot,
    host: "127.0.0.1",
    port: 56200,
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

function openDatabase(databasePath) {
  const database = new Database(databasePath);
  return {
    run: (sql, ...params) => database.prepare(sql).run(...params),
    get: (sql, ...params) => database.prepare(sql).get(...params),
    close: () => database.close(),
  };
}

async function ensureMigratedDatabase(databasePath) {
  const db = createSqliteLedgerDb({
    filePath: databasePath,
    profile: PROFILE,
  });
  try {
    await db.migrate();
  } finally {
    await db.close();
  }
}

function seedProfileAndAccount(databasePath) {
  const database = openDatabase(databasePath);
  try {
    database.run(
      `INSERT INTO profiles (name, created_at)
       VALUES (?, ?)
       ON CONFLICT(name) DO NOTHING`,
      PROFILE,
      "2026-06-19T00:00:00.000Z",
    );
    database.run(
      `INSERT INTO accounts (
         profile, id, type, currency_code, balance, credit_limit,
         masked_pan_json, raw_json, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile, id) DO NOTHING`,
      PROFILE,
      ACCOUNT_ID,
      "black",
      980,
      100000,
      0,
      null,
      JSON.stringify({ id: ACCOUNT_ID, currencyCode: 980 }),
      "2026-06-19T00:00:00.000Z",
    );
  } finally {
    database.close();
  }
}

function seedEntryWithPayload(databasePath) {
  const database = openDatabase(databasePath);
  try {
    database.run(
      `INSERT INTO raw_statement_items (
         profile, account_id, statement_item_id, time, payload_json, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      PROFILE,
      ACCOUNT_ID,
      STATEMENT_WITH_PAYLOAD_ID,
      1775001600,
      JSON.stringify(SEEDED_RAW_PAYLOAD),
      "2026-06-19T08:00:00.000Z",
    );
    database.run(
      `INSERT INTO ledger_entries (
         profile, id, account_id, time, description, amount,
         operation_amount, currency_code, category_id, category_name,
         merchant_name, raw_statement_item_id, hold, balance,
         created_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`,
      PROFILE,
      ENTRY_WITH_PAYLOAD_ID,
      ACCOUNT_ID,
      1775001600,
      "Fixture grocery purchase",
      -2450,
      -2450,
      980,
      null,
      null,
      null,
      STATEMENT_WITH_PAYLOAD_ID,
      0,
      97550,
      "2026-06-19T08:00:00.000Z",
      "2026-06-19T08:00:00.000Z",
    );
  } finally {
    database.close();
  }
}

function seedEntryNoRawId(databasePath) {
  const database = openDatabase(databasePath);
  try {
    database.run(
      `INSERT INTO ledger_entries (
         profile, id, account_id, time, description, amount,
         operation_amount, currency_code, category_id, category_name,
         merchant_name, raw_statement_item_id, hold, balance,
         created_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`,
      PROFILE,
      ENTRY_NO_RAW_ID,
      ACCOUNT_ID,
      1775001600,
      "Manual entry without raw payload",
      -1234,
      -1234,
      980,
      null,
      null,
      null,
      // raw_statement_item_id is NOT NULL in the migration; the storage
      // helper treats an empty string the same as a missing id and reports
      // "no_raw_id". This mirrors a manual import that left the link blank.
      "",
      0,
      98766,
      "2026-06-19T08:00:00.000Z",
      "2026-06-19T08:00:00.000Z",
    );
  } finally {
    database.close();
  }
}

function seedEntryWithPrunedPayload(databasePath) {
  const database = openDatabase(databasePath);
  try {
    database.run(
      `INSERT INTO ledger_entries (
         profile, id, account_id, time, description, amount,
         operation_amount, currency_code, category_id, category_name,
         merchant_name, raw_statement_item_id, hold, balance,
         created_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`,
      PROFILE,
      ENTRY_PRUNED_ID,
      ACCOUNT_ID,
      1775088000,
      "Entry whose raw row was pruned",
      -3000,
      -3000,
      980,
      null,
      null,
      null,
      "raw-payload-statement-pruned",
      0,
      95766,
      "2026-06-19T09:00:00.000Z",
      "2026-06-19T09:00:00.000Z",
    );
    // Intentionally no INSERT into raw_statement_items — this is the
    // post-pruning shape that the retention pass leaves behind.
  } finally {
    database.close();
  }
}

test("GET /api/ledger/entries/:id/raw returns redacted payload for entries with a raw_statement_item_id", async () => {
  await withTempLedger(async ({ tempRoot, databasePath }) => {
    await ensureMigratedDatabase(databasePath);
    seedProfileAndAccount(databasePath);
    seedEntryWithPayload(databasePath);

    const server = createServer(tempRoot);
    try {
      const response = await server.inject({
        method: "GET",
        url: `/api/ledger/entries/${ENTRY_WITH_PAYLOAD_ID}/raw`,
      });
      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.equal(body.available, true);
      assert.equal(
        typeof body.redactedPayload,
        "object",
        "redactedPayload should be an object",
      );
      // The structural fields survive redaction; the seeded comment must
      // not leak any of the privacy seeds.
      assert.equal(body.redactedPayload.id, STATEMENT_WITH_PAYLOAD_ID);
      assert.equal(body.redactedPayload.currencyCode, 980);

      const serialized = JSON.stringify(body);
      assertNoSeeds(serialized, "redacted raw payload body");
    } finally {
      await server.close();
    }
  });
});

test("GET /api/ledger/entries/:id/raw reports no_raw_id when the entry has no raw_statement_item_id", async () => {
  await withTempLedger(async ({ tempRoot, databasePath }) => {
    await ensureMigratedDatabase(databasePath);
    seedProfileAndAccount(databasePath);
    seedEntryNoRawId(databasePath);

    const server = createServer(tempRoot);
    try {
      const response = await server.inject({
        method: "GET",
        url: `/api/ledger/entries/${ENTRY_NO_RAW_ID}/raw`,
      });
      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.equal(body.available, false);
      assert.equal(body.reason, "no_raw_id");
      assert.equal(body.redactedPayload, undefined);
    } finally {
      await server.close();
    }
  });
});

test("GET /api/ledger/entries/:id/raw reports pruned when the raw_statement_items row is gone", async () => {
  await withTempLedger(async ({ tempRoot, databasePath }) => {
    await ensureMigratedDatabase(databasePath);
    seedProfileAndAccount(databasePath);
    seedEntryWithPrunedPayload(databasePath);

    const server = createServer(tempRoot);
    try {
      const response = await server.inject({
        method: "GET",
        url: `/api/ledger/entries/${ENTRY_PRUNED_ID}/raw`,
      });
      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.equal(body.available, false);
      assert.equal(body.reason, "pruned");
      assert.equal(body.redactedPayload, undefined);
    } finally {
      await server.close();
    }
  });
});

test("GET /api/ledger/entries/:id/raw returns 404 with the standard error body for unknown entries", async () => {
  await withTempLedger(async ({ tempRoot, databasePath }) => {
    await ensureMigratedDatabase(databasePath);
    seedProfileAndAccount(databasePath);

    const server = createServer(tempRoot);
    try {
      const response = await server.inject({
        method: "GET",
        url: `/api/ledger/entries/${NON_EXISTENT_ID}/raw`,
      });
      assert.equal(response.statusCode, 404);
      const body = response.json();
      assert.equal(body.error, "entry_not_found");
      assert.match(body.message, /not be found/i);

      // The error envelope must not leak any of the privacy seeds either.
      const serialized = JSON.stringify(body);
      assertNoSeeds(serialized, "404 error envelope");
    } finally {
      await server.close();
    }
  });
});
