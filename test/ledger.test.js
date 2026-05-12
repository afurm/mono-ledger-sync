import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createLedgerExport,
  exportPresetDefinitions,
} from "../dist/exports/index.js";
import { createBundledFixtureMonobankAdapter } from "../dist/monobank/index.js";
import { createLocalApiServer } from "../dist/server/index.js";
import { createSqliteLedgerDb } from "../dist/sqlite/index.js";
import {
  categorizeStatementItem,
  createStatementSyncWindows,
  monobankPersonalStatementWindowMaxSeconds,
  syncLedgerWithMonobank,
} from "../dist/sync/index.js";

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-db-"));

  try {
    return await callback({
      tempRoot,
      databasePath: path.join(tempRoot, "ledger.sqlite"),
    });
  } finally {
    await rm(tempRoot, {
      force: true,
      recursive: true,
    });
  }
}

test("syncs bundled fixture statements into a local SQLite ledger", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      const result = await syncLedgerWithMonobank({
        profile,
        source: "fixture",
        adapter: await createBundledFixtureMonobankAdapter(),
        db,
      });
      const accounts = await db.listAccounts(profile);
      const transactions = await db.listLedgerEntries({
        profile,
        limit: 20,
      });

      assert.equal(result.run.status, "success");
      assert.equal(result.run.itemsSeen, 7);
      assert.equal(result.summary.ledgerEntries, 7);
      assert.equal(accounts.length, 2);
      assert.equal(transactions.total, 7);
      assert.ok(
        transactions.entries.some((entry) => {
          return (
            entry.rawStatementItemId === "fixture-stmt-2026-04-02-silpo" &&
            entry.categoryId === "groceries"
          );
        }),
      );
    } finally {
      await db.close();
    }
  });
});

test("splits statement windows without exceeding the Monobank personal cap", () => {
  assert.deepEqual(createStatementSyncWindows(10, 25, 10), [
    { from: 10, to: 20 },
    { from: 21, to: 25 },
  ]);
  assert.deepEqual(
    createStatementSyncWindows(
      0,
      monobankPersonalStatementWindowMaxSeconds + 5,
    ),
    [
      { from: 0, to: monobankPersonalStatementWindowMaxSeconds },
      {
        from: monobankPersonalStatementWindowMaxSeconds + 1,
        to: monobankPersonalStatementWindowMaxSeconds + 5,
      },
    ],
  );
});

test("categorizes statement items by stable built-in rules", () => {
  const baseItem = {
    id: "fixture-category-test",
    time: 1775001600,
    description: "Unknown expense",
    mcc: 9999,
    originalMcc: 9999,
    amount: -1000,
    operationAmount: -1000,
    currencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 100000,
    hold: false,
  };

  assert.deepEqual(categorizeStatementItem({ ...baseItem, amount: 1000 }), {
    categoryId: "income",
    categoryName: "Income",
  });
  assert.deepEqual(categorizeStatementItem({ ...baseItem, mcc: 5411 }), {
    categoryId: "groceries",
    categoryName: "Groceries",
  });
  assert.deepEqual(
    categorizeStatementItem({
      ...baseItem,
      description: "Streaming subscription",
      mcc: 5734,
    }),
    {
      categoryId: "subscriptions",
      categoryName: "Subscriptions",
    },
  );
  assert.deepEqual(categorizeStatementItem(baseItem), {
    categoryId: "uncategorized",
    categoryName: "Uncategorized",
  });
});

test("syncs a selected account and advances only that account cursor", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      const result = await syncLedgerWithMonobank({
        profile,
        source: "fixture",
        adapter: await createBundledFixtureMonobankAdapter(),
        db,
        accountIds: ["fixture-account-eur-savings"],
        from: 1775001600,
        to: 1777593599,
        sliceSeconds: 100_000,
      });
      const transactions = await db.listLedgerEntries({
        profile,
        limit: 20,
      });
      const selectedCursor = await db.getSyncCursor(
        profile,
        "fixture-account-eur-savings",
      );
      const skippedCursor = await db.getSyncCursor(
        profile,
        "fixture-account-uah-main",
      );

      assert.equal(result.run.status, "success");
      assert.equal(result.run.itemsSeen, 2);
      assert.equal(result.accounts.length, 1);
      assert.equal(result.accounts[0].accountId, "fixture-account-eur-savings");
      assert.equal(result.accounts[0].windowsFetched, 26);
      assert.equal(transactions.total, 2);
      assert.equal(selectedCursor?.statementTo, 1777593599);
      assert.equal(skippedCursor, undefined);
    } finally {
      await db.close();
    }
  });
});

test("previews sync work without writing ledger data in dry-run mode", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      const result = await syncLedgerWithMonobank({
        profile,
        source: "fixture",
        adapter: await createBundledFixtureMonobankAdapter(),
        db,
        dryRun: true,
        accountIds: ["fixture-account-uah-main"],
        from: 1775001600,
        to: 1777593599,
        sliceSeconds: 1_000_000,
      });
      const info = await db.getDatabaseInfo(profile);

      assert.equal(result.dryRun, true);
      assert.equal(result.run.status, "success");
      assert.equal(result.run.itemsSeen, 5);
      assert.equal(result.run.itemsInserted, 0);
      assert.equal(result.stats.apiCalls, 5);
      assert.equal(result.stats.windowsFetched, 3);
      assert.equal(result.stats.itemsSeen, 5);
      assert.equal(info.accounts, 0);
      assert.equal(info.ledgerEntries, 0);
      assert.equal(info.syncRuns, 0);
    } finally {
      await db.close();
    }
  });
});

test("exports synced ledger entries as CSV and JSON", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await syncLedgerWithMonobank({
        profile,
        source: "fixture",
        adapter: await createBundledFixtureMonobankAdapter(),
        db,
      });

      const csv = await createLedgerExport(db, {
        profile,
        format: "csv",
      });
      const json = await createLedgerExport(db, {
        profile,
        format: "json",
      });
      const secondJson = await createLedgerExport(db, {
        profile,
        format: "json",
      });
      const jsonl = await createLedgerExport(db, {
        profile,
        format: "jsonl",
        accountIds: ["fixture-account-eur-savings"],
      });
      const journal = await createLedgerExport(db, {
        profile,
        preset: "accountant-handoff",
      });
      const parsed = JSON.parse(json.body);
      const jsonlRows = jsonl.body
        .split("\n")
        .filter(Boolean)
        .map((row) => JSON.parse(row));

      assert.equal(csv.contentType, "text/csv; charset=utf-8");
      assert.match(csv.body, /fixture-stmt-2026-04-01-salary/);
      assert.match(csv.fileName, /^mono-ledger-demo-csv\.csv$/);
      assert.equal(json.body, secondJson.body);
      assert.equal(parsed.format, "json");
      assert.deepEqual(parsed.filters, {});
      assert.equal(parsed.exportedAt, undefined);
      assert.equal(parsed.total, 7);
      assert.equal(parsed.entries.length, 7);
      assert.equal(jsonl.contentType, "application/x-ndjson; charset=utf-8");
      assert.match(
        jsonl.fileName,
        /^mono-ledger-demo-jsonl-account-fixture-account-eur-savings\.jsonl$/,
      );
      assert.equal(jsonlRows.length, 2);
      assert.ok(
        jsonlRows.every(
          (entry) => entry.accountId === "fixture-account-eur-savings",
        ),
      );
      assert.equal(journal.contentType, "text/csv; charset=utf-8");
      assert.match(
        journal.fileName,
        /^mono-ledger-demo-accountant-handoff\.csv$/,
      );
      assert.match(
        journal.body,
        /^date,accountId,description,debit,credit,currencyCode,category,merchant,sourceId/,
      );
      assert.match(journal.body, /Salary payment/);
      assert.equal(
        exportPresetDefinitions["raw-transaction-archive"].format,
        "jsonl",
      );
    } finally {
      await db.close();
    }
  });
});

test("local API runs fixture sync and exposes ledger data", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createLocalApiServer({
      profile: "demo",
      source: "fixture",
      dataDir: tempRoot,
    });

    try {
      const syncResponse = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });
      const summaryResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/summary",
      });
      const transactionsResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?search=Silpo",
      });
      const merchantResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?merchantName=Metro",
      });
      const holdResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?status=hold",
      });
      const amountResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?amountMin=0",
      });
      const exportResponse = await server.inject({
        method: "GET",
        url: "/api/exports/ledger?format=jsonl&categoryId=groceries",
      });
      const syncRunsResponse = await server.inject({
        method: "GET",
        url: "/api/sync/runs",
      });
      const syncBody = syncResponse.json();

      assert.equal(syncResponse.statusCode, 200);
      assert.equal(syncBody.run.status, "success");
      assert.equal(syncBody.accounts.length, 2);
      assert.equal(syncBody.stats.itemsSeen, 7);
      assert.equal(summaryResponse.statusCode, 200);
      assert.equal(summaryResponse.json().ledgerEntries, 7);
      assert.equal(transactionsResponse.statusCode, 200);
      assert.equal(transactionsResponse.json().total, 1);
      assert.equal(merchantResponse.statusCode, 200);
      assert.equal(merchantResponse.json().total, 1);
      assert.equal(holdResponse.statusCode, 200);
      assert.equal(holdResponse.json().entries[0].hold, true);
      assert.equal(amountResponse.statusCode, 200);
      assert.equal(amountResponse.json().total, 2);
      assert.equal(exportResponse.statusCode, 200);
      assert.match(exportResponse.body, /fixture-stmt-2026-04-02-silpo/);
      assert.equal(syncRunsResponse.statusCode, 200);
      assert.equal(syncRunsResponse.json()[0].id, syncBody.run.id);
    } finally {
      await server.close();
    }
  });
});

test("local API validates query strings and webhook payloads", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createLocalApiServer({
      profile: "demo",
      source: "fixture",
      dataDir: tempRoot,
    });
    const webhookEvent = {
      type: "StatementItem",
      data: {
        account: "fixture-account-uah-main",
        statementItem: {
          id: "fixture-webhook-validation-test",
          time: 1775031300,
          description: "Validation test transfer",
          mcc: 4829,
          originalMcc: 4829,
          amount: -2500,
          operationAmount: -2500,
          currencyCode: 980,
          commissionRate: 0,
          cashbackAmount: 0,
          balance: 97000,
          hold: false,
        },
      },
    };

    try {
      const invalidLimitResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?limit=not-a-number",
      });
      const invalidStatusResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?status=unknown",
      });
      const unsupportedFormatResponse = await server.inject({
        method: "GET",
        url: "/api/exports/ledger?format=sqlite",
      });
      const unsupportedPresetResponse = await server.inject({
        method: "GET",
        url: "/api/exports/ledger?preset=unknown",
      });
      const webhookResponse = await server.inject({
        method: "POST",
        url: "/api/webhooks/monobank",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(webhookEvent),
      });
      const invalidWebhookResponse = await server.inject({
        method: "POST",
        url: "/api/webhooks/monobank",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...webhookEvent,
          data: {
            ...webhookEvent.data,
            statementItem: {
              ...webhookEvent.data.statementItem,
              hold: undefined,
            },
          },
        }),
      });
      const webhookBody = webhookResponse.json();

      assert.equal(invalidLimitResponse.statusCode, 400);
      assert.match(invalidLimitResponse.body, /limit/);
      assert.equal(invalidStatusResponse.statusCode, 400);
      assert.match(invalidStatusResponse.body, /status/);
      assert.equal(unsupportedFormatResponse.statusCode, 400);
      assert.deepEqual(unsupportedFormatResponse.json(), {
        error: "unsupported_export_format",
        message: "Supported export formats: csv, json, jsonl, journal-csv",
      });
      assert.equal(unsupportedPresetResponse.statusCode, 400);
      assert.deepEqual(unsupportedPresetResponse.json(), {
        error: "unsupported_export_preset",
        message:
          "Supported export presets: accountant-handoff, monthly-personal-finance, bookkeeping, budget-analysis, raw-transaction-archive",
      });
      assert.equal(webhookResponse.statusCode, 200);
      assert.equal(webhookBody.accepted, true);
      assert.equal(webhookBody.pullRequired, true);
      assert.equal(webhookBody.event.accountId, "fixture-account-uah-main");
      assert.equal(
        webhookBody.event.statementItemId,
        "fixture-webhook-validation-test",
      );
      assert.equal(invalidWebhookResponse.statusCode, 400);
      assert.match(invalidWebhookResponse.body, /hold/);
    } finally {
      await server.close();
    }
  });
});
