import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import {
  createLedgerExport,
  createLocalConfigurationExport,
  createSqliteSnapshotExport,
  exportPresetDefinitions,
} from "../dist/exports/index.js";
import { parquetMetadataAsync, parquetReadObjects } from "hyparquet";
import {
  createBundledFixtureMonobankAdapter,
  loadMonobankFixtureSet,
} from "../dist/monobank/index.js";
import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";
import { createSqliteLedgerDb } from "../dist/sqlite/index.js";
import {
  categorizeStatementItem,
  createStatementSyncWindows,
  createLedgerEntryFromStatementItem,
  createProcessSignalAbortController,
  monobankPersonalStatementWindowMaxSeconds,
  syncLedgerWithMonobank,
} from "../dist/sync/index.js";
import { DomainError } from "../dist/domain/index.js";
import {
  createMonobankMockHttpHandler,
  withMockMonobankServer,
} from "./monobank-mock-server.js";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

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

async function withLegacyFirstMigrationDb(callback, options = {}) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-legacy-db-"));

  try {
    const databasePath = path.join(tempRoot, "legacy.sqlite");
    const database = new Database(databasePath);

    try {
      database.exec(`
        CREATE TABLE schema_migrations (
          id TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );

        CREATE TABLE profiles (
          name TEXT PRIMARY KEY,
          created_at TEXT NOT NULL
        );

        CREATE TABLE accounts (
          profile TEXT NOT NULL,
          id TEXT NOT NULL,
          type TEXT NOT NULL,
          currency_code INTEGER NOT NULL,
          balance INTEGER NOT NULL,
          credit_limit INTEGER NOT NULL,
          masked_pan_json TEXT,
          raw_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (profile, id),
          FOREIGN KEY (profile) REFERENCES profiles(name)
        );

        CREATE TABLE jars (
          profile TEXT NOT NULL,
          id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          currency_code INTEGER NOT NULL,
          balance INTEGER NOT NULL,
          goal INTEGER NOT NULL,
          raw_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (profile, id),
          FOREIGN KEY (profile) REFERENCES profiles(name)
        );

        CREATE TABLE currency_rates (
          profile TEXT NOT NULL,
          currency_code_a INTEGER NOT NULL,
          currency_code_b INTEGER NOT NULL,
          date INTEGER NOT NULL,
          rate_buy REAL,
          rate_sell REAL,
          rate_cross REAL,
          raw_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (profile, currency_code_a, currency_code_b, date),
          FOREIGN KEY (profile) REFERENCES profiles(name)
        );

        CREATE TABLE raw_statement_items (
          profile TEXT NOT NULL,
          account_id TEXT NOT NULL,
          statement_item_id TEXT NOT NULL,
          time INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (profile, account_id, statement_item_id),
          FOREIGN KEY (profile) REFERENCES profiles(name)
        );

        CREATE TABLE ledger_entries (
          profile TEXT NOT NULL,
          id TEXT NOT NULL,
          account_id TEXT NOT NULL,
          time INTEGER NOT NULL,
          description TEXT NOT NULL,
          amount INTEGER NOT NULL,
          operation_amount INTEGER,
          currency_code INTEGER NOT NULL,
          category_id TEXT,
          category_name TEXT,
          merchant_name TEXT,
          raw_statement_item_id TEXT NOT NULL,
          hold INTEGER NOT NULL,
          balance INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (profile, id),
          UNIQUE (profile, account_id, raw_statement_item_id),
          FOREIGN KEY (profile) REFERENCES profiles(name)
        );

        CREATE TABLE sync_cursors (
          profile TEXT NOT NULL,
          account_id TEXT NOT NULL,
          source TEXT NOT NULL,
          statement_from INTEGER NOT NULL,
          statement_to INTEGER NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (profile, account_id, source),
          FOREIGN KEY (profile) REFERENCES profiles(name)
        );

        CREATE TABLE sync_runs (
          id TEXT PRIMARY KEY,
          profile TEXT NOT NULL,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          items_seen INTEGER NOT NULL,
          items_inserted INTEGER NOT NULL,
          items_updated INTEGER NOT NULL,
          items_skipped INTEGER NOT NULL,
          FOREIGN KEY (profile) REFERENCES profiles(name)
        );

        CREATE TABLE webhook_events (
          id TEXT PRIMARY KEY,
          profile TEXT NOT NULL,
          account_id TEXT NOT NULL,
          type TEXT NOT NULL,
          statement_item_id TEXT,
          received_at TEXT NOT NULL,
          processed_at TEXT,
          payload_json TEXT NOT NULL,
          FOREIGN KEY (profile) REFERENCES profiles(name)
        );

        CREATE INDEX idx_ledger_entries_profile_time
          ON ledger_entries(profile, time DESC);
        CREATE INDEX idx_ledger_entries_profile_account
          ON ledger_entries(profile, account_id, time DESC);
        CREATE INDEX idx_sync_runs_profile_started
          ON sync_runs(profile, started_at DESC);
      `);

      database.exec(`INSERT INTO schema_migrations (
        id,
        description,
        applied_at
      ) VALUES (
        '0001_local_ledger',
        'Create local ledger tables',
        '2026-05-16T08:00:00.000Z'
      )`);
      database.exec(`INSERT INTO profiles (name, created_at)
        VALUES ('legacy', '2026-05-16T08:00:00.000Z')`);
      database.exec(`
        INSERT INTO accounts (
          profile, id, type, currency_code, balance, credit_limit,
          masked_pan_json, raw_json, updated_at
        ) VALUES (
          'legacy',
          'legacy-account-uah-main',
          'black',
          980,
          100000,
          0,
          NULL,
          '{"fixture":"legacy"}',
          '2026-05-16T08:00:00.000Z'
        )`);

      if (options.seedLedger) {
        database.exec(`
          INSERT INTO raw_statement_items (
            profile, account_id, statement_item_id, time, payload_json, updated_at
          ) VALUES
            (
              'legacy',
              'legacy-account-uah-main',
              'legacy-statement-1',
              1775001600,
              '{"id":"legacy-statement-1","time":1775001600,"description":"Fixture Grocery LLC","amount":-2450,"operationAmount":-2450,"currencyCode":980,"commissionRate":0,"cashbackAmount":0,"balance":97550,"hold":false}',
              '2026-05-16T08:01:00.000Z'
            ),
            (
              'legacy',
              'legacy-account-uah-main',
              'legacy-statement-2',
              1775088000,
              '{"id":"legacy-statement-2","time":1775088000,"description":"Fixture Salary","amount":500000,"operationAmount":500000,"currencyCode":980,"commissionRate":0,"cashbackAmount":0,"balance":597550,"hold":false}',
              '2026-05-16T08:02:00.000Z'
            );

          INSERT INTO ledger_entries (
            profile, id, account_id, time, description, amount,
            operation_amount, currency_code, category_id, category_name,
            merchant_name, raw_statement_item_id, hold, balance, created_at, updated_at
          ) VALUES
            (
              'legacy',
              'legacy-entry-grocery',
              'legacy-account-uah-main',
              1775001600,
              'Fixture Grocery LLC',
              -2450,
              -2450,
              980,
              'groceries',
              'Groceries',
              'Fixture Grocery LLC',
              'legacy-statement-1',
              0,
              97550,
              '2026-05-16T08:01:00.000Z',
              '2026-05-16T08:01:00.000Z'
            ),
            (
              'legacy',
              'legacy-entry-income',
              'legacy-account-uah-main',
              1775088000,
              'Fixture Salary',
              500000,
              500000,
              980,
              'income',
              'Income',
              'Fixture Employer',
              'legacy-statement-2',
              0,
              597550,
              '2026-05-16T08:02:00.000Z',
              '2026-05-16T08:02:00.000Z'
            );

          INSERT INTO sync_cursors (
            profile, account_id, source, statement_from, statement_to, updated_at
          ) VALUES (
            'legacy',
            'legacy-account-uah-main',
            'fixture',
            1775001600,
            1775088000,
            '2026-05-16T08:03:00.000Z'
          );

          INSERT INTO sync_runs (
            id, profile, source, status, started_at, finished_at,
            items_seen, items_inserted, items_updated, items_skipped
          ) VALUES (
            'legacy-sync-run-1',
            'legacy',
            'fixture',
            'success',
            '2026-05-16T08:00:00.000Z',
            '2026-05-16T08:03:00.000Z',
            2,
            2,
            0,
            0
          );
        `);
      }

      return await callback({ tempRoot, databasePath });
    } finally {
      database.close();
    }
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
      const reviewedRows = await db.updateLedgerEntriesBulkEdit(
        profile,
        [transactions.entries[0].id],
        {
          reviewState: "reviewed",
          reviewedSource: "test",
        },
      );
      const needsReviewTransactions = await db.listLedgerEntries({
        profile,
        reviewState: "needs_review",
        limit: 20,
      });
      const explicitlyReviewedTransactions = await db.listLedgerEntries({
        profile,
        reviewState: "reviewed",
        limit: 20,
      });
      const merchants = await db.listMerchants(profile);
      const annotated = await db.updateLedgerEntryAnnotation(
        profile,
        transactions.entries[0].id,
        {
          note: "Review with accountant",
          tags: ["tax", "tax", "  reimbursable "],
        },
      );
      const noteOnlyUpdate = await db.updateLedgerEntryAnnotation(
        profile,
        transactions.entries[0].id,
        {
          note: "Updated review note",
        },
      );
      const emptyUpdate = await db.updateLedgerEntryAnnotation(
        profile,
        transactions.entries[0].id,
        {},
      );
      const splitPlanFirst = await db.updateLedgerEntrySplitPlan(
        profile,
        transactions.entries[0].id,
        {
          lines: [
            {
              category: "Groceries",
              amount: -1200,
            },
            {
              category: "Coffee",
              amount: 100,
            },
          ],
        },
      );
      const splitPlanChanged = await db.updateLedgerEntrySplitPlan(
        profile,
        transactions.entries[0].id,
        {
          lines: [
            {
              category: "Groceries",
              amount: -1100,
            },
            {
              category: "Coffee",
              amount: 200,
            },
          ],
        },
      );
      const splitPlanCleared = await db.updateLedgerEntrySplitPlan(
        profile,
        transactions.entries[0].id,
        {
          lines: [],
        },
      );
      const annotatedTransactions = await db.listLedgerEntries({
        profile,
        search: "reimbursable",
        limit: 20,
      });
      const tags = await db.listTags(profile);

      assert.equal(result.run.status, "success");
      assert.equal(result.run.itemsSeen, 7);
      assert.equal(result.summary.ledgerEntries, 7);
      assert.equal(accounts.length, 2);
      assert.equal(transactions.total, 7);
      assert.equal(transactions.entries[0].reviewState, "needs_review");
      assert.equal(reviewedRows[0].reviewState, "reviewed");
      assert.equal(reviewedRows[0].reviewedSource, "test");
      assert.ok(reviewedRows[0].reviewedAt);
      assert.equal(needsReviewTransactions.total, 6);
      assert.equal(explicitlyReviewedTransactions.total, 1);
      assert.equal(
        explicitlyReviewedTransactions.entries[0].id,
        transactions.entries[0].id,
      );
      assert.equal(merchants.length > 0, true);
      assert.ok(
        merchants.some((merchant) => merchant.name === "Fixture Grocery LLC"),
      );
      assert.equal(
        merchants.every(
          (merchant) => merchant.normalizedName === merchant.name.toLowerCase(),
        ),
        true,
      );
      assert.ok(
        transactions.entries.some((entry) => {
          return (
            entry.rawStatementItemId === "fixture-stmt-2026-04-02-silpo" &&
            entry.merchantName === "Fixture Grocery LLC" &&
            entry.categoryId === "groceries"
          );
        }),
      );
      assert.equal(annotated.note, "Review with accountant");
      assert.equal(annotated.reviewState, "reviewed");
      assert.deepEqual(annotated.tags, ["tax", "reimbursable"]);
      assert.deepEqual(
        tags.map((tag) => tag.name),
        ["reimbursable", "tax"],
      );
      assert.equal(noteOnlyUpdate.note, "Updated review note");
      assert.deepEqual(noteOnlyUpdate.tags, ["tax", "reimbursable"]);
      assert.equal(emptyUpdate.updatedAt, noteOnlyUpdate.updatedAt);
      assert.deepEqual(splitPlanFirst.splitPlan, [
        { category: "Groceries", amount: -1200 },
        { category: "Coffee", amount: 100 },
      ]);
      assert.deepEqual(splitPlanChanged.splitPlan, [
        { category: "Groceries", amount: -1100 },
        { category: "Coffee", amount: 200 },
      ]);
      assert.equal(splitPlanCleared.splitPlan, undefined);
      assert.equal(annotatedTransactions.total, 1);
    } finally {
      await db.close();
    }
  });
});

test("syncs statement items without external IDs using deterministic fingerprints", async () => {
  const fixtureSet = await loadMonobankFixtureSet();
  const account = fixtureSet.clientInfo.accounts[0];
  const windowStatementItem = {
    ...fixtureSet.statements[account.id][0],
    id: undefined,
  };
  const adapter = {
    async getClientInfo() {
      return fixtureSet.clientInfo;
    },
    async getStatement(window) {
      if (window.accountId !== account.id) {
        return [];
      }

      if (
        windowStatementItem.time >= window.from &&
        windowStatementItem.time <= window.to
      ) {
        return [windowStatementItem];
      }

      return [];
    },
    async getCurrency() {
      return fixtureSet.currencyRates;
    },
    async setWebhook() {
      return undefined;
    },
  };

  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      const firstRun = await syncLedgerWithMonobank({
        profile,
        source: "monobank",
        adapter,
        db,
        accountIds: [account.id],
        from: windowStatementItem.time,
        to: windowStatementItem.time,
      });
      const firstEntries = await db.listLedgerEntries({
        profile,
        limit: 20,
      });

      assert.equal(firstRun.run.status, "success");
      assert.equal(firstRun.accounts.length, 1);
      assert.equal(firstRun.accounts[0].writeStats.inserted, 1);
      assert.equal(firstEntries.total, 1);
      assert.match(
        firstEntries.entries[0].rawStatementItemId,
        /^missing-id:[0-9a-f]{64}$/,
      );

      const secondRun = await syncLedgerWithMonobank({
        profile,
        source: "monobank",
        adapter,
        db,
        accountIds: [account.id],
        from: windowStatementItem.time,
        to: windowStatementItem.time,
      });
      const secondEntries = await db.listLedgerEntries({
        profile,
        limit: 20,
      });

      assert.equal(secondRun.accounts.length, 1);
      assert.equal(secondRun.accounts[0].writeStats.inserted, 0);
      assert.equal(secondRun.accounts[0].writeStats.updated, 0);
      assert.equal(secondRun.accounts[0].writeStats.skipped, 1);
      assert.equal(secondEntries.total, 1);
    } finally {
      await db.close();
    }
  });
});

test("creates stable raw IDs from deterministic statement-item fingerprinting", () => {
  const accountId = "fixture-account-uah-main";
  const baseItem = {
    time: 1_775_001_600,
    description: "Test purchase",
    mcc: 5812,
    originalMcc: 5812,
    amount: -1200,
    operationAmount: -1200,
    currencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 120_000,
    hold: false,
    comment: undefined,
    receiptId: undefined,
  };
  const firstEntry = createLedgerEntryFromStatementItem(accountId, {
    ...baseItem,
  });
  const secondEntry = createLedgerEntryFromStatementItem(accountId, {
    ...baseItem,
    comment: "",
    receiptId: "",
    invoiceId: "",
    counterName: "",
    counterEdrpou: "",
    counterIban: "",
  });

  assert.match(
    firstEntry.id,
    /^fixture-account-uah-main:missing-id:[0-9a-f]{64}$/,
  );
  assert.equal(firstEntry.rawStatementItemId, secondEntry.rawStatementItemId);
  assert.equal(firstEntry.id, secondEntry.id);
});

test("stores idempotent statement payload writes in raw storage", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const accountId = "fixture-account-uah-main";
      const statementItem = {
        id: undefined,
        time: 1_775_001_600,
        description: "Test purchase",
        mcc: 5812,
        originalMcc: 5812,
        amount: -1200,
        operationAmount: -1200,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 120_000,
        hold: false,
      };
      const entry = createLedgerEntryFromStatementItem(
        accountId,
        statementItem,
      );

      const firstRun = await db.upsertStatementItems(
        accountId,
        [statementItem],
        [entry],
      );
      const secondRun = await db.upsertStatementItems(
        accountId,
        [statementItem],
        [entry],
      );
      const ledgerItems = await db.listLedgerEntries({
        profile,
        limit: 20,
      });

      assert.equal(firstRun.inserted, 1);
      assert.equal(firstRun.updated, 0);
      assert.equal(firstRun.skipped, 0);
      assert.equal(secondRun.inserted, 0);
      assert.equal(secondRun.updated, 0);
      assert.equal(secondRun.skipped, 1);
      assert.equal(ledgerItems.total, 1);
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

test("continues Monobank statement paging when a window returns 500 items", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const accountId = "live-account-uah-main";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });
    const statementItems = Array.from({ length: 501 }, (_value, index) => {
      const time = index + 1;

      return {
        id: `live-statement-${String(time).padStart(3, "0")}`,
        time,
        description: `Live statement ${time}`,
        mcc: 5411,
        originalMcc: 5411,
        amount: -100 - time,
        operationAmount: -100 - time,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 100_000 - time,
        hold: false,
      };
    });
    const statementWindows = [];
    const adapter = {
      async getClientInfo() {
        return {
          clientId: "live-client",
          name: "Live Client",
          accounts: [
            {
              id: accountId,
              sendId: "live-send",
              balance: 100_000,
              creditLimit: 0,
              type: "black",
              currencyCode: 980,
              maskedPan: ["537541******1234"],
              iban: "UA733220010000026201234567890",
            },
          ],
          jars: [],
        };
      },
      async getCurrency() {
        return [];
      },
      async getStatement(window) {
        statementWindows.push(window);

        return statementItems
          .filter((item) => item.time >= window.from && item.time <= window.to)
          .sort((left, right) => right.time - left.time)
          .slice(0, 500);
      },
      async setWebhook() {
        return undefined;
      },
    };

    try {
      const result = await syncLedgerWithMonobank({
        profile,
        source: "monobank",
        adapter,
        db,
        accountIds: [accountId],
        from: 1,
        to: 501,
      });
      const transactions = await db.listLedgerEntries({
        profile,
        limit: 1_000,
      });
      const cursor = await db.getSyncCursor(profile, accountId);

      assert.equal(result.run.status, "success");
      assert.equal(result.run.itemsSeen, 501);
      assert.equal(result.stats.apiCalls, 4);
      assert.equal(result.stats.windowsFetched, 2);
      assert.equal(result.accounts[0].windowsFetched, 2);
      assert.equal(transactions.total, 501);
      assert.equal(cursor?.statementTo, 501);
      assert.deepEqual(statementWindows, [
        { accountId, from: 1, to: 501 },
        { accountId, from: 1, to: 1 },
      ]);
    } finally {
      await db.close();
    }
  });
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
  assert.deepEqual(categorizeStatementItem({ ...baseItem, mcc: 4900 }), {
    categoryId: "utilities",
    categoryName: "Utilities",
  });
  assert.deepEqual(categorizeStatementItem({ ...baseItem, mcc: 5912 }), {
    categoryId: "healthcare",
    categoryName: "Healthcare",
  });
  assert.deepEqual(categorizeStatementItem({ ...baseItem, mcc: 5311 }), {
    categoryId: "shopping",
    categoryName: "Shopping",
  });
  assert.deepEqual(categorizeStatementItem({ ...baseItem, mcc: 5200 }), {
    categoryId: "household",
    categoryName: "Household",
  });
  assert.deepEqual(categorizeStatementItem({ ...baseItem, mcc: 8299 }), {
    categoryId: "education",
    categoryName: "Education",
  });
  assert.deepEqual(
    categorizeStatementItem({
      ...baseItem,
      description: "Education subscription",
      mcc: 9999,
    }),
    {
      categoryId: "education",
      categoryName: "Education",
    },
  );
  assert.deepEqual(categorizeStatementItem({ ...baseItem, mcc: 9311 }), {
    categoryId: "taxes",
    categoryName: "Taxes",
  });
  assert.deepEqual(
    categorizeStatementItem({
      ...baseItem,
      description: "City taxes payment",
      mcc: 9999,
    }),
    {
      categoryId: "taxes",
      categoryName: "Taxes",
    },
  );
  assert.deepEqual(
    categorizeStatementItem({
      ...baseItem,
      description: "Taxi ride",
      mcc: 9999,
    }),
    {
      categoryId: "uncategorized",
      categoryName: "Uncategorized",
    },
  );
  assert.deepEqual(categorizeStatementItem({ ...baseItem, mcc: 8398 }), {
    categoryId: "charity",
    categoryName: "Charity",
  });
  assert.deepEqual(categorizeStatementItem({ ...baseItem, mcc: 6011 }), {
    categoryId: "cash",
    categoryName: "Cash",
  });
  assert.deepEqual(categorizeStatementItem({ ...baseItem, mcc: 6012 }), {
    categoryId: "fees",
    categoryName: "Fees",
  });
  assert.deepEqual(categorizeStatementItem(baseItem), {
    categoryId: "uncategorized",
    categoryName: "Uncategorized",
  });
});

test("seeds category rules for the current built-in categorization model", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const rules = await db.listCategoryRules(profile);

      assert.deepEqual(
        rules.map((rule) => rule.id),
        [
          "income-positive-amount",
          "groceries-mcc-or-text",
          "utilities-mcc-or-text",
          "healthcare-mcc-or-text",
          "shopping-mcc-or-text",
          "household-mcc-or-text",
          "education-mcc-or-text",
          "subscriptions-mcc-or-text",
          "transport-mcc-or-text",
          "travel-mcc-or-text",
          "dining-mcc-or-text",
          "taxes-mcc-or-text",
          "charity-mcc-or-text",
          "cash-mcc-or-text",
          "fees-mcc-or-text",
          "transfers-mcc-or-text",
          "uncategorized-fallback",
        ],
      );
      assert.equal(rules[0].categoryId, "income");
      assert.equal(rules[0].amountDirection, "income");
      assert.equal(rules[1].mcc, 5411);
      assert.equal(rules[1].descriptionContains, "grocery");
      assert.equal(
        rules.find((rule) => rule.id === "utilities-mcc-or-text")?.mcc,
        4900,
      );
      assert.equal(
        rules.find((rule) => rule.id === "healthcare-mcc-or-text")?.mcc,
        5912,
      );
      assert.equal(
        rules.find((rule) => rule.id === "taxes-mcc-or-text")?.mcc,
        9311,
      );
      assert.equal(rules.at(-1)?.matchType, "fallback");
      assert.equal(
        rules.every((rule) => rule.isSystem),
        true,
      );
      assert.equal(
        rules.every((rule) => rule.isEnabled),
        true,
      );
    } finally {
      await db.close();
    }
  });
});

test("seeds merchant cleanup rules for built-in merchant normalization", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const rules = await db.listMerchantCleanupRules(profile);

      assert.deepEqual(
        rules.map((rule) => rule.id),
        ["kyiv-metro-cleanup", "cloud-subscription-cleanup"],
      );
      assert.equal(rules[0].canonicalName, "Kyiv Metro");
      assert.equal(
        rules.every((rule) => rule.isSystem),
        true,
      );
      assert.equal(
        rules.every((rule) => rule.isEnabled),
        true,
      );
    } finally {
      await db.close();
    }
  });
});

test("applies user-defined category rules before built-in sync categories", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();
      await db.importLocalConfiguration(profile, {
        categoryRules: [
          {
            id: "grocery-utilities-override",
            categoryId: "utilities",
            name: "Grocery utilities override",
            priority: 10,
            matchType: "condition",
            descriptionContains: "grocery",
            amountDirection: "expense",
            isEnabled: true,
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      });

      await syncLedgerWithMonobank({
        profile,
        source: "fixture",
        adapter: await createBundledFixtureMonobankAdapter(),
        db,
      });

      const transactions = await db.listLedgerEntries({
        profile,
        search: "Silpo",
        limit: 20,
      });

      assert.equal(transactions.total, 1);
      assert.equal(transactions.entries[0].categoryId, "utilities");
      assert.equal(transactions.entries[0].categoryName, "Utilities");
      assert.equal(transactions.entries[0].categorySource, "user_rule");
      assert.equal(
        transactions.entries[0].categoryRuleId,
        "grocery-utilities-override",
      );
      assert.equal(
        transactions.entries[0].categoryRuleVersion,
        "2026-05-01T00:00:00.000Z",
      );
    } finally {
      await db.close();
    }
  });
});

test("stores system category rule metadata on synced ledger entries", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const accountId = "fixture-account-uah-main";
      const statementItem = {
        id: "system-grocery-rule-match",
        time: 1_775_001_880,
        description: "Fixture Grocery LLC",
        mcc: 5411,
        originalMcc: 5411,
        amount: -2450,
        operationAmount: -2450,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 97_550,
        hold: false,
      };

      await db.upsertStatementItems(
        accountId,
        [statementItem],
        [createLedgerEntryFromStatementItem(accountId, statementItem)],
      );

      const page = await db.listLedgerEntries({ profile, limit: 10 });

      assert.equal(page.entries[0]?.categoryId, "groceries");
      assert.equal(page.entries[0]?.categoryName, "Groceries");
      assert.equal(page.entries[0]?.categorySource, "system_rule");
      assert.equal(page.entries[0]?.categoryRuleId, "groceries-mcc-or-text");
      assert.match(
        page.entries[0]?.categoryRuleVersion ?? "",
        /^\d{4}-\d{2}-\d{2}T/,
      );
    } finally {
      await db.close();
    }
  });
});

test("restores ledger categories with original provenance after bulk edit", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const accountId = "fixture-account-uah-main";
      const statementItem = {
        id: "restore-system-grocery-rule-match",
        time: 1_775_001_881,
        description: "Fixture Grocery LLC",
        mcc: 5411,
        originalMcc: 5411,
        amount: -2450,
        operationAmount: -2450,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 97_550,
        hold: false,
      };
      const entry = createLedgerEntryFromStatementItem(
        accountId,
        statementItem,
      );

      await db.upsertStatementItems(accountId, [statementItem], [entry]);

      const original = (await db.listLedgerEntries({ profile, limit: 10 }))
        .entries[0];

      assert.ok(original);

      await db.updateLedgerEntriesBulkEdit(profile, [original.id], {
        categoryId: "travel",
      });

      const manualPage = await db.listLedgerEntries({ profile, limit: 10 });

      assert.equal(manualPage.entries[0]?.categoryId, "travel");
      assert.equal(manualPage.entries[0]?.categorySource, "manual");

      await db.restoreLedgerEntryCategories(profile, [
        {
          id: original.id,
          categoryId: original.categoryId,
          categoryName: original.categoryName,
          categorySource: original.categorySource,
          categoryRuleId: original.categoryRuleId,
          categoryRuleVersion: original.categoryRuleVersion,
        },
      ]);

      const restoredPage = await db.listLedgerEntries({ profile, limit: 10 });

      assert.equal(restoredPage.entries[0]?.categoryId, original.categoryId);
      assert.equal(
        restoredPage.entries[0]?.categoryName,
        original.categoryName,
      );
      assert.equal(
        restoredPage.entries[0]?.categorySource,
        original.categorySource,
      );
      assert.equal(
        restoredPage.entries[0]?.categoryRuleId,
        original.categoryRuleId,
      );
      assert.equal(
        restoredPage.entries[0]?.categoryRuleVersion,
        original.categoryRuleVersion,
      );

      await db.importLocalConfiguration(profile, {
        categoryRules: [
          {
            id: "restored-grocery-utilities-override",
            categoryId: "utilities",
            name: "Restored grocery utilities override",
            priority: 10,
            matchType: "condition",
            descriptionContains: "grocery",
            amountDirection: "expense",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      });

      const secondRun = await db.upsertStatementItems(
        accountId,
        [statementItem],
        [entry],
      );
      const reappliedPage = await db.listLedgerEntries({ profile, limit: 10 });

      assert.equal(secondRun.inserted, 0);
      assert.equal(secondRun.updated, 1);
      assert.equal(secondRun.skipped, 0);
      assert.equal(reappliedPage.entries[0]?.categoryId, "utilities");
      assert.equal(reappliedPage.entries[0]?.categorySource, "user_rule");
      assert.equal(
        reappliedPage.entries[0]?.categoryRuleId,
        "restored-grocery-utilities-override",
      );
    } finally {
      await db.close();
    }
  });
});

test("matches multi-word category rule terms across punctuation", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();
      await db.importLocalConfiguration(profile, {
        categoryRules: [
          {
            id: "book-store-utilities-override",
            categoryId: "utilities",
            name: "Book store utilities override",
            priority: 10,
            matchType: "condition",
            descriptionContains: "book store",
            amountDirection: "expense",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      });

      const accountId = "fixture-account-uah-main";
      const statementItem = {
        id: "custom-book-store-punctuation",
        time: 1_775_001_890,
        description: "Book-store purchase",
        mcc: 9999,
        originalMcc: 9999,
        amount: -1500,
        operationAmount: -1500,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 118_500,
        hold: false,
      };

      await db.upsertStatementItems(
        accountId,
        [statementItem],
        [createLedgerEntryFromStatementItem(accountId, statementItem)],
      );

      const page = await db.listLedgerEntries({ profile, limit: 10 });

      assert.equal(page.entries[0]?.categoryId, "utilities");
      assert.equal(page.entries[0]?.categoryName, "Utilities");
    } finally {
      await db.close();
    }
  });
});

test("reapplies category rules for unchanged synced statement items", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const accountId = "fixture-account-uah-main";
      const statementItem = {
        id: "custom-book-store",
        time: 1_775_001_900,
        description: "Book store purchase",
        mcc: 9999,
        originalMcc: 9999,
        amount: -1500,
        operationAmount: -1500,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 118_500,
        hold: false,
      };
      const entry = createLedgerEntryFromStatementItem(
        accountId,
        statementItem,
      );

      const firstRun = await db.upsertStatementItems(
        accountId,
        [statementItem],
        [entry],
      );

      await db.importLocalConfiguration(profile, {
        categoryRules: [
          {
            id: "book-utilities-override",
            categoryId: "utilities",
            name: "Book purchases as utilities",
            priority: 10,
            matchType: "condition",
            descriptionContains: "book",
            amountDirection: "expense",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      });

      const secondRun = await db.upsertStatementItems(
        accountId,
        [statementItem],
        [entry],
      );
      const page = await db.listLedgerEntries({ profile, limit: 10 });

      assert.equal(firstRun.inserted, 1);
      assert.equal(firstRun.updated, 0);
      assert.equal(firstRun.skipped, 0);
      assert.equal(secondRun.inserted, 0);
      assert.equal(secondRun.updated, 1);
      assert.equal(secondRun.skipped, 0);
      assert.equal(page.entries[0]?.categoryId, "utilities");
      assert.equal(page.entries[0]?.categoryName, "Utilities");
    } finally {
      await db.close();
    }
  });
});

test("reapplies category rules after restart without marking stale categories manual", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const accountId = "fixture-account-uah-main";
    const statementItem = {
      id: "restart-book-store",
      time: 1_775_001_905,
      description: "Book store purchase",
      mcc: 9999,
      originalMcc: 9999,
      amount: -1500,
      operationAmount: -1500,
      currencyCode: 980,
      commissionRate: 0,
      cashbackAmount: 0,
      balance: 118_500,
      hold: false,
    };
    const entry = createLedgerEntryFromStatementItem(accountId, statementItem);
    const firstDb = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await firstDb.migrate();
      await firstDb.upsertStatementItems(accountId, [statementItem], [entry]);
      await firstDb.importLocalConfiguration(profile, {
        categoryRules: [
          {
            id: "restart-book-utilities-override",
            categoryId: "utilities",
            name: "Book purchases as utilities",
            priority: 10,
            matchType: "condition",
            descriptionContains: "book",
            amountDirection: "expense",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      });
    } finally {
      await firstDb.close();
    }

    const secondDb = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await secondDb.migrate();

      const secondRun = await secondDb.upsertStatementItems(
        accountId,
        [statementItem],
        [entry],
      );
      const page = await secondDb.listLedgerEntries({ profile, limit: 10 });

      assert.equal(secondRun.inserted, 0);
      assert.equal(secondRun.updated, 1);
      assert.equal(secondRun.skipped, 0);
      assert.equal(page.entries[0]?.categoryId, "utilities");
      assert.equal(page.entries[0]?.categoryName, "Utilities");
    } finally {
      await secondDb.close();
    }
  });
});

test("keeps manual transaction edits when unchanged statement items resync", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const accountId = "fixture-account-uah-main";
      const statementItem = {
        id: "manual-book-store",
        time: 1_775_001_901,
        description: "Book store purchase",
        mcc: 9999,
        originalMcc: 9999,
        amount: -1500,
        operationAmount: -1500,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 118_500,
        hold: false,
      };
      const entry = createLedgerEntryFromStatementItem(
        accountId,
        statementItem,
      );

      await db.upsertStatementItems(accountId, [statementItem], [entry]);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await db.updateLedgerEntriesBulkEdit(profile, [entry.id], {
        categoryId: "travel",
        merchantName: "Manual Book Merchant",
      });
      await db.importLocalConfiguration(profile, {
        categoryRules: [
          {
            id: "manual-book-utilities-override",
            categoryId: "utilities",
            name: "Book purchases as utilities",
            priority: 10,
            matchType: "condition",
            descriptionContains: "book",
            amountDirection: "expense",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      });

      const secondRun = await db.upsertStatementItems(
        accountId,
        [statementItem],
        [entry],
      );
      const page = await db.listLedgerEntries({ profile, limit: 10 });

      assert.equal(secondRun.inserted, 0);
      assert.equal(secondRun.updated, 0);
      assert.equal(secondRun.skipped, 1);
      assert.equal(page.entries[0]?.categoryId, "travel");
      assert.equal(page.entries[0]?.categoryName, "Travel");
      assert.equal(page.entries[0]?.categorySource, "manual");
      assert.equal(page.entries[0]?.categoryRuleId, undefined);
      assert.equal(page.entries[0]?.categoryRuleVersion, undefined);
      assert.equal(page.entries[0]?.merchantName, "Manual Book Merchant");
    } finally {
      await db.close();
    }
  });
});

test("reapplies category rules when only merchant was manually edited", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const accountId = "fixture-account-uah-main";
      const statementItem = {
        id: "manual-merchant-book-store",
        time: 1_775_001_902,
        description: "Book store purchase",
        mcc: 9999,
        originalMcc: 9999,
        amount: -1500,
        operationAmount: -1500,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 118_500,
        hold: false,
      };
      const entry = createLedgerEntryFromStatementItem(
        accountId,
        statementItem,
      );

      await db.upsertStatementItems(accountId, [statementItem], [entry]);
      await db.updateLedgerEntriesBulkEdit(profile, [entry.id], {
        merchantName: "Manual Book Merchant",
      });
      await db.importLocalConfiguration(profile, {
        categoryRules: [
          {
            id: "manual-merchant-book-utilities-override",
            categoryId: "utilities",
            name: "Book purchases as utilities",
            priority: 10,
            matchType: "condition",
            merchantContains: "Manual Book Merchant",
            amountDirection: "expense",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      });

      const secondRun = await db.upsertStatementItems(
        accountId,
        [statementItem],
        [entry],
      );
      const page = await db.listLedgerEntries({ profile, limit: 10 });

      assert.equal(secondRun.inserted, 0);
      assert.equal(secondRun.updated, 1);
      assert.equal(secondRun.skipped, 0);
      assert.equal(page.entries[0]?.categoryId, "utilities");
      assert.equal(page.entries[0]?.categoryName, "Utilities");
      assert.equal(page.entries[0]?.merchantName, "Manual Book Merchant");
    } finally {
      await db.close();
    }
  });
});

test("keeps manual transaction edits when changed statement items resync", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const accountId = "fixture-account-uah-main";
      const statementItem = {
        id: "settled-manual-book-store",
        time: 1_775_001_903,
        description: "Book store purchase",
        mcc: 9999,
        originalMcc: 9999,
        amount: -1500,
        operationAmount: -1500,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 118_500,
        hold: true,
      };
      const entry = createLedgerEntryFromStatementItem(
        accountId,
        statementItem,
      );

      await db.upsertStatementItems(accountId, [statementItem], [entry]);
      await db.updateLedgerEntriesBulkEdit(profile, [entry.id], {
        categoryId: "travel",
        merchantName: "Manual Book Merchant",
      });
      await db.importLocalConfiguration(profile, {
        categoryRules: [
          {
            id: "settled-book-utilities-override",
            categoryId: "utilities",
            name: "Book purchases as utilities",
            priority: 10,
            matchType: "condition",
            descriptionContains: "book",
            amountDirection: "expense",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      });

      const settledStatementItem = {
        ...statementItem,
        balance: 117_000,
        hold: false,
      };
      const settledEntry = createLedgerEntryFromStatementItem(
        accountId,
        settledStatementItem,
      );
      const secondRun = await db.upsertStatementItems(
        accountId,
        [settledStatementItem],
        [settledEntry],
      );
      const page = await db.listLedgerEntries({ profile, limit: 10 });

      assert.equal(secondRun.inserted, 0);
      assert.equal(secondRun.updated, 1);
      assert.equal(secondRun.skipped, 0);
      assert.equal(page.entries[0]?.categoryId, "travel");
      assert.equal(page.entries[0]?.categoryName, "Travel");
      assert.equal(page.entries[0]?.merchantName, "Manual Book Merchant");
      assert.equal(page.entries[0]?.hold, false);
      assert.equal(page.entries[0]?.balance, 117_000);
    } finally {
      await db.close();
    }
  });
});

test("reapplies category rules after annotation-only transaction edits", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const accountId = "fixture-account-uah-main";
      const statementItem = {
        id: "annotated-book-store",
        time: 1_775_001_904,
        description: "Book store purchase",
        mcc: 9999,
        originalMcc: 9999,
        amount: -1500,
        operationAmount: -1500,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 115_200,
        hold: false,
      };
      const entry = createLedgerEntryFromStatementItem(
        accountId,
        statementItem,
      );

      await db.importLocalConfiguration(profile, {
        categoryRules: [
          {
            id: "annotated-book-override",
            categoryId: "utilities",
            name: "Annotated book purchases",
            priority: 10,
            matchType: "condition",
            descriptionContains: "book",
            amountDirection: "expense",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      });
      await db.upsertStatementItems(accountId, [statementItem], [entry]);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await db.updateLedgerEntryAnnotation(profile, entry.id, {
        note: "Keep this note",
        tags: ["books"],
      });
      await db.importLocalConfiguration(profile, {
        categoryRules: [
          {
            id: "annotated-book-override",
            categoryId: "education",
            name: "Annotated book purchases",
            priority: 10,
            matchType: "condition",
            descriptionContains: "book",
            amountDirection: "expense",
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-02T00:00:00.000Z",
          },
        ],
      });

      const secondRun = await db.upsertStatementItems(
        accountId,
        [statementItem],
        [entry],
      );
      const page = await db.listLedgerEntries({ profile, limit: 10 });

      assert.equal(secondRun.updated, 1);
      assert.equal(page.entries[0]?.categoryId, "education");
      assert.equal(page.entries[0]?.categoryName, "Education");
      assert.equal(page.entries[0]?.note, "Keep this note");
      assert.deepEqual(page.entries[0]?.tags, ["books"]);
    } finally {
      await db.close();
    }
  });
});

test("preserves explicit categories on direct ledger writes", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      await db.transaction(async (tx) => {
        await tx.upsertLedgerEntries([
          {
            id: "manual-travel-entry",
            accountId: "account-1",
            time: 1_715_700_000,
            description: "Flight booking",
            amount: -120_000,
            currencyCode: 980,
            categoryId: "travel",
            categoryName: "Travel",
            merchantName: "Airline",
            hold: false,
            rawStatementItemId: "manual-raw-entry",
          },
        ]);
      });

      const page = await db.listLedgerEntries({ profile, limit: 10 });

      assert.equal(page.entries[0]?.categoryId, "travel");
      assert.equal(page.entries[0]?.categoryName, "Travel");
    } finally {
      await db.close();
    }
  });
});

test("matches category rules after merchant cleanup", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();
      const rawDatabase = new Database(databasePath);
      try {
        rawDatabase
          .prepare(
            `
              INSERT INTO merchant_cleanup_rules (
                profile,
                id,
                name,
                priority,
                merchant_contains,
                canonical_name,
                is_system,
                is_enabled,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
            `,
          )
          .run(
            profile,
            "raw-counterparty-cleanup",
            "Raw counterparty cleanup",
            10,
            "raw counterparty ltd",
            "Canonical Coffee",
            "2026-05-01T00:00:00.000Z",
            "2026-05-01T00:00:00.000Z",
          );
      } finally {
        rawDatabase.close();
      }
      await db.importLocalConfiguration(profile, {
        categoryRules: [
          {
            id: "canonical-coffee-food",
            categoryId: "utilities",
            name: "Canonical coffee food",
            priority: 10,
            matchType: "condition",
            merchantContains: "Canonical Coffee",
            amountDirection: "expense",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      });

      const accountId = "fixture-account-uah-main";
      const statementItem = {
        id: "canonical-coffee-purchase",
        time: 1_775_001_902,
        description: "Morning purchase",
        counterName: "Raw Counterparty LTD Terminal 7",
        mcc: 9999,
        originalMcc: 9999,
        amount: -900,
        operationAmount: -900,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 117_600,
        hold: false,
      };
      const entry = createLedgerEntryFromStatementItem(
        accountId,
        statementItem,
      );

      await db.upsertStatementItems(accountId, [statementItem], [entry]);
      const page = await db.listLedgerEntries({ profile, limit: 10 });

      assert.equal(page.entries[0]?.merchantName, "Canonical Coffee");
      assert.equal(page.entries[0]?.categoryId, "utilities");
      assert.equal(page.entries[0]?.categoryName, "Utilities");
    } finally {
      await db.close();
    }
  });
});

test("does not reapply merchant cleanup to prepared unchanged entries", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();
      const rawDatabase = new Database(databasePath);
      try {
        const insertCleanupRule = rawDatabase.prepare(
          `
            INSERT INTO merchant_cleanup_rules (
              profile,
              id,
              name,
              priority,
              merchant_contains,
              canonical_name,
              is_system,
              is_enabled,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
          `,
        );

        insertCleanupRule.run(
          profile,
          "raw-counterparty-cleanup",
          "Raw counterparty cleanup",
          10,
          "raw counterparty ltd",
          "Canonical Coffee",
          "2026-05-01T00:00:00.000Z",
          "2026-05-01T00:00:00.000Z",
        );
        insertCleanupRule.run(
          profile,
          "canonical-coffee-cleanup",
          "Canonical coffee cleanup",
          20,
          "canonical coffee",
          "Coffee Group",
          "2026-05-01T00:00:00.000Z",
          "2026-05-01T00:00:00.000Z",
        );
      } finally {
        rawDatabase.close();
      }

      const accountId = "fixture-account-uah-main";
      const statementItem = {
        id: "chained-cleanup-purchase",
        time: 1_775_001_903,
        description: "Morning purchase",
        counterName: "Raw Counterparty LTD Terminal 8",
        mcc: 9999,
        originalMcc: 9999,
        amount: -900,
        operationAmount: -900,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 116_700,
        hold: false,
      };
      const entry = createLedgerEntryFromStatementItem(
        accountId,
        statementItem,
      );

      await db.upsertStatementItems(accountId, [statementItem], [entry]);
      await db.importLocalConfiguration(profile, {
        categoryRules: [
          {
            id: "prepared-canonical-coffee-utilities",
            categoryId: "utilities",
            name: "Prepared canonical coffee utilities",
            priority: 10,
            matchType: "condition",
            merchantContains: "Canonical Coffee",
            amountDirection: "expense",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      });

      const secondRun = await db.upsertStatementItems(
        accountId,
        [statementItem],
        [entry],
      );
      const page = await db.listLedgerEntries({ profile, limit: 10 });

      assert.equal(secondRun.updated, 1);
      assert.equal(page.entries[0]?.merchantName, "Canonical Coffee");
      assert.equal(page.entries[0]?.categoryId, "utilities");
    } finally {
      await db.close();
    }
  });
});

test("applies built-in category text variants during synced writes", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });
    const statementItems = [
      {
        id: "variant-groceries",
        time: 1775001600,
        description: "Weekly groceries",
        mcc: 9999,
        originalMcc: 9999,
        amount: -1000,
        operationAmount: -1000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 100000,
        hold: false,
      },
      {
        id: "variant-taxes",
        time: 1775001700,
        description: "City taxes payment",
        mcc: 9999,
        originalMcc: 9999,
        amount: -2000,
        operationAmount: -2000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 98000,
        hold: false,
      },
    ];

    try {
      await db.migrate();
      await db.upsertStatementItems(
        "fixture-account-uah-main",
        statementItems,
        statementItems.map((item) =>
          createLedgerEntryFromStatementItem("fixture-account-uah-main", item),
        ),
      );

      const entries = await db.listLedgerEntries({
        profile,
        limit: 20,
        sortBy: "time",
        sortDirection: "asc",
      });

      assert.deepEqual(
        entries.entries.map((entry) => [
          entry.rawStatementItemId,
          entry.categoryId,
        ]),
        [
          ["variant-groceries", "groceries"],
          ["variant-taxes", "taxes"],
        ],
      );
    } finally {
      await db.close();
    }
  });
});

test("seeds default categories for Ukrainian personal finance use cases", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const categories = await db.listCategories(profile);

      assert.deepEqual(
        categories.map((category) => category.id),
        [
          "cash",
          "charity",
          "dining",
          "education",
          "fees",
          "groceries",
          "healthcare",
          "household",
          "income",
          "shopping",
          "subscriptions",
          "taxes",
          "transfers",
          "transport",
          "travel",
          "uncategorized",
          "utilities",
        ],
      );
      assert.equal(
        categories.find((category) => category.id === "utilities")?.description,
        "Utility bills, mobile plans, internet, and communal services.",
      );
      assert.equal(
        categories.find((category) => category.id === "healthcare")?.isSystem,
        true,
      );
    } finally {
      await db.close();
    }
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
      assert.equal(result.stats.rateLimited, 0);
      assert.equal(info.accounts, 0);
      assert.equal(info.ledgerEntries, 0);
      assert.equal(info.syncRuns, 0);
    } finally {
      await db.close();
    }
  });
});

test("marks pending webhook events as processed after successful account sync", async () => {
  const fixtureSet = await loadMonobankFixtureSet();
  const accountId = fixtureSet.clientInfo.accounts[0].id;
  const statementItems = fixtureSet.statements[accountId];
  const duplicateWebhookEvent = {
    type: "StatementItem",
    data: {
      account: accountId,
      statementItem: statementItems[0],
    },
  };
  const pendingWebhookEvent = {
    type: "StatementItem",
    data: {
      account: accountId,
      statementItem: statementItems[1],
    },
  };
  const ignoredWebhookEvent = {
    type: "StatementItem",
    data: {
      account: accountId,
      statementItem: {
        ...statementItems[2],
        id: "fixture-webhook-ignored-after-reconcile",
      },
    },
  };
  const failedWebhookEvent = {
    type: "StatementItem",
    data: {
      account: accountId,
      statementItem: {
        ...statementItems[3],
        id: "fixture-webhook-failed-after-reconcile",
      },
    },
  };

  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();
      const firstRecord = await db.recordWebhookEvent(duplicateWebhookEvent);
      const duplicateRecord = await db.recordWebhookEvent(
        duplicateWebhookEvent,
      );
      const pendingRecord = await db.recordWebhookEvent(pendingWebhookEvent);
      const ignoredRecord = await db.recordWebhookEvent(ignoredWebhookEvent);
      const failedRecord = await db.recordWebhookEvent(failedWebhookEvent);
      const rawDatabase = new Database(databasePath);

      try {
        rawDatabase
          .prepare("UPDATE webhook_events SET payload_json = ? WHERE id = ?")
          .run("{malformed-json", failedRecord.id);
      } finally {
        rawDatabase.close();
      }

      assert.equal(firstRecord.id, duplicateRecord.id);
      assert.equal(duplicateRecord.status, "duplicate");

      const result = await syncLedgerWithMonobank({
        profile,
        source: "fixture",
        adapter: await createBundledFixtureMonobankAdapter(),
        db,
        accountIds: [accountId],
        from: statementItems[0].time,
        to: statementItems[statementItems.length - 1].time,
      });

      const webhookEvents = await db.listWebhookEvents(profile, 20);
      const duplicateEvent = webhookEvents.find((event) => {
        return event.id === duplicateRecord.id;
      });
      const pendingEvent = webhookEvents.find((event) => {
        return event.id === pendingRecord.id;
      });
      const ignoredEvent = webhookEvents.find((event) => {
        return event.id === ignoredRecord.id;
      });
      const failedEvent = webhookEvents.find((event) => {
        return event.id === failedRecord.id;
      });

      assert.equal(result.run.status, "success");
      assert.equal(duplicateEvent?.status, "duplicate");
      assert.equal(pendingEvent?.status, "processed");
      assert.equal(typeof pendingEvent?.processedAt, "string");
      assert.equal(pendingEvent?.processedAt?.trim().length > 0, true);
      assert.equal(ignoredEvent?.status, "ignored");
      assert.equal(typeof ignoredEvent?.processedAt, "string");
      assert.equal(failedEvent?.status, "failed");
      assert.equal(typeof failedEvent?.processedAt, "string");
    } finally {
      await db.close();
    }
  });
});

test("keeps webhook events pending when they arrive after sync starts", async () => {
  const fixtureSet = await loadMonobankFixtureSet();
  const account = fixtureSet.clientInfo.accounts[0];
  const statementItems = fixtureSet.statements[account.id];
  const lateWebhookEvent = {
    type: "StatementItem",
    data: {
      account: account.id,
      statementItem: {
        ...statementItems[2],
        id: "fixture-webhook-arrived-during-sync",
      },
    },
  };

  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });
    let lateRecordId;
    const adapter = {
      async getClientInfo() {
        return {
          ...fixtureSet.clientInfo,
          accounts: [account],
        };
      },
      async getStatement(window) {
        if (lateRecordId === undefined) {
          const record = await db.recordWebhookEvent(
            lateWebhookEvent,
            "2999-01-01T00:00:00.000Z",
          );
          lateRecordId = record.id;
        }

        return statementItems.filter((item) => {
          return item.time >= window.from && item.time <= window.to;
        });
      },
      async getCurrency() {
        return fixtureSet.currencyRates;
      },
      async setWebhook() {
        return undefined;
      },
    };

    try {
      const result = await syncLedgerWithMonobank({
        profile,
        source: "fixture",
        adapter,
        db,
        accountIds: [account.id],
        from: statementItems[0].time,
        to: statementItems[statementItems.length - 1].time,
      });
      const webhookEvents = await db.listWebhookEvents(profile, 20);
      const lateEvent = webhookEvents.find((event) => {
        return event.id === lateRecordId;
      });

      assert.equal(result.run.status, "success");
      assert.equal(lateEvent?.status, "pending");
      assert.equal(lateEvent?.processedAt, undefined);
    } finally {
      await db.close();
    }
  });
});

test("sync reconcile re-fetches the affected statement window for pending webhooks", async () => {
  const fixtureSet = await loadMonobankFixtureSet();
  const account = fixtureSet.clientInfo.accounts[0];
  const now = Math.floor(Date.now() / 1000);
  const statementTime = now - 40 * 24 * 60 * 60;
  const recentStatementTime = now - 20 * 24 * 60 * 60;
  const { id: _webhookStatementId, ...webhookStatementItemWithoutId } =
    fixtureSet.statements[account.id][0];
  const webhookStatementItem = {
    ...webhookStatementItemWithoutId,
    time: statementTime,
  };
  const recentWebhookStatementItem = {
    ...fixtureSet.statements[account.id][1],
    id: "fixture-webhook-reconcile-recent-window",
    time: recentStatementTime,
  };
  const webhookStatementItems = [
    webhookStatementItem,
    recentWebhookStatementItem,
  ];
  const requestedWindows = [];
  const adapter = {
    async getClientInfo() {
      return {
        ...fixtureSet.clientInfo,
        accounts: [account],
      };
    },
    async getStatement(window) {
      requestedWindows.push(window);

      if (window.accountId !== account.id) {
        return [];
      }

      return webhookStatementItems.filter((item) => {
        return item.time >= window.from && item.time <= window.to;
      });
    },
    async getCurrency() {
      return fixtureSet.currencyRates;
    },
    async setWebhook() {
      return undefined;
    },
  };

  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();
      const pendingRecord = await db.recordWebhookEvent({
        type: "StatementItem",
        data: {
          account: account.id,
          statementItem: webhookStatementItem,
        },
      });
      await db.recordWebhookEvent({
        type: "StatementItem",
        data: {
          account: account.id,
          statementItem: recentWebhookStatementItem,
        },
      });

      await db.transaction(async (tx) => {
        await tx.setSyncCursor({
          profile,
          accountId: account.id,
          source: "monobank",
          statementFrom: now - 31 * 24 * 60 * 60 - 100,
          statementTo: now - 31 * 24 * 60 * 60,
          updatedAt: new Date().toISOString(),
        });
      });

      const result = await syncLedgerWithMonobank({
        profile,
        source: "monobank",
        adapter,
        db,
        accountIds: [account.id],
      });
      const webhookEvents = await db.listWebhookEvents(profile, 20);
      const reconciledEvent = webhookEvents.find((event) => {
        return event.id === pendingRecord.id;
      });

      assert.equal(result.run.status, "success");
      assert.equal(
        requestedWindows.some((window) => {
          return statementTime >= window.from && statementTime <= window.to;
        }),
        true,
      );
      assert.equal(
        requestedWindows.every((window) => {
          return (
            window.to - window.from <= monobankPersonalStatementWindowMaxSeconds
          );
        }),
        true,
      );
      assert.equal(
        requestedWindows.some((window) => {
          return (
            statementTime >= window.from &&
            recentStatementTime <= window.to &&
            window.to - window.from > monobankPersonalStatementWindowMaxSeconds
          );
        }),
        false,
      );
      assert.equal(result.accounts[0].from <= statementTime, true);
      assert.equal(reconciledEvent?.status, "processed");
      assert.equal(
        reconciledEvent?.statementItemId?.startsWith("missing-id:"),
        true,
      );
    } finally {
      await db.close();
    }
  });
});

test("sync reconcile retries failed webhook events with valid payloads", async () => {
  const fixtureSet = await loadMonobankFixtureSet();
  const account = fixtureSet.clientInfo.accounts[0];
  const now = Math.floor(Date.now() / 1000);
  const statementTime = now - 15 * 24 * 60 * 60;
  const webhookStatementItem = {
    ...fixtureSet.statements[account.id][0],
    id: "fixture-webhook-retry-failed-event",
    time: statementTime,
  };
  const requestedWindows = [];
  const adapter = {
    async getClientInfo() {
      return {
        ...fixtureSet.clientInfo,
        accounts: [account],
      };
    },
    async getStatement(window) {
      requestedWindows.push(window);

      if (statementTime >= window.from && statementTime <= window.to) {
        return [webhookStatementItem];
      }

      return [];
    },
    async getCurrency() {
      return fixtureSet.currencyRates;
    },
    async setWebhook() {
      return undefined;
    },
  };

  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();
      const failedRecord = await db.recordWebhookEvent({
        type: "StatementItem",
        data: {
          account: account.id,
          statementItem: webhookStatementItem,
        },
      });
      const rawDatabase = new Database(databasePath);

      try {
        rawDatabase
          .prepare(
            "UPDATE webhook_events SET status = 'failed', processed_at = ? WHERE id = ?",
          )
          .run("2026-05-17T00:00:00.000Z", failedRecord.id);
      } finally {
        rawDatabase.close();
      }

      const result = await syncLedgerWithMonobank({
        profile,
        source: "monobank",
        adapter,
        db,
        accountIds: [account.id],
      });
      const webhookEvents = await db.listWebhookEvents(profile, 20);
      const retriedEvent = webhookEvents.find((event) => {
        return event.id === failedRecord.id;
      });

      assert.equal(result.run.status, "success");
      assert.equal(
        requestedWindows.some((window) => {
          return statementTime >= window.from && statementTime <= window.to;
        }),
        true,
      );
      assert.equal(retriedEvent?.status, "processed");
      assert.equal(typeof retriedEvent?.processedAt, "string");
    } finally {
      await db.close();
    }
  });
});

test("sync reconcile does not regress cursor when old webhook replay is interrupted", async () => {
  const fixtureSet = await loadMonobankFixtureSet();
  const account = fixtureSet.clientInfo.accounts[0];
  const now = Math.floor(Date.now() / 1000);
  const cursorTo = now - 31 * 24 * 60 * 60;
  const oldStatementTime = now - 45 * 24 * 60 * 60;
  const webhookStatementItem = {
    ...fixtureSet.statements[account.id][0],
    id: "fixture-webhook-reconcile-interrupted",
    time: oldStatementTime,
  };
  const requestedWindows = [];
  const adapter = {
    async getClientInfo() {
      return {
        ...fixtureSet.clientInfo,
        accounts: [account],
      };
    },
    async getStatement(window) {
      requestedWindows.push(window);

      if (oldStatementTime >= window.from && oldStatementTime <= window.to) {
        return [webhookStatementItem];
      }

      throw new DomainError(
        "Rate limit exceeded",
        "rate_limit_exceeded",
        "rate_limit",
        { reason: "tests" },
      );
    },
    async getCurrency() {
      return fixtureSet.currencyRates;
    },
    async setWebhook() {
      return undefined;
    },
  };

  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();
      await db.recordWebhookEvent({
        type: "StatementItem",
        data: {
          account: account.id,
          statementItem: webhookStatementItem,
        },
      });
      await db.transaction(async (tx) => {
        await tx.setSyncCursor({
          profile,
          accountId: account.id,
          source: "monobank",
          statementFrom: cursorTo - 100,
          statementTo: cursorTo,
          updatedAt: new Date().toISOString(),
        });
      });

      await assert.rejects(
        syncLedgerWithMonobank({
          profile,
          source: "monobank",
          adapter,
          db,
          accountIds: [account.id],
        }),
        (error) => {
          return (
            error instanceof DomainError && error.code === "rate_limit_exceeded"
          );
        },
      );

      const cursor = await db.getSyncCursor(profile, account.id);
      const webhookEvents = await db.listWebhookEvents(profile, 20);

      assert.equal(requestedWindows.length, 2);
      assert.deepEqual(cursor, {
        profile,
        accountId: account.id,
        source: "monobank",
        statementFrom: cursorTo - 100,
        statementTo: cursorTo,
        updatedAt: cursor?.updatedAt,
      });
      assert.equal(webhookEvents[0].status, "pending");
    } finally {
      await db.close();
    }
  });
});

test("tracks rate-limit in sync run stats on adapter failures", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });
    const syncError = new DomainError(
      "Rate limit exceeded",
      "rate_limit_exceeded",
      "rate_limit",
      { reason: "tests" },
    );

    const adapter = {
      async getClientInfo() {
        return {
          clientId: "rate-limit-client",
          name: "Rate limit client",
          accounts: [
            {
              id: "rate-limit-account",
              balance: 1_000_00,
              creditLimit: 0,
              currencyCode: 980,
              type: "black",
            },
          ],
          jars: [],
        };
      },
      async getStatement() {
        throw syncError;
      },
      async getCurrency() {
        return [];
      },
      async setWebhook() {
        return undefined;
      },
    };

    try {
      const syncPromise = syncLedgerWithMonobank({
        profile,
        source: "fixture",
        adapter,
        db,
        from: 1,
        to: 10,
      });
      await assert.rejects(
        syncPromise,
        (error) =>
          error instanceof DomainError &&
          error.category === "rate_limit" &&
          error.code === "rate_limit_exceeded",
      );

      const runs = await db.listSyncRuns(profile);

      assert.equal(runs[0].status, "failed");
      assert.equal(runs[0].apiCalls, 3);
      assert.equal(runs[0].windowsFetched, 0);
      assert.equal(runs[0].rateLimited, 1);
      assert.equal(runs[0].itemsSeen, 0);
      assert.equal(runs[0].itemsInserted, 0);
      assert.equal(runs[0].itemsUpdated, 0);
      assert.equal(runs[0].itemsSkipped, 0);
    } finally {
      await db.close();
    }
  });
});

test("records a partial run when sync is interrupted and resumes after the completed window", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });
    const syncAbortController = new AbortController();
    let statementCalls = 0;
    const statementWindows = [];
    const adapter = {
      async getClientInfo() {
        return {
          clientId: "interrupted-client",
          name: "Interrupted Client",
          accounts: [
            {
              id: "interrupted-account",
              balance: 1_000_00,
              creditLimit: 0,
              currencyCode: 980,
              type: "black",
            },
          ],
          jars: [],
        };
      },
      async getStatement(request) {
        statementCalls += 1;
        statementWindows.push(request);

        if (statementCalls === 1) {
          syncAbortController.abort(
            new DOMException("Sync was interrupted", "AbortError"),
          );
          return [
            {
              id: "statement-item-interrupted",
              time: 1,
              description: "Interrupted statement item",
              mcc: 5814,
              originalMcc: 5814,
              amount: -700,
              operationAmount: -700,
              currencyCode: 980,
              commissionRate: 0,
              cashbackAmount: 0,
              balance: 10_000,
              hold: false,
            },
          ];
        }

        return [];
      },
      async getCurrency() {
        return [];
      },
      async setWebhook() {
        return undefined;
      },
    };

    try {
      const syncPromise = syncLedgerWithMonobank({
        profile,
        source: "fixture",
        adapter,
        db,
        signal: syncAbortController.signal,
        from: 1,
        to: 10_000,
        sliceSeconds: 2,
      });
      await assert.rejects(
        syncPromise,
        (error) => error instanceof DOMException && error.name === "AbortError",
      );

      const runs = await db.listSyncRuns(profile);
      assert.equal(runs[0].status, "partial");
      assert.equal(runs[0].apiCalls, 3);
      assert.equal(runs[0].windowsFetched, 1);
      assert.equal(runs[0].rateLimited, 0);
      assert.equal(runs[0].itemsSeen, 1);
      assert.equal(runs[0].itemsInserted, 1);
      assert.equal(runs[0].itemsUpdated, 0);
      assert.equal(runs[0].itemsSkipped, 0);
      const interruptedCursor = await db.getSyncCursor(
        profile,
        "interrupted-account",
      );

      assert.deepEqual(interruptedCursor, {
        profile,
        accountId: "interrupted-account",
        source: "fixture",
        statementFrom: 1,
        statementTo: 3,
        updatedAt: interruptedCursor?.updatedAt,
      });
      assert.equal(statementCalls, 1);
      assert.equal(
        (await db.listLedgerEntries({ profile, limit: 20 })).total,
        1,
      );

      const resumedResult = await syncLedgerWithMonobank({
        profile,
        source: "fixture",
        adapter,
        db,
        to: 7,
        sliceSeconds: 2,
      });

      assert.equal(resumedResult.run.status, "success");
      assert.equal(resumedResult.accounts[0].from, 4);
      assert.deepEqual(
        statementWindows.map((window) => [window.from, window.to]),
        [
          [1, 3],
          [4, 6],
          [7, 7],
        ],
      );
    } finally {
      await db.close();
    }
  });
});

test("process signal controller aborts sync work and removes listeners", () => {
  const target = new EventEmitter();
  const controller = createProcessSignalAbortController(target);

  assert.equal(controller.signal.aborted, false);
  assert.equal(target.listenerCount("SIGINT"), 1);
  assert.equal(target.listenerCount("SIGTERM"), 1);

  target.emit("SIGINT");

  assert.equal(controller.signal.aborted, true);
  assert.equal(controller.signal.reason.name, "AbortError");
  assert.match(controller.signal.reason.message, /SIGINT/);

  controller.dispose();

  assert.equal(target.listenerCount("SIGINT"), 0);
  assert.equal(target.listenerCount("SIGTERM"), 0);
});

test("ledger summary exposes the oldest sync cursor timestamp", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();
      await db.transaction(async (tx) => {
        await tx.setSyncCursor({
          profile,
          accountId: "fresh-account",
          source: "fixture",
          statementFrom: 20,
          statementTo: 30,
          updatedAt: "2026-05-17T08:00:00.000Z",
        });
        await tx.setSyncCursor({
          profile,
          accountId: "stale-account",
          source: "fixture",
          statementFrom: 1,
          statementTo: 10,
          updatedAt: "2026-05-15T08:00:00.000Z",
        });
      });

      const summary = await db.getLedgerSummary(profile);

      assert.equal(
        summary.oldestSyncCursorUpdatedAt,
        "2026-05-15T08:00:00.000Z",
      );
    } finally {
      await db.close();
    }
  });
});

test("migrates legacy first-migration sqlite DB and preserves baseline queries", async () => {
  await withLegacyFirstMigrationDb(async ({ databasePath }) => {
    const profile = "legacy";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      const beforeMigration = await db.getDatabaseInfo(profile);
      assert.deepEqual(beforeMigration.migrations, ["0001_local_ledger"]);
      assert.equal(beforeMigration.accounts, 1);

      await db.migrate();

      const afterMigration = await db.getDatabaseInfo(profile);
      assert.deepEqual(afterMigration.migrations, [
        "0001_local_ledger",
        "0002_ledger_entry_annotations",
        "0003_transaction_split_plan",
        "0004_sync_run_stats_columns",
        "0005_webhook_delivery_dedup",
        "0006_categories",
        "0007_webhook_event_status",
        "0008_local_app_settings",
        "0009_category_rules",
        "0010_merchants",
        "0011_budgets",
        "0012_budget_periods",
        "0013_recurring_items",
        "0014_tags",
        "0015_query_performance_indexes",
        "0016_merchant_cleanup_rules",
        "0017_ledger_entry_manual_overrides",
        "0018_ledger_entry_category_rule_metadata",
        "0019_recurring_detection_decisions",
        "0020_remove_fixture_merchant_cleanup_seed",
        "0021_sync_run_error_message",
        "0022_ledger_entry_review_states",
        "0023_local_app_cockpit_settings",
        "0024_local_exports",
        "0025_raw_statement_retention",
        "0026_bi_views",
      ]);
      assert.equal(afterMigration.accounts, 1);
      assert.equal(afterMigration.ledgerEntries, 0);
      assert.equal(afterMigration.syncRuns, 0);
      assert.equal((await db.listCategories(profile)).length, 17);
      assert.equal((await db.listCategoryRules(profile)).length, 17);
      assert.equal((await db.listMerchantCleanupRules(profile)).length, 2);
      assert.deepEqual(await db.listBudgets(profile), []);
      assert.deepEqual(await db.listBudgetPeriods(profile), []);
      assert.deepEqual(await db.listRecurringItems(profile), []);
      assert.deepEqual(await db.listRecurringDetectionDecisions(profile), []);
      assert.deepEqual(await db.listTags(profile), []);

      const accounts = await db.listAccounts(profile);
      assert.equal(accounts.length, 1);
      assert.equal(accounts[0].id, "legacy-account-uah-main");
      assert.equal(accounts[0].currencyCode, 980);
      assert.equal(accounts[0].creditLimit, 0);
      assert.equal(accounts[0].balance, 100000);
    } finally {
      await db.close();
    }
  });
});

test("migrates prior fixture ledger data to the latest sqlite schema", async () => {
  await withLegacyFirstMigrationDb(
    async ({ databasePath }) => {
      const profile = "legacy";
      const db = createSqliteLedgerDb({
        filePath: databasePath,
        profile,
      });

      try {
        const beforeMigration = await db.getDatabaseInfo(profile);
        assert.equal(beforeMigration.ledgerEntries, 2);
        assert.deepEqual(beforeMigration.migrations, ["0001_local_ledger"]);

        await db.migrate();

        const afterMigration = await db.getDatabaseInfo(profile);
        assert.equal(afterMigration.ledgerEntries, 2);
        assert.equal(afterMigration.syncRuns, 1);
        assert.equal(afterMigration.migrations.at(-1), "0026_bi_views");

        const summary = await db.getLedgerSummary(profile);
        assert.equal(summary.ledgerEntries, 2);
        assert.equal(summary.income, 500000);
        assert.equal(summary.expenses, 2450);
        assert.equal(summary.net, 497550);
        assert.deepEqual(summary.monthToDate, {
          month: "2026-04",
          from: "2026-04-01",
          to: "2026-04-02",
          income: 500000,
          expenses: 2450,
          net: 497550,
        });
        assert.equal(summary.lastSyncedAt, "2026-05-16T08:03:00.000Z");
        assert.equal(
          summary.oldestSyncCursorUpdatedAt,
          "2026-05-16T08:03:00.000Z",
        );

        const groceryPage = await db.listLedgerEntries({
          profile,
          accountId: "legacy-account-uah-main",
          categoryId: "groceries",
          from: 1775001600,
          to: 1775001600,
          limit: 20,
        });
        assert.equal(groceryPage.total, 1);
        assert.equal(groceryPage.entries[0].id, "legacy-entry-grocery");
        assert.equal(
          groceryPage.entries[0].merchantName,
          "Fixture Grocery LLC",
        );
        assert.equal((await db.listMerchantCleanupRules(profile)).length, 2);

        const annotated = await db.updateLedgerEntryAnnotation(
          profile,
          "legacy-entry-grocery",
          {
            note: "Migrated fixture smoke test",
            tags: ["migration", "fixture"],
          },
        );
        assert.equal(annotated?.note, "Migrated fixture smoke test");
        assert.deepEqual(
          (await db.listTags(profile)).map((tag) => tag.name),
          ["fixture", "migration"],
        );

        const runs = await db.listSyncRuns(profile);
        assert.equal(runs.length, 1);
        assert.equal(runs[0].itemsSeen, 2);
        assert.equal(runs[0].apiCalls, 0);
      } finally {
        await db.close();
      }
    },
    { seedLedger: true },
  );
});

test("migrates legacy manual transaction edits into override markers", async () => {
  await withLegacyFirstMigrationDb(
    async ({ databasePath }) => {
      const profile = "legacy";
      const rawDatabase = new Database(databasePath);

      try {
        rawDatabase
          .prepare(
            `
              UPDATE ledger_entries
              SET
                category_id = 'travel',
                category_name = 'Travel',
                merchant_name = 'Manual legacy merchant',
                updated_at = '2026-05-16T08:10:00.000Z'
              WHERE profile = ? AND id = ?
            `,
          )
          .run(profile, "legacy-entry-grocery");
      } finally {
        rawDatabase.close();
      }

      const db = createSqliteLedgerDb({
        filePath: databasePath,
        profile,
      });

      try {
        await db.migrate();

        await db.importLocalConfiguration(profile, {
          categoryRules: [
            {
              id: "legacy-grocery-utilities-override",
              categoryId: "utilities",
              name: "Legacy grocery purchases as utilities",
              priority: 10,
              matchType: "condition",
              descriptionContains: "grocery",
              amountDirection: "expense",
              createdAt: "2026-05-17T00:00:00.000Z",
            },
          ],
        });

        const statementItem = {
          id: "legacy-statement-1",
          time: 1775001600,
          description: "Fixture Grocery LLC",
          amount: -2450,
          operationAmount: -2450,
          currencyCode: 980,
          commissionRate: 0,
          cashbackAmount: 0,
          balance: 97550,
          hold: false,
        };
        const entry = {
          id: "legacy-entry-grocery",
          accountId: "legacy-account-uah-main",
          time: statementItem.time,
          description: statementItem.description,
          amount: statementItem.amount,
          operationAmount: statementItem.operationAmount,
          currencyCode: statementItem.currencyCode,
          categoryId: "groceries",
          categoryName: "Groceries",
          merchantName: statementItem.description,
          rawStatementItemId: statementItem.id,
          hold: statementItem.hold,
          balance: statementItem.balance,
        };

        const secondRun = await db.upsertStatementItems(
          "legacy-account-uah-main",
          [statementItem],
          [entry],
        );
        const page = await db.listLedgerEntries({
          profile,
          search: "legacy merchant",
          limit: 10,
        });

        assert.equal(secondRun.inserted, 0);
        assert.equal(secondRun.updated, 0);
        assert.equal(secondRun.skipped, 1);
        assert.equal(page.entries[0]?.categoryId, "travel");
        assert.equal(page.entries[0]?.categoryName, "Travel");
        assert.equal(page.entries[0]?.merchantName, "Manual legacy merchant");
      } finally {
        await db.close();
      }
    },
    { seedLedger: true },
  );
});

test("migrates legacy manual transaction edits for every profile", async () => {
  await withLegacyFirstMigrationDb(
    async ({ databasePath }) => {
      const rawDatabase = new Database(databasePath);

      try {
        rawDatabase.exec(`
          INSERT INTO profiles (name, created_at)
          VALUES ('legacy-alt', '2026-05-16T08:00:00.000Z');

          INSERT INTO accounts (
            profile, id, type, currency_code, balance, credit_limit,
            masked_pan_json, raw_json, updated_at
          ) VALUES (
            'legacy-alt',
            'legacy-alt-account-uah-main',
            'black',
            980,
            100000,
            0,
            NULL,
            '{"fixture":"legacy-alt"}',
            '2026-05-16T08:00:00.000Z'
          );

          INSERT INTO raw_statement_items (
            profile, account_id, statement_item_id, time, payload_json, updated_at
          ) VALUES (
            'legacy-alt',
            'legacy-alt-account-uah-main',
            'legacy-alt-statement-1',
            1775001600,
            '{"id":"legacy-alt-statement-1","time":1775001600,"description":"Fixture Grocery LLC","amount":-2450,"operationAmount":-2450,"currencyCode":980,"commissionRate":0,"cashbackAmount":0,"balance":97550,"hold":false}',
            '2026-05-16T08:01:00.000Z'
          );

          INSERT INTO ledger_entries (
            profile, id, account_id, time, description, amount,
            operation_amount, currency_code, category_id, category_name,
            merchant_name, raw_statement_item_id, hold, balance, created_at, updated_at
          ) VALUES (
            'legacy-alt',
            'legacy-alt-entry-grocery',
            'legacy-alt-account-uah-main',
            1775001600,
            'Fixture Grocery LLC',
            -2450,
            -2450,
            980,
            'travel',
            'Travel',
            'Manual alt merchant',
            'legacy-alt-statement-1',
            0,
            97550,
            '2026-05-16T08:01:00.000Z',
            '2026-05-16T08:10:00.000Z'
          );
        `);
      } finally {
        rawDatabase.close();
      }

      const firstProfileDb = createSqliteLedgerDb({
        filePath: databasePath,
        profile: "legacy",
      });

      try {
        await firstProfileDb.migrate();
      } finally {
        await firstProfileDb.close();
      }

      const secondProfileDb = createSqliteLedgerDb({
        filePath: databasePath,
        profile: "legacy-alt",
      });

      try {
        await secondProfileDb.migrate();
        await secondProfileDb.importLocalConfiguration("legacy-alt", {
          categoryRules: [
            {
              id: "legacy-alt-grocery-utilities",
              categoryId: "utilities",
              name: "Legacy alt grocery purchases as utilities",
              priority: 10,
              matchType: "condition",
              descriptionContains: "grocery",
              amountDirection: "expense",
              createdAt: "2026-05-17T00:00:00.000Z",
            },
          ],
        });

        const statementItem = {
          id: "legacy-alt-statement-1",
          time: 1775001600,
          description: "Fixture Grocery LLC",
          amount: -2450,
          operationAmount: -2450,
          currencyCode: 980,
          commissionRate: 0,
          cashbackAmount: 0,
          balance: 97550,
          hold: false,
        };
        const entry = {
          id: "legacy-alt-entry-grocery",
          accountId: "legacy-alt-account-uah-main",
          time: statementItem.time,
          description: statementItem.description,
          amount: statementItem.amount,
          operationAmount: statementItem.operationAmount,
          currencyCode: statementItem.currencyCode,
          categoryId: "groceries",
          categoryName: "Groceries",
          merchantName: statementItem.description,
          rawStatementItemId: statementItem.id,
          hold: statementItem.hold,
          balance: statementItem.balance,
        };

        const secondRun = await secondProfileDb.upsertStatementItems(
          "legacy-alt-account-uah-main",
          [statementItem],
          [entry],
        );
        const page = await secondProfileDb.listLedgerEntries({
          profile: "legacy-alt",
          search: "Manual alt merchant",
          limit: 10,
        });

        assert.equal(secondRun.inserted, 0);
        assert.equal(secondRun.updated, 0);
        assert.equal(secondRun.skipped, 1);
        assert.equal(page.entries[0]?.categoryId, "travel");
        assert.equal(page.entries[0]?.categoryName, "Travel");
        assert.equal(page.entries[0]?.merchantName, "Manual alt merchant");
      } finally {
        await secondProfileDb.close();
      }
    },
    { seedLedger: true },
  );
});

test("does not backfill legacy annotation-only edits as category overrides", async () => {
  await withLegacyFirstMigrationDb(
    async ({ databasePath }) => {
      const profile = "legacy";
      const rawDatabase = new Database(databasePath);

      try {
        rawDatabase
          .prepare(
            `
              UPDATE ledger_entries
              SET updated_at = '2026-05-16T08:10:00.000Z'
              WHERE profile = ? AND id = ?
            `,
          )
          .run(profile, "legacy-entry-grocery");
      } finally {
        rawDatabase.close();
      }

      const db = createSqliteLedgerDb({
        filePath: databasePath,
        profile,
      });

      try {
        await db.migrate();

        await db.importLocalConfiguration(profile, {
          categoryRules: [
            {
              id: "legacy-annotation-grocery-utilities",
              categoryId: "utilities",
              name: "Legacy grocery purchases as utilities",
              priority: 10,
              matchType: "condition",
              descriptionContains: "grocery",
              amountDirection: "expense",
              createdAt: "2026-05-17T00:00:00.000Z",
            },
          ],
        });

        const statementItem = {
          id: "legacy-statement-1",
          time: 1775001600,
          description: "Fixture Grocery LLC",
          amount: -2450,
          operationAmount: -2450,
          currencyCode: 980,
          commissionRate: 0,
          cashbackAmount: 0,
          balance: 97550,
          hold: false,
        };
        const entry = {
          id: "legacy-entry-grocery",
          accountId: "legacy-account-uah-main",
          time: statementItem.time,
          description: statementItem.description,
          amount: statementItem.amount,
          operationAmount: statementItem.operationAmount,
          currencyCode: statementItem.currencyCode,
          categoryId: "groceries",
          categoryName: "Groceries",
          merchantName: statementItem.description,
          rawStatementItemId: statementItem.id,
          hold: statementItem.hold,
          balance: statementItem.balance,
        };

        const secondRun = await db.upsertStatementItems(
          "legacy-account-uah-main",
          [statementItem],
          [entry],
        );
        const page = await db.listLedgerEntries({
          profile,
          search: "Fixture Grocery",
          limit: 10,
        });

        assert.equal(secondRun.inserted, 0);
        assert.equal(secondRun.updated, 1);
        assert.equal(secondRun.skipped, 0);
        assert.equal(page.entries[0]?.categoryId, "utilities");
        assert.equal(page.entries[0]?.categoryName, "Utilities");
        assert.equal(page.entries[0]?.merchantName, "Fixture Grocery LLC");
      } finally {
        await db.close();
      }
    },
    { seedLedger: true },
  );
});

test("does not backfill merchant cleanup as a legacy manual override", async () => {
  await withLegacyFirstMigrationDb(
    async ({ databasePath }) => {
      const profile = "legacy";
      const db = createSqliteLedgerDb({
        filePath: databasePath,
        profile,
      });

      try {
        await db.migrate();

        const statementItem = {
          id: "legacy-statement-1",
          time: 1775001600,
          description: "Fixture Grocery LLC",
          amount: -2450,
          operationAmount: -2450,
          currencyCode: 980,
          commissionRate: 0,
          cashbackAmount: 0,
          balance: 97550,
          hold: false,
        };
        const entry = {
          id: "legacy-entry-grocery",
          accountId: "legacy-account-uah-main",
          time: statementItem.time,
          description: statementItem.description,
          amount: statementItem.amount,
          operationAmount: statementItem.operationAmount,
          currencyCode: statementItem.currencyCode,
          categoryId: "groceries",
          categoryName: "Groceries",
          merchantName: statementItem.description,
          rawStatementItemId: statementItem.id,
          hold: statementItem.hold,
          balance: statementItem.balance,
        };

        const secondRun = await db.upsertStatementItems(
          "legacy-account-uah-main",
          [statementItem],
          [entry],
        );
        const page = await db.listLedgerEntries({
          profile,
          search: "Fixture Grocery",
          limit: 10,
        });

        assert.equal(secondRun.inserted, 0);
        assert.equal(secondRun.updated, 1);
        assert.equal(secondRun.skipped, 0);
        assert.equal(page.entries[0]?.merchantName, "Fixture Grocery LLC");
      } finally {
        await db.close();
      }
    },
    { seedLedger: true },
  );
});

test("does not backfill existing category rules as legacy category overrides", async () => {
  await withLegacyFirstMigrationDb(
    async ({ databasePath }) => {
      const profile = "legacy";
      const rawDatabase = new Database(databasePath);

      try {
        rawDatabase.exec(`
          CREATE TABLE categories (
            profile TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT NOT NULL,
            color TEXT,
            description TEXT NOT NULL,
            is_system INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (profile, id),
            FOREIGN KEY (profile) REFERENCES profiles(name)
          );

          CREATE TABLE category_rules (
            profile TEXT NOT NULL,
            id TEXT NOT NULL,
            category_id TEXT NOT NULL,
            name TEXT NOT NULL,
            priority INTEGER NOT NULL,
            match_type TEXT NOT NULL,
            merchant_contains TEXT,
            description_contains TEXT,
            mcc INTEGER,
            amount_direction TEXT,
            is_system INTEGER NOT NULL DEFAULT 0,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (profile, id),
            FOREIGN KEY (profile) REFERENCES profiles(name),
            FOREIGN KEY (profile, category_id) REFERENCES categories(profile, id)
          );

          INSERT INTO categories (
            profile, id, name, color, description, is_system, created_at, updated_at
          ) VALUES (
            'legacy',
            'utilities',
            'Utilities',
            '#2563eb',
            'Utility bills.',
            1,
            '2026-05-16T08:00:00.000Z',
            '2026-05-16T08:00:00.000Z'
          );

          INSERT INTO category_rules (
            profile, id, category_id, name, priority, match_type,
            merchant_contains, description_contains, mcc, amount_direction,
            is_system, is_enabled, created_at, updated_at
          ) VALUES (
            'legacy',
            'legacy-grocery-utilities',
            'utilities',
            'Legacy grocery purchases as utilities',
            10,
            'condition',
            NULL,
            'grocery',
            NULL,
            'expense',
            0,
            1,
            '2026-05-16T08:00:00.000Z',
            '2026-05-16T08:00:00.000Z'
          );
        `);
      } finally {
        rawDatabase.close();
      }

      const db = createSqliteLedgerDb({
        filePath: databasePath,
        profile,
      });

      try {
        await db.migrate();

        const statementItem = {
          id: "legacy-statement-1",
          time: 1775001600,
          description: "Fixture Grocery LLC",
          amount: -2450,
          operationAmount: -2450,
          currencyCode: 980,
          commissionRate: 0,
          cashbackAmount: 0,
          balance: 97550,
          hold: false,
        };
        const entry = {
          id: "legacy-entry-grocery",
          accountId: "legacy-account-uah-main",
          time: statementItem.time,
          description: statementItem.description,
          amount: statementItem.amount,
          operationAmount: statementItem.operationAmount,
          currencyCode: statementItem.currencyCode,
          categoryId: "groceries",
          categoryName: "Groceries",
          merchantName: statementItem.description,
          rawStatementItemId: statementItem.id,
          hold: statementItem.hold,
          balance: statementItem.balance,
        };

        const secondRun = await db.upsertStatementItems(
          "legacy-account-uah-main",
          [statementItem],
          [entry],
        );
        const page = await db.listLedgerEntries({
          profile,
          search: "Fixture Grocery",
          limit: 10,
        });

        assert.equal(secondRun.inserted, 0);
        assert.equal(secondRun.updated, 1);
        assert.equal(secondRun.skipped, 0);
        assert.equal(page.entries[0]?.categoryId, "utilities");
        assert.equal(page.entries[0]?.categoryName, "Utilities");
      } finally {
        await db.close();
      }
    },
    { seedLedger: true },
  );
});

test("does not backfill cleaned merchants as legacy manual overrides", async () => {
  await withLegacyFirstMigrationDb(
    async ({ databasePath }) => {
      const profile = "legacy";
      const rawDatabase = new Database(databasePath);

      try {
        rawDatabase.exec(`
          CREATE TABLE merchant_cleanup_rules (
            profile TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT NOT NULL,
            priority INTEGER NOT NULL,
            merchant_contains TEXT NOT NULL,
            canonical_name TEXT NOT NULL,
            is_system INTEGER NOT NULL DEFAULT 0,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (profile, id),
            FOREIGN KEY (profile) REFERENCES profiles(name)
          );

          INSERT INTO schema_migrations (
            id,
            description,
            applied_at
          ) VALUES (
            '0016_merchant_cleanup_rules',
            'Add merchant cleanup rules',
            '2026-05-16T08:00:00.000Z'
          );

          INSERT INTO merchant_cleanup_rules (
            profile, id, name, priority, merchant_contains, canonical_name,
            is_system, is_enabled, created_at, updated_at
          ) VALUES (
            'legacy',
            'legacy-grocery-cleanup',
            'Legacy Grocery cleanup',
            100,
            'fixture grocery',
            'Fixture Grocery',
            1,
            1,
            '2026-05-16T08:00:00.000Z',
            '2026-05-16T08:00:00.000Z'
          );

          UPDATE ledger_entries
          SET merchant_name = 'Fixture Grocery'
          WHERE profile = 'legacy' AND id = 'legacy-entry-grocery';
        `);
      } finally {
        rawDatabase.close();
      }

      const db = createSqliteLedgerDb({
        filePath: databasePath,
        profile,
      });

      try {
        await db.migrate();

        const postMigrationDatabase = new Database(databasePath);
        try {
          postMigrationDatabase
            .prepare(
              `
                UPDATE merchant_cleanup_rules
                SET canonical_name = 'Fixture Grocery Updated'
                WHERE profile = ? AND id = ?
              `,
            )
            .run(profile, "legacy-grocery-cleanup");
        } finally {
          postMigrationDatabase.close();
        }

        const statementItem = {
          id: "legacy-statement-1",
          time: 1775001600,
          description: "Fixture Grocery LLC",
          amount: -2450,
          operationAmount: -2450,
          currencyCode: 980,
          commissionRate: 0,
          cashbackAmount: 0,
          balance: 97550,
          hold: false,
        };
        const entry = {
          id: "legacy-entry-grocery",
          accountId: "legacy-account-uah-main",
          time: statementItem.time,
          description: statementItem.description,
          amount: statementItem.amount,
          operationAmount: statementItem.operationAmount,
          currencyCode: statementItem.currencyCode,
          categoryId: "groceries",
          categoryName: "Groceries",
          merchantName: statementItem.description,
          rawStatementItemId: statementItem.id,
          hold: statementItem.hold,
          balance: statementItem.balance,
        };

        const secondRun = await db.upsertStatementItems(
          "legacy-account-uah-main",
          [statementItem],
          [entry],
        );
        const page = await db.listLedgerEntries({
          profile,
          search: "Fixture Grocery",
          limit: 10,
        });

        assert.equal(secondRun.inserted, 0);
        assert.equal(secondRun.updated, 1);
        assert.equal(secondRun.skipped, 0);
        assert.equal(page.entries[0]?.merchantName, "Fixture Grocery Updated");
      } finally {
        await db.close();
      }
    },
    { seedLedger: true },
  );
});

test("seeds category rules for every legacy profile before override backfill", async () => {
  await withLegacyFirstMigrationDb(
    async ({ databasePath }) => {
      const rawDatabase = new Database(databasePath);

      try {
        rawDatabase.exec(`
          INSERT INTO profiles (name, created_at)
          VALUES ('legacy-alt', '2026-05-16T08:00:00.000Z');

          INSERT INTO accounts (
            profile, id, type, currency_code, balance, credit_limit,
            masked_pan_json, raw_json, updated_at
          ) VALUES (
            'legacy-alt',
            'legacy-alt-account-uah-main',
            'black',
            980,
            100000,
            0,
            NULL,
            '{"fixture":"legacy-alt"}',
            '2026-05-16T08:00:00.000Z'
          );

          INSERT INTO raw_statement_items (
            profile, account_id, statement_item_id, time, payload_json, updated_at
          ) VALUES (
            'legacy-alt',
            'legacy-alt-account-uah-main',
            'legacy-alt-statement-1',
            1775001600,
            '{"id":"legacy-alt-statement-1","time":1775001600,"description":"Fixture Grocery LLC","amount":-2450,"operationAmount":-2450,"currencyCode":980,"commissionRate":0,"cashbackAmount":0,"balance":97550,"hold":false}',
            '2026-05-16T08:01:00.000Z'
          );

          INSERT INTO ledger_entries (
            profile, id, account_id, time, description, amount,
            operation_amount, currency_code, category_id, category_name,
            merchant_name, raw_statement_item_id, hold, balance, created_at, updated_at
          ) VALUES (
            'legacy-alt',
            'legacy-alt-entry-grocery',
            'legacy-alt-account-uah-main',
            1775001600,
            'Fixture Grocery LLC',
            -2450,
            -2450,
            980,
            'groceries',
            'Groceries',
            'Fixture Grocery LLC',
            'legacy-alt-statement-1',
            0,
            97550,
            '2026-05-16T08:01:00.000Z',
            '2026-05-16T08:01:00.000Z'
          );
        `);
      } finally {
        rawDatabase.close();
      }

      const firstProfileDb = createSqliteLedgerDb({
        filePath: databasePath,
        profile: "legacy",
      });

      try {
        await firstProfileDb.migrate();
      } finally {
        await firstProfileDb.close();
      }

      const secondProfileDb = createSqliteLedgerDb({
        filePath: databasePath,
        profile: "legacy-alt",
      });

      try {
        await secondProfileDb.migrate();
        await secondProfileDb.importLocalConfiguration("legacy-alt", {
          categoryRules: [
            {
              id: "legacy-alt-grocery-utilities",
              categoryId: "utilities",
              name: "Legacy alt grocery purchases as utilities",
              priority: 10,
              matchType: "condition",
              descriptionContains: "grocery",
              amountDirection: "expense",
              createdAt: "2026-05-17T00:00:00.000Z",
            },
          ],
        });

        const statementItem = {
          id: "legacy-alt-statement-1",
          time: 1775001600,
          description: "Fixture Grocery LLC",
          amount: -2450,
          operationAmount: -2450,
          currencyCode: 980,
          commissionRate: 0,
          cashbackAmount: 0,
          balance: 97550,
          hold: false,
        };
        const entry = {
          id: "legacy-alt-entry-grocery",
          accountId: "legacy-alt-account-uah-main",
          time: statementItem.time,
          description: statementItem.description,
          amount: statementItem.amount,
          operationAmount: statementItem.operationAmount,
          currencyCode: statementItem.currencyCode,
          categoryId: "groceries",
          categoryName: "Groceries",
          merchantName: statementItem.description,
          rawStatementItemId: statementItem.id,
          hold: statementItem.hold,
          balance: statementItem.balance,
        };

        const secondRun = await secondProfileDb.upsertStatementItems(
          "legacy-alt-account-uah-main",
          [statementItem],
          [entry],
        );
        const page = await secondProfileDb.listLedgerEntries({
          profile: "legacy-alt",
          search: "Fixture Grocery",
          limit: 10,
        });

        assert.equal(secondRun.inserted, 0);
        assert.equal(secondRun.updated, 1);
        assert.equal(secondRun.skipped, 0);
        assert.equal(page.entries[0]?.categoryId, "utilities");
        assert.equal(page.entries[0]?.categoryName, "Utilities");
        assert.equal(page.entries[0]?.merchantName, "Fixture Grocery LLC");
      } finally {
        await secondProfileDb.close();
      }
    },
    { seedLedger: true },
  );
});

test("creates ledger and budget query performance indexes", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile: "demo",
    });

    try {
      await db.migrate();
    } finally {
      await db.close();
    }

    const database = new Database(databasePath, { readonly: true });

    try {
      const indexes = database
        .prepare(
          `
            SELECT name
            FROM sqlite_master
            WHERE type = 'index'
            ORDER BY name
          `,
        )
        .all()
        .map((row) => row.name);

      assert.ok(indexes.includes("idx_ledger_entries_profile_account"));
      assert.ok(indexes.includes("idx_ledger_entries_profile_time"));
      assert.ok(indexes.includes("idx_ledger_entries_profile_category_time"));
      assert.ok(indexes.includes("idx_ledger_entries_profile_time_category"));
      assert.ok(indexes.includes("idx_ledger_entries_category_source"));
      assert.ok(indexes.includes("idx_ledger_entries_category_rule"));
      assert.ok(indexes.includes("idx_budgets_profile_category_period"));
      assert.ok(indexes.includes("idx_budget_periods_profile_period"));
    } finally {
      database.close();
    }
  });
});

test("creates DuckDB-friendly BI views over synced ledger data", async () => {
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
      await db.checkpoint();
    } finally {
      await db.close();
    }

    const database = new Database(databasePath, { readonly: true });

    try {
      const views = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name",
        )
        .all()
        .map((row) => row.name);

      assert.deepEqual(views, [
        "v_budget_progress",
        "v_daily_balance",
        "v_monthly_spending",
        "v_recurring_commitments",
        "v_transactions_long",
      ]);

      const transactions = database
        .prepare(
          "SELECT COUNT(*) AS total FROM v_transactions_long WHERE profile = ?",
        )
        .get(profile);
      const monthlySpending = database
        .prepare(
          "SELECT SUM(transaction_count) AS total FROM v_monthly_spending WHERE profile = ?",
        )
        .get(profile);
      const dailyBalance = database
        .prepare(
          "SELECT COUNT(*) AS total FROM v_daily_balance WHERE profile = ?",
        )
        .get(profile);
      const recurring = database
        .prepare(
          "SELECT COUNT(*) AS total FROM v_recurring_commitments WHERE profile = ?",
        )
        .get(profile);

      assert.equal(transactions.total, 7);
      assert.equal(monthlySpending.total > 0, true);
      assert.equal(dailyBalance.total > 0, true);
      assert.equal(recurring.total >= 0, true);
    } finally {
      database.close();
    }
  });
});

test("raw statement retention prunes payload rows without deleting ledger entries", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();
      await db.updateLocalAppSettings(profile, {
        rawStatementRetentionDays: 0,
      });
      await syncLedgerWithMonobank({
        profile,
        source: "fixture",
        adapter: await createBundledFixtureMonobankAdapter(),
        db,
      });
      await db.checkpoint();

      const database = new Database(databasePath);

      try {
        const rawBefore = database
          .prepare(
            "SELECT COUNT(*) AS total FROM raw_statement_items WHERE profile = ?",
          )
          .get(profile).total;

        assert.equal(rawBefore > 0, true);
      } finally {
        database.close();
      }

      const deleted = await db.pruneRawStatementItems(
        profile,
        Number.MAX_SAFE_INTEGER,
      );
      const ledgerPage = await db.listLedgerEntries({ profile, limit: 100 });

      assert.equal(deleted > 0, true);
      assert.equal(ledgerPage.total, 7);
      assert.equal(
        (await db.getLocalAppSettings(profile))?.rawStatementRetentionDays,
        0,
      );
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
      const [firstTransaction] = (
        await db.listLedgerEntries({
          profile,
          limit: 1,
        })
      ).entries;

      await db.updateLedgerEntryAnnotation(profile, firstTransaction.id, {
        tags: ["reviewed"],
      });
      await db.updateLedgerEntriesBulkEdit(profile, [firstTransaction.id], {
        reviewState: "reviewed",
        reviewedSource: "test",
      });
      const taggedJsonExport = await createLedgerExport(db, {
        profile,
        format: "json",
        tag: "reviewed",
      });
      const reviewedPostedExpenseExport = await createLedgerExport(db, {
        profile,
        format: "json",
        reviewState: "reviewed",
        status: "posted",
        amountMax: -1,
        currencyCode: firstTransaction.currencyCode,
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
      const parquet = await createLedgerExport(db, {
        profile,
        format: "parquet",
      });
      const parsed = JSON.parse(json.body);
      const jsonlRows = jsonl.body
        .split("\n")
        .filter(Boolean)
        .map((row) => JSON.parse(row));
      const parquetBody = parquet.body;
      assert.ok(parquetBody instanceof Uint8Array);
      const parquetBuffer = parquetBody.buffer.slice(
        parquetBody.byteOffset,
        parquetBody.byteOffset + parquetBody.byteLength,
      );
      const parquetMetadata = await parquetMetadataAsync(parquetBuffer);
      const parquetRows = await parquetReadObjects({ file: parquetBuffer });

      assert.equal(csv.contentType, "text/csv; charset=utf-8");
      assert.match(csv.body, /fixture-stmt-2026-04-01-salary/);
      assert.match(csv.fileName, /^mono-ledger-demo-csv\.csv$/);
      assert.equal(json.body, secondJson.body);
      assert.equal(parsed.format, "json");
      assert.deepEqual(parsed.filters, {});
      assert.equal(parsed.exportedAt, undefined);
      assert.equal(parsed.total, 7);
      assert.equal(parsed.entries.length, 7);
      const parsedTagged = JSON.parse(taggedJsonExport.body);
      assert.equal(parsedTagged.filters.tag, "reviewed");
      assert.equal(parsedTagged.total, 1);
      assert.equal(parsedTagged.entries.length, 1);
      assert.equal(parsedTagged.entries[0].id, firstTransaction.id);
      const parsedReviewed = JSON.parse(reviewedPostedExpenseExport.body);
      assert.equal(parsedReviewed.filters.reviewState, "reviewed");
      assert.equal(parsedReviewed.filters.status, "posted");
      assert.equal(parsedReviewed.filters.amountMax, -1);
      assert.equal(
        parsedReviewed.filters.currencyCode,
        firstTransaction.currencyCode,
      );
      assert.equal(parsedReviewed.total, firstTransaction.amount < 0 ? 1 : 0);
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
      assert.equal(parquet.contentType, "application/vnd.apache.parquet");
      assert.match(parquet.fileName, /^mono-ledger-demo-parquet\.parquet$/);
      assert.equal(Number(parquetMetadata.num_rows), 7);
      assert.equal(parquetRows.length, 7);
      assert.ok(
        parquetRows.some((row) => row.description === "Salary payment"),
      );
      assert.ok(
        Object.hasOwn(parquetRows[0], "review_state"),
        "Parquet rows should include review state for BI filters",
      );
      assert.equal(
        exportPresetDefinitions["raw-transaction-archive"].format,
        "jsonl",
      );
    } finally {
      await db.close();
    }
  });
});

test("exports redacted sqlite snapshots without raw payload tables", async () => {
  await withTempLedger(async ({ tempRoot, databasePath }) => {
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
      await db.updateLocalAppSettings(profile, {
        exportDirectory: path.join(tempRoot, "sensitive-local-export-path"),
      });
      await db.checkpoint();

      const snapshot = await createSqliteSnapshotExport({
        profile,
        databasePath,
        redacted: true,
      });
      const snapshotPath = path.join(tempRoot, "redacted-snapshot.sqlite");
      await writeFile(snapshotPath, snapshot.body);

      const snapshotDb = new Database(snapshotPath, { readonly: true });

      try {
        const ledgerRows = snapshotDb
          .prepare(
            "SELECT COUNT(*) AS total FROM ledger_entries WHERE profile = ?",
          )
          .get(profile).total;
        const rawRows = snapshotDb
          .prepare(
            "SELECT COUNT(*) AS total FROM raw_statement_items WHERE profile = ?",
          )
          .get(profile).total;
        const webhookRows = snapshotDb
          .prepare(
            "SELECT COUNT(*) AS total FROM webhook_events WHERE profile = ?",
          )
          .get(profile).total;
        const accountRawValues = snapshotDb
          .prepare(
            "SELECT raw_json, masked_pan_json FROM accounts WHERE profile = ?",
          )
          .all(profile);
        const settings = snapshotDb
          .prepare(
            "SELECT export_directory FROM local_app_settings WHERE profile = ?",
          )
          .get(profile);

        assert.equal(snapshot.contentType, "application/vnd.sqlite3");
        assert.match(
          snapshot.fileName,
          /^mono-ledger-demo-sqlite-snapshot-redacted\.sqlite$/,
        );
        assert.equal(snapshot.format, "sqlite");
        assert.deepEqual(snapshot.filters, { redacted: true });
        assert.equal(snapshot.rowCount, 7);
        assert.equal(ledgerRows, 7);
        assert.equal(rawRows, 0);
        assert.equal(webhookRows, 0);
        assert.ok(accountRawValues.length > 0);
        assert.ok(
          accountRawValues.every(
            (row) => row.raw_json === "{}" && row.masked_pan_json === null,
          ),
        );
        assert.equal(settings.export_directory, null);
      } finally {
        snapshotDb.close();
      }
    } finally {
      await db.close();
    }
  });
});

test("exports and imports local ledger configuration", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const targetServer = createLocalApiServer({
      profile: "restored",
      source: "fixture",
      dataDir: path.join(tempRoot, "target"),
    });

    try {
      const payload = {
        format: "local-configuration",
        schemaVersion: 1,
        categories: [
          {
            id: "utilities",
            name: "Utilities",
            color: "#0891b2",
            description: "Bills and household services",
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-02T00:00:00.000Z",
          },
        ],
        categoryRules: [
          {
            id: "utilities-provider-rule",
            categoryId: "utilities",
            name: "Utilities providers",
            priority: 10,
            matchType: "condition",
            merchantContains: "Utility Co",
            amountDirection: "expense",
            isEnabled: false,
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-02T00:00:00.000Z",
          },
        ],
        budgets: [
          {
            id: "utilities-monthly",
            profile: "demo",
            categoryId: "utilities",
            currencyCode: 980,
            periodStart: "2026-05-01",
            periodEnd: "2026-05-31",
            amountLimit: 250000,
            rollover: false,
            includeInflows: false,
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-02T00:00:00.000Z",
          },
        ],
        budgetPeriods: [
          {
            id: "utilities-monthly-2026-05",
            profile: "demo",
            budgetId: "utilities-monthly",
            periodStart: "2026-05-01",
            periodEnd: "2026-05-31",
            plannedAmount: 250000,
            actualAmount: 125000,
            status: "open",
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-02T00:00:00.000Z",
          },
        ],
        tags: [
          {
            id: "tag-monthly-review",
            name: "Monthly Review",
            normalizedName: "monthly review",
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-02T00:00:00.000Z",
          },
        ],
      };

      const importResponse = await targetServer.inject({
        method: "POST",
        url: "/api/imports/local-configuration",
        body: payload,
      });
      const exportResponse = await targetServer.inject({
        method: "GET",
        url: "/api/exports/local-configuration",
      });
      const invalidImportResponse = await targetServer.inject({
        method: "POST",
        url: "/api/imports/local-configuration",
        body: {
          format: "unsupported",
          categories: [],
        },
      });
      const sourceDb = createSqliteLedgerDb({
        filePath: path.join(tempRoot, "source-helper.sqlite"),
        profile: "demo",
      });

      try {
        await sourceDb.migrate();
        const helperExport = await createLocalConfigurationExport(sourceDb, {
          profile: "demo",
        });

        assert.match(
          helperExport.fileName,
          /^mono-ledger-demo-local-configuration\.json$/,
        );
        assert.equal(
          helperExport.contentType,
          "application/json; charset=utf-8",
        );
        assert.equal(JSON.parse(helperExport.body).exportedAt, undefined);
      } finally {
        await sourceDb.close();
      }

      const exported = exportResponse.json();

      assert.equal(importResponse.statusCode, 200);
      assert.deepEqual(importResponse.json().imported, {
        categories: 1,
        categoryRules: 1,
        budgets: 1,
        budgetPeriods: 1,
        tags: 1,
      });
      assert.equal(exportResponse.statusCode, 200);
      assert.match(
        exportResponse.headers["content-disposition"],
        /mono-ledger-restored-local-configuration\.json/,
      );
      assert.equal(exported.profile, "restored");
      assert.equal(exported.format, "local-configuration");
      assert.equal(exported.schemaVersion, 1);
      assert.equal(exported.totals.budgets, 1);
      assert.equal(
        exported.categories.some((entry) => entry.id === "utilities"),
        true,
      );
      assert.equal(
        exported.categoryRules.some(
          (entry) =>
            entry.id === "utilities-provider-rule" && entry.isEnabled === false,
        ),
        true,
      );
      assert.deepEqual(exported.budgets[0], {
        id: "utilities-monthly",
        profile: "restored",
        categoryId: "utilities",
        currencyCode: 980,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        amountLimit: 250000,
        rollover: false,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
      });
      assert.equal(exported.tags[0].normalizedName, "monthly review");
      assert.equal(invalidImportResponse.statusCode, 400);
      assert.equal(
        invalidImportResponse.json().error,
        "invalid_local_configuration_import",
      );
    } finally {
      await targetServer.close();
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
      const netWorthTrendResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/net-worth-trend",
      });
      const categoriesResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/categories",
      });
      const categoryRulesResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/category-rules",
      });
      const merchantCleanupRulesResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/merchant-cleanup-rules",
      });
      const categorySpendingResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/category-spending",
      });
      const monthlySpendingReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/monthly-spending",
      });
      const cashflowReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/cashflow",
      });
      const oneMonthCashflowReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/cashflow?months=1",
      });
      const invalidCashflowReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/cashflow?months=25",
      });
      const savingsRateReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/savings-rate",
      });
      const invalidSavingsRateReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/savings-rate?months=25",
      });
      const balanceProjectionReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/balance-projection",
      });
      const invalidBalanceProjectionReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/balance-projection?days=181",
      });
      const categoryTrendReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/category-trends",
      });
      const invalidCategoryTrendReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/category-trends?months=25",
      });
      const merchantTrendReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/merchant-trends",
      });
      const invalidMerchantTrendReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/merchant-trends?months=25",
      });
      const emptyMonthlySpendingReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/monthly-spending?month=2026-05",
      });
      const invalidMonthlySpendingReportResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/reports/monthly-spending?month=2026-13",
      });
      const budgetProgressResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/budget-progress",
      });
      const upcomingRecurringPaymentsResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/upcoming-recurring-payments",
      });
      const missedRecurringPaymentsResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/missed-recurring-payments?asOf=2026-04-30",
      });
      const invalidMissedRecurringPaymentsResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/missed-recurring-payments?asOf=2026-02-30",
      });
      const subscriptionIncreaseAlertsResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/subscription-increase-alerts?asOf=2026-04-30",
      });
      const invalidSubscriptionIncreaseAlertsResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/subscription-increase-alerts?asOf=2026-02-30",
      });
      const recurringDetectionsResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/recurring-detections",
      });
      const confirmRecurringDetectionResponse = await server.inject({
        method: "POST",
        url: "/api/ledger/recurring-detections/missing-candidate/confirm",
      });
      const ignoreRecurringDetectionResponse = await server.inject({
        method: "POST",
        url: "/api/ledger/recurring-detections/missing-candidate/ignore",
      });
      const recurringCalendarResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/recurring-calendar?from=2026-04-01&to=2026-04-30",
      });
      const invalidRecurringCalendarResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/recurring-calendar?from=2026-05-01&to=2026-04-01",
      });
      const manualRecurringItemResponse = await server.inject({
        method: "POST",
        url: "/api/ledger/recurring-items",
        body: {
          accountId: "fixture-account-uah-main",
          categoryId: "utilities",
          merchantName: "Fixture Utilities",
          frequency: "monthly",
          expectedAmountMin: -250000,
          expectedAmountMax: -250000,
          startedAt: "2026-04-01",
        },
      });
      const jarsResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/jars",
      });
      const savingsGoalProgressResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/savings-goal-progress",
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
      const sortedAmountResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?sortBy=amount&sortDirection=asc",
      });
      const sortedMerchantResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?sortBy=merchant&sortDirection=asc",
      });
      const firstTransaction = sortedMerchantResponse.json().entries[0];
      const secondTransaction = sortedMerchantResponse.json().entries[1];
      const bulkEditResponse = await server.inject({
        method: "PATCH",
        url: "/api/ledger/transactions/bulk-edit",
        body: {
          ids: [firstTransaction.id, secondTransaction.id],
          categoryId: "subscriptions",
          merchantName: "Bulk Merchant",
          tags: ["bulk", "bulk", "queued"],
          reviewState: "reviewed",
          reviewedSource: "test",
        },
      });
      const reviewedTransactionsResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?reviewState=reviewed",
      });
      const categoryRestoreResponse = await server.inject({
        method: "PATCH",
        url: "/api/ledger/transactions/category-restore",
        body: {
          entries: [
            {
              id: firstTransaction.id,
              categoryId: firstTransaction.categoryId,
              categoryName: firstTransaction.categoryName,
              categorySource: firstTransaction.categorySource,
              categoryRuleId: firstTransaction.categoryRuleId,
              categoryRuleVersion: firstTransaction.categoryRuleVersion,
            },
          ],
        },
      });
      const annotationResponse = await server.inject({
        method: "PATCH",
        url: `/api/ledger/transactions/${firstTransaction.id}/annotation`,
        body: {
          note: "Monthly review note",
          tags: ["reviewed", "subscription"],
        },
      });
      const emptyAnnotationResponse = await server.inject({
        method: "PATCH",
        url: `/api/ledger/transactions/${firstTransaction.id}/annotation`,
        body: {},
      });
      const splitPlanResponse = await server.inject({
        method: "PATCH",
        url: `/api/ledger/transactions/${firstTransaction.id}/split-plan`,
        body: {
          lines: [
            {
              category: "Groceries",
              amount: -1800,
            },
            {
              category: "Utilities",
              amount: 200,
            },
          ],
        },
      });
      const splitPlanClearResponse = await server.inject({
        method: "PATCH",
        url: `/api/ledger/transactions/${firstTransaction.id}/split-plan`,
        body: {
          lines: [],
        },
      });
      const splitPlanInvalidResponse = await server.inject({
        method: "PATCH",
        url: `/api/ledger/transactions/${firstTransaction.id}/split-plan`,
        body: {
          lines: [
            {
              category: "Groceries",
              amount: 12.34,
            },
          ],
        },
      });
      const exportResponse = await server.inject({
        method: "GET",
        url: "/api/exports/ledger?format=jsonl&categoryId=groceries",
      });
      const taggedExportResponse = await server.inject({
        method: "GET",
        url: "/api/exports/ledger?format=json&tag=reviewed",
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
      assert.deepEqual(summaryResponse.json().monthToDate, {
        month: "2026-04",
        from: "2026-04-01",
        to: "2026-04-10",
        income: 8520000,
        expenses: 408650,
        net: 8111350,
      });
      assert.equal(netWorthTrendResponse.statusCode, 200);
      assert.deepEqual(netWorthTrendResponse.json(), {
        enabled: false,
        reason: "Manual account and asset support is not enabled.",
        points: [],
      });
      assert.equal(categoriesResponse.statusCode, 200);
      assert.deepEqual(
        categoriesResponse.json().map((category) => category.id),
        [
          "cash",
          "charity",
          "dining",
          "education",
          "fees",
          "groceries",
          "healthcare",
          "household",
          "income",
          "shopping",
          "subscriptions",
          "taxes",
          "transfers",
          "transport",
          "travel",
          "uncategorized",
          "utilities",
        ],
      );
      assert.equal(categoryRulesResponse.statusCode, 200);
      assert.equal(categoryRulesResponse.json().length, 17);
      assert.deepEqual(categoryRulesResponse.json()[0], {
        id: "income-positive-amount",
        categoryId: "income",
        name: "Income by positive amount",
        priority: 100,
        matchType: "condition",
        amountDirection: "income",
        isSystem: true,
        isEnabled: true,
        createdAt: categoryRulesResponse.json()[0].createdAt,
      });
      assert.equal(merchantCleanupRulesResponse.statusCode, 200);
      assert.deepEqual(
        merchantCleanupRulesResponse
          .json()
          .map((rule) => [rule.id, rule.canonicalName]),
        [
          ["kyiv-metro-cleanup", "Kyiv Metro"],
          ["cloud-subscription-cleanup", "Cloud Subscription"],
        ],
      );
      assert.equal(categorySpendingResponse.statusCode, 200);
      assert.deepEqual(
        categorySpendingResponse
          .json()
          .map((row) => [row.categoryId, row.currencyCode, row.amount]),
        [
          ["transfers", 980, 250000],
          ["groceries", 980, 84250],
          ["subscriptions", 840, 52900],
          ["travel", 978, 20000],
          ["transport", 980, 1500],
        ],
      );
      assert.equal(monthlySpendingReportResponse.statusCode, 200);
      assert.equal(monthlySpendingReportResponse.json().month, "2026-04");
      assert.equal(monthlySpendingReportResponse.json().totalExpenses, 158650);
      assert.equal(monthlySpendingReportResponse.json().transactionCount, 4);
      assert.equal(
        monthlySpendingReportResponse.json().convertedTotals.totalExpenses,
        3054815,
      );
      assert.equal(cashflowReportResponse.statusCode, 200);
      assert.equal(cashflowReportResponse.json().months, 6);
      assert.equal(cashflowReportResponse.json().from, "2025-11-01");
      assert.equal(cashflowReportResponse.json().to, "2026-04-30");
      assert.equal(cashflowReportResponse.json().totalIncome, 8520000);
      assert.equal(cashflowReportResponse.json().totalExpenses, 158650);
      assert.equal(cashflowReportResponse.json().netCashflow, 8361350);
      assert.deepEqual(
        cashflowReportResponse
          .json()
          .totals.map((row) => [
            row.currencyCode,
            row.income,
            row.expenses,
            row.net,
          ]),
        [
          [980, 8500000, 85750, 8414250],
          [840, 0, 52900, -52900],
          [978, 20000, 20000, 0],
        ],
      );
      assert.deepEqual(cashflowReportResponse.json().convertedTotals, {
        baseCurrencyCode: 980,
        totalIncome: 9361000,
        totalExpenses: 3054815,
        netCashflow: 6306185,
        missingCurrencyCodes: [],
        rates: [
          {
            currencyCode: 840,
            baseCurrencyCode: 980,
            rate: 39.85,
            date: 1775001600,
          },
          {
            currencyCode: 978,
            baseCurrencyCode: 980,
            rate: 43.05,
            date: 1775001600,
          },
        ],
      });
      assert.equal(oneMonthCashflowReportResponse.statusCode, 200);
      assert.equal(oneMonthCashflowReportResponse.json().from, "2026-04-01");
      assert.equal(invalidCashflowReportResponse.statusCode, 400);
      assert.equal(
        invalidCashflowReportResponse.json().error,
        "invalid_cashflow_report_query",
      );
      assert.equal(savingsRateReportResponse.statusCode, 200);
      assert.equal(savingsRateReportResponse.json().months, 6);
      assert.equal(savingsRateReportResponse.json().totalIncome, 8520000);
      assert.equal(savingsRateReportResponse.json().totalExpenses, 158650);
      assert.equal(savingsRateReportResponse.json().totalSavings, 8361350);
      assert.equal(savingsRateReportResponse.json().savingsRate, 98.14);
      assert.deepEqual(
        savingsRateReportResponse
          .json()
          .totals.map((row) => [
            row.currencyCode,
            row.income,
            row.expenses,
            row.savings,
            row.savingsRate,
            row.averageMonthlySavings,
          ]),
        [
          [980, 8500000, 85750, 8414250, 98.99, 1402375],
          [840, 0, 52900, -52900, 0, -8817],
          [978, 20000, 20000, 0, 0, 0],
        ],
      );
      assert.equal(invalidSavingsRateReportResponse.statusCode, 400);
      assert.equal(
        invalidSavingsRateReportResponse.json().error,
        "invalid_savings_rate_report_query",
      );
      assert.equal(balanceProjectionReportResponse.statusCode, 200);
      assert.equal(balanceProjectionReportResponse.json().days, 30);
      assert.equal(
        balanceProjectionReportResponse.json().totalProjectedOutflows,
        0,
      );
      assert.equal(
        balanceProjectionReportResponse.json().totalCurrentBalance,
        balanceProjectionReportResponse.json().totalProjectedBalance,
      );
      assert.deepEqual(balanceProjectionReportResponse.json().events, []);
      assert.equal(invalidBalanceProjectionReportResponse.statusCode, 400);
      assert.equal(
        invalidBalanceProjectionReportResponse.json().error,
        "invalid_balance_projection_report_query",
      );
      assert.equal(categoryTrendReportResponse.statusCode, 200);
      assert.equal(categoryTrendReportResponse.json().months, 6);
      assert.equal(categoryTrendReportResponse.json().totalExpenses, 158650);
      assert.deepEqual(
        categoryTrendReportResponse
          .json()
          .categories.map((row) => [
            row.categoryId,
            row.currencyCode,
            row.amount,
            row.averageMonthlyAmount,
          ]),
        [
          ["groceries", 980, 84250, 14042],
          ["subscriptions", 840, 52900, 8817],
          ["travel", 978, 20000, 3333],
          ["transport", 980, 1500, 250],
        ],
      );
      assert.equal(invalidCategoryTrendReportResponse.statusCode, 400);
      assert.equal(
        invalidCategoryTrendReportResponse.json().error,
        "invalid_category_trend_report_query",
      );
      assert.equal(merchantTrendReportResponse.statusCode, 200);
      assert.equal(merchantTrendReportResponse.json().months, 6);
      assert.equal(merchantTrendReportResponse.json().totalExpenses, 158650);
      assert.deepEqual(
        merchantTrendReportResponse
          .json()
          .merchants.map((row) => [
            row.merchantName,
            row.currencyCode,
            row.amount,
            row.averageMonthlyAmount,
          ]),
        [
          ["Fixture Grocery LLC", 980, 84250, 14042],
          ["Cloud Subscription", 840, 52900, 8817],
          ["Travel booking", 978, 20000, 3333],
          ["Kyiv Metro", 980, 1500, 250],
        ],
      );
      assert.equal(invalidMerchantTrendReportResponse.statusCode, 400);
      assert.equal(
        invalidMerchantTrendReportResponse.json().error,
        "invalid_merchant_trend_report_query",
      );
      assert.deepEqual(
        monthlySpendingReportResponse
          .json()
          .currencyTotals.map((row) => [
            row.currencyCode,
            row.amount,
            row.transactionCount,
          ]),
        [
          [980, 85750, 2],
          [840, 52900, 1],
          [978, 20000, 1],
        ],
      );
      assert.equal(emptyMonthlySpendingReportResponse.statusCode, 200);
      assert.equal(emptyMonthlySpendingReportResponse.json().month, "2026-05");
      assert.deepEqual(
        emptyMonthlySpendingReportResponse.json().categories,
        [],
      );
      assert.equal(invalidMonthlySpendingReportResponse.statusCode, 400);
      assert.equal(
        invalidMonthlySpendingReportResponse.json().error,
        "invalid_monthly_spending_report_query",
      );
      assert.equal(budgetProgressResponse.statusCode, 200);
      assert.deepEqual(budgetProgressResponse.json(), []);
      const createBudgetResponse = await server.inject({
        method: "POST",
        url: "/api/ledger/budgets/monthly",
        body: {
          categoryId: "groceries",
          currencyCode: 980,
          month: "2026-04",
          amountLimit: 100000,
        },
      });
      const closeBudgetResponse = await server.inject({
        method: "PATCH",
        url: `/api/ledger/budgets/monthly/${createBudgetResponse.json().id}/close`,
      });
      const reopenBudgetResponse = await server.inject({
        method: "PATCH",
        url: `/api/ledger/budgets/monthly/${createBudgetResponse.json().id}/reopen`,
      });
      const missingCloseBudgetResponse = await server.inject({
        method: "PATCH",
        url: "/api/ledger/budgets/monthly/non-existent/close",
      });
      const exportDirectory = path.join(tempRoot, "exports");
      const appSettingsResponse = await server.inject({
        method: "PATCH",
        url: "/api/app/settings",
        body: {
          syncSchedule: "daily",
          excludedAccountIds: ["fixture-account-uah-main"],
          exportDirectory,
          budgetWarningThreshold: 70,
        },
      });
      const appConfigAfterSettingsResponse = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const accountsAfterSettingsResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/accounts",
      });
      const excludedSummaryResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/summary",
      });
      const folderExportResponse = await server.inject({
        method: "POST",
        url: "/api/exports/ledger",
        body: {
          format: "json",
          preset: "raw-transaction-archive",
          includeExcludedAccounts: true,
        },
      });
      const exportHistoryResponse = await server.inject({
        method: "GET",
        url: "/api/exports/history",
      });
      const storageResponse = await server.inject({
        method: "GET",
        url: "/api/app/storage",
      });
      const backupResponse = await server.inject({
        method: "POST",
        url: "/api/app/storage/backup",
      });
      const compactResponse = await server.inject({
        method: "POST",
        url: "/api/app/storage/compact",
      });
      const rejectedRestoreResponse = await server.inject({
        method: "POST",
        url: "/api/app/storage/restore",
        body: {
          backupPath: backupResponse.json().backupPath,
          confirmProfile: "wrong",
          confirmDatabasePath: backupResponse.json().databasePath,
        },
      });
      const restoreResponse = await server.inject({
        method: "POST",
        url: "/api/app/storage/restore",
        body: {
          backupPath: backupResponse.json().backupPath,
          confirmProfile: "demo",
          confirmDatabasePath: backupResponse.json().databasePath,
        },
      });
      const storageAfterRestoreResponse = await server.inject({
        method: "GET",
        url: "/api/app/storage",
      });
      const rejectedLocalDataDeleteResponse = await server.inject({
        method: "DELETE",
        url: "/api/app/local-data",
        body: {
          confirmProfile: "wrong",
          confirmDatabasePath: "wrong",
          ledgerData: true,
        },
      });

      assert.equal(createBudgetResponse.statusCode, 200);
      assert.equal(createBudgetResponse.json().actualAmount, 84250);
      assert.equal(closeBudgetResponse.statusCode, 200);
      assert.equal(closeBudgetResponse.json().actualAmount, 84250);
      assert.equal(reopenBudgetResponse.statusCode, 200);
      assert.equal(reopenBudgetResponse.json().actualAmount, 84250);
      assert.equal(missingCloseBudgetResponse.statusCode, 404);
      assert.equal(missingCloseBudgetResponse.json().error, "budget_not_found");
      assert.equal(upcomingRecurringPaymentsResponse.statusCode, 200);
      assert.deepEqual(upcomingRecurringPaymentsResponse.json(), []);
      assert.equal(missedRecurringPaymentsResponse.statusCode, 200);
      assert.deepEqual(missedRecurringPaymentsResponse.json(), []);
      assert.equal(invalidMissedRecurringPaymentsResponse.statusCode, 400);
      assert.equal(
        invalidMissedRecurringPaymentsResponse.json().error,
        "invalid_missed_recurring_payments_query",
      );
      assert.equal(subscriptionIncreaseAlertsResponse.statusCode, 200);
      assert.deepEqual(subscriptionIncreaseAlertsResponse.json(), []);
      assert.equal(invalidSubscriptionIncreaseAlertsResponse.statusCode, 400);
      assert.equal(
        invalidSubscriptionIncreaseAlertsResponse.json().error,
        "invalid_subscription_increase_alerts_query",
      );
      assert.equal(recurringDetectionsResponse.statusCode, 200);
      assert.deepEqual(recurringDetectionsResponse.json(), []);
      assert.equal(confirmRecurringDetectionResponse.statusCode, 404);
      assert.equal(
        confirmRecurringDetectionResponse.json().error,
        "recurring_detection_not_found",
      );
      assert.equal(ignoreRecurringDetectionResponse.statusCode, 404);
      assert.equal(
        ignoreRecurringDetectionResponse.json().error,
        "recurring_detection_not_found",
      );
      assert.equal(manualRecurringItemResponse.statusCode, 200);
      assert.match(manualRecurringItemResponse.json().id, /^manual-/);
      assert.equal(
        manualRecurringItemResponse.json().merchantName,
        "Fixture Utilities",
      );
      assert.equal(manualRecurringItemResponse.json().frequency, "monthly");
      assert.equal(recurringCalendarResponse.statusCode, 200);
      assert.deepEqual(recurringCalendarResponse.json(), []);
      assert.equal(invalidRecurringCalendarResponse.statusCode, 400);
      assert.equal(
        invalidRecurringCalendarResponse.json().error,
        "invalid_recurring_calendar_range",
      );
      assert.equal(jarsResponse.statusCode, 200);
      assert.deepEqual(
        jarsResponse.json().map((jar) => jar.id),
        ["fixture-jar-emergency-fund"],
      );
      assert.equal(jarsResponse.json()[0].title, "Emergency fund");
      assert.equal(savingsGoalProgressResponse.statusCode, 200);
      assert.deepEqual(savingsGoalProgressResponse.json(), [
        {
          id: "jar:fixture-jar-emergency-fund",
          source: "jar",
          sourceId: "fixture-jar-emergency-fund",
          title: "Emergency fund",
          description: "Synthetic local savings jar",
          currencyCode: 980,
          currentAmount: 1500000,
          targetAmount: 6000000,
          remainingAmount: 4500000,
          progressPercentage: 25,
          status: "in_progress",
          updatedAt: savingsGoalProgressResponse.json()[0]?.updatedAt,
        },
      ]);
      assert.equal(transactionsResponse.statusCode, 200);
      assert.equal(transactionsResponse.json().total, 1);
      assert.match(
        transactionsResponse.json().entries[0].createdAt,
        /^\d{4}-\d{2}-\d{2}T/,
      );
      assert.match(
        transactionsResponse.json().entries[0].updatedAt,
        /^\d{4}-\d{2}-\d{2}T/,
      );
      assert.equal(merchantResponse.statusCode, 200);
      assert.equal(merchantResponse.json().total, 1);
      assert.equal(holdResponse.statusCode, 200);
      assert.equal(holdResponse.json().entries[0].hold, true);
      assert.equal(amountResponse.statusCode, 200);
      assert.equal(amountResponse.json().total, 2);
      assert.equal(sortedAmountResponse.statusCode, 200);
      assert.deepEqual(
        sortedAmountResponse.json().entries.map((entry) => entry.amount),
        sortedAmountResponse
          .json()
          .entries.map((entry) => entry.amount)
          .sort((left, right) => left - right),
      );
      assert.equal(sortedMerchantResponse.statusCode, 200);
      assert.deepEqual(
        sortedMerchantResponse
          .json()
          .entries.map((entry) => entry.merchantName ?? entry.description),
        sortedMerchantResponse
          .json()
          .entries.map((entry) => entry.merchantName ?? entry.description)
          .sort((left, right) => left.localeCompare(right)),
      );
      assert.equal(bulkEditResponse.statusCode, 200);
      assert.deepEqual(
        bulkEditResponse
          .json()
          .map((entry) => [
            entry.id,
            entry.categoryId,
            entry.categoryName,
            entry.merchantName,
            entry.tags,
            entry.reviewState,
            entry.reviewedSource,
          ]),
        [
          [
            firstTransaction.id,
            "subscriptions",
            "Subscriptions",
            "Bulk Merchant",
            ["bulk", "queued"],
            "reviewed",
            "test",
          ],
          [
            secondTransaction.id,
            "subscriptions",
            "Subscriptions",
            "Bulk Merchant",
            ["bulk", "queued"],
            "reviewed",
            "test",
          ],
        ],
      );
      assert.equal(reviewedTransactionsResponse.statusCode, 200);
      assert.equal(reviewedTransactionsResponse.json().total, 2);
      assert.equal(categoryRestoreResponse.statusCode, 200);
      assert.deepEqual(
        categoryRestoreResponse
          .json()
          .map((entry) => [
            entry.id,
            entry.categoryId,
            entry.categoryName,
            entry.categorySource,
            entry.categoryRuleId,
            entry.categoryRuleVersion,
          ]),
        [
          [
            firstTransaction.id,
            firstTransaction.categoryId,
            firstTransaction.categoryName,
            firstTransaction.categorySource,
            firstTransaction.categoryRuleId,
            firstTransaction.categoryRuleVersion,
          ],
        ],
      );
      assert.equal(annotationResponse.statusCode, 200);
      assert.equal(annotationResponse.json().note, "Monthly review note");
      assert.deepEqual(annotationResponse.json().tags, [
        "reviewed",
        "subscription",
      ]);
      assert.equal(emptyAnnotationResponse.statusCode, 400);
      assert.equal(splitPlanResponse.statusCode, 200);
      assert.deepEqual(splitPlanResponse.json().splitPlan, [
        {
          category: "Groceries",
          amount: -1800,
        },
        {
          category: "Utilities",
          amount: 200,
        },
      ]);
      assert.equal(splitPlanClearResponse.statusCode, 200);
      assert.equal(splitPlanClearResponse.json().splitPlan, undefined);
      assert.equal(splitPlanInvalidResponse.statusCode, 400);
      assert.equal(exportResponse.statusCode, 200);
      assert.match(exportResponse.body, /fixture-stmt-2026-04-02-silpo/);
      assert.equal(taggedExportResponse.statusCode, 200);
      const taggedExportBody = JSON.parse(taggedExportResponse.body);
      assert.equal(taggedExportBody.filters.tag, "reviewed");
      assert.equal(taggedExportBody.total, 1);
      assert.equal(taggedExportBody.entries[0].id, firstTransaction.id);
      assert.equal(taggedExportBody.entries[0].tags?.[0], "reviewed");
      assert.equal(appSettingsResponse.statusCode, 200);
      assert.equal(appSettingsResponse.json().settings.syncSchedule, "daily");
      assert.deepEqual(appSettingsResponse.json().settings.excludedAccountIds, [
        "fixture-account-uah-main",
      ]);
      assert.equal(
        appSettingsResponse.json().settings.exportDirectory,
        exportDirectory,
      );
      assert.equal(
        appSettingsResponse.json().settings.budgetWarningThreshold,
        70,
      );
      assert.equal(appConfigAfterSettingsResponse.statusCode, 200);
      assert.equal(
        appConfigAfterSettingsResponse.json().sync.schedule,
        "daily",
      );
      assert.equal(accountsAfterSettingsResponse.statusCode, 200);
      assert.equal(
        accountsAfterSettingsResponse
          .json()
          .find((account) => account.id === "fixture-account-uah-main")
          ?.includedInReports,
        false,
      );
      assert.equal(excludedSummaryResponse.statusCode, 200);
      assert.ok(excludedSummaryResponse.json().ledgerEntries < 7);
      assert.equal(folderExportResponse.statusCode, 200);
      assert.equal(folderExportResponse.json().destination, "local_folder");
      assert.equal(folderExportResponse.json().rowCount, 7);
      assert.match(folderExportResponse.json().filePath, /exports/);
      assert.equal(exportHistoryResponse.statusCode, 200);
      assert.equal(exportHistoryResponse.json().length, 3);
      assert.deepEqual(
        exportHistoryResponse.json().map((record) => record.destination),
        ["local_folder", "browser_download", "browser_download"],
      );
      assert.equal(storageResponse.statusCode, 200);
      assert.equal(storageResponse.json().profile, "demo");
      assert.equal(storageResponse.json().ledgerEntries, 7);
      assert.equal(backupResponse.statusCode, 200);
      assert.match(backupResponse.json().backupPath, /backups/);
      assert.equal(compactResponse.statusCode, 200);
      assert.equal(compactResponse.json().integrityCheck, "ok");
      assert.equal(rejectedRestoreResponse.statusCode, 400);
      assert.equal(
        rejectedRestoreResponse.json().error,
        "confirmation_required",
      );
      assert.equal(restoreResponse.statusCode, 200);
      assert.equal(restoreResponse.json().ledgerEntries, 7);
      assert.equal(storageAfterRestoreResponse.statusCode, 200);
      assert.ok(storageAfterRestoreResponse.json().backups.length >= 1);
      assert.equal(rejectedLocalDataDeleteResponse.statusCode, 400);
      assert.equal(
        rejectedLocalDataDeleteResponse.json().error,
        "confirmation_required",
      );
      assert.equal(syncRunsResponse.statusCode, 200);
      assert.equal(syncRunsResponse.json()[0].id, syncBody.run.id);
      assert.equal(
        syncRunsResponse.json()[0].apiCalls,
        syncBody.stats.apiCalls,
      );
      assert.equal(syncBody.run.apiCalls, syncBody.stats.apiCalls);
      assert.equal(syncBody.run.windowsFetched, syncBody.stats.windowsFetched);
      assert.equal(syncBody.run.rateLimited, syncBody.stats.rateLimited);
    } finally {
      await server.close();
    }
  });
});

test("local API returns auth_required for monobank sync without token", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const monobankTokenStore = createSessionMonobankTokenStore();
    await monobankTokenStore.setToken("demo", "ignored-stored-token");

    const server = createLocalApiServer({
      profile: "demo",
      source: "monobank",
      monobankToken: "",
      monobankTokenStore,
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 55665,
    });

    try {
      const configResponse = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const webhookPath = configResponse.json().webhook.path;
      const syncResponse = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });

      assert.equal(configResponse.statusCode, 200);
      assert.equal(configResponse.json().source, "monobank");
      assert.equal(configResponse.json().webhook.enabled, true);
      assert.equal(configResponse.json().webhook.host, "127.0.0.1");
      assert.equal(configResponse.json().webhook.port, 55665);
      assert.equal(
        configResponse.json().webhook.url,
        `http://127.0.0.1:55665${webhookPath}`,
      );
      assert.equal(syncResponse.statusCode, 400);
      assert.deepEqual(syncResponse.json(), {
        error: "auth_required",
        message:
          "Monobank source is configured, but no token is provided. Set MONOBANK_TOKEN or pass monobankToken.",
      });
    } finally {
      await server.close();
    }
  });
});

test("local API creates user category rules from manual edits", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createLocalApiServer({
      profile: "rules",
      source: "fixture",
      dataDir: tempRoot,
    });

    try {
      const createResponse = await server.inject({
        method: "POST",
        url: "/api/ledger/category-rules",
        body: {
          categoryId: "dining",
          name: "Cafe dining override",
          merchantContains: "cafe",
          amountDirection: "expense",
        },
      });

      assert.equal(createResponse.statusCode, 200);
      assert.match(createResponse.json().id, /^manual-[0-9a-f]{12}$/);
      assert.equal(createResponse.json().categoryId, "dining");
      assert.equal(createResponse.json().name, "Cafe dining override");
      assert.equal(createResponse.json().merchantContains, "cafe");
      assert.equal(createResponse.json().amountDirection, "expense");
      assert.equal(createResponse.json().isEnabled, true);
      assert.equal(createResponse.json().isSystem, undefined);
      assert.ok(createResponse.json().priority < 100);

      const updateResponse = await server.inject({
        method: "POST",
        url: "/api/ledger/category-rules",
        body: {
          categoryId: "dining",
          name: "Cafe dining updated",
          merchantContains: "cafe",
          amountDirection: "expense",
        },
      });

      assert.equal(updateResponse.statusCode, 200);
      assert.equal(updateResponse.json().id, createResponse.json().id);
      assert.equal(updateResponse.json().name, "Cafe dining updated");

      const listResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/category-rules",
      });

      assert.equal(listResponse.statusCode, 200);
      assert.equal(
        listResponse
          .json()
          .filter((rule) => rule.id === createResponse.json().id).length,
        1,
      );

      const invalidResponse = await server.inject({
        method: "POST",
        url: "/api/ledger/category-rules",
        body: {
          categoryId: "dining",
          amountDirection: "expense",
        },
      });

      assert.equal(invalidResponse.statusCode, 400);
      assert.equal(invalidResponse.json().error, "invalid_category_rule");
    } finally {
      await server.close();
    }
  });
});

test("local API sync with monobank source uses env token and base URL", async () => {
  const monobankToken = "fixture-monobank-token";
  const fixtureSet = await loadMonobankFixtureSet();
  const statementByAccount = fixtureSet.statements;
  const allStatementTimes = Object.values(statementByAccount).flatMap((items) =>
    items.map((item) => item.time),
  );
  const fixtureMinStatementTime =
    allStatementTimes.length > 0 ? Math.min(...allStatementTimes) : 0;
  const fixtureItemsCount = Object.values(statementByAccount).reduce(
    (total, statementItems) => total + statementItems.length,
    0,
  );
  const seenTokens = new Set();

  const mockHandler = createMonobankMockHttpHandler({
    clientInfo: fixtureSet.clientInfo,
    currencyRates: fixtureSet.currencyRates,
    statementByAccount,
    onRequest: ({ headers }) => {
      const tokenHeader = headers["x-token"];

      if (typeof tokenHeader === "string" && tokenHeader.length > 0) {
        seenTokens.add(tokenHeader);
      }
    },
  });

  const previousToken = process.env.MONOBANK_TOKEN;
  const previousBaseUrl = process.env.MONOBANK_BASE_URL;

  try {
    const previousNow = Date.now;
    let syntheticNow = 1_800_000_000_000;

    Date.now = () => {
      const value = syntheticNow;
      syntheticNow += 60_001;
      return value;
    };

    try {
      await withMockMonobankServer(mockHandler, async (mockBaseUrl) => {
        process.env.MONOBANK_TOKEN = monobankToken;
        process.env.MONOBANK_BASE_URL = mockBaseUrl;

        await withTempLedger(async ({ tempRoot }) => {
          const db = createSqliteLedgerDb({
            filePath: path.join(tempRoot, "demo.sqlite"),
            profile: "demo",
          });

          try {
            await db.migrate();
            await db.transaction(async (tx) => {
              const cursorTimestamp = new Date().toISOString();
              for (const account of fixtureSet.clientInfo.accounts) {
                await tx.setSyncCursor({
                  profile: "demo",
                  accountId: account.id,
                  source: "monobank",
                  statementFrom: 0,
                  statementTo: Math.max(0, fixtureMinStatementTime - 1),
                  updatedAt: cursorTimestamp,
                });
              }
            });
          } finally {
            await db.close();
          }

          const server = createLocalApiServer({
            profile: "demo",
            source: "monobank",
            dataDir: tempRoot,
          });

          try {
            const configResponse = await server.inject({
              method: "GET",
              url: "/api/app/config",
            });
            const syncResponse = await server.inject({
              method: "POST",
              url: "/api/sync/run",
            });

            assert.equal(configResponse.statusCode, 200);
            assert.deepEqual(configResponse.json().token, {
              profile: "demo",
              hasToken: true,
              storage: "session",
              persistence: "session",
            });
            assert.equal(syncResponse.statusCode, 200);
            assert.equal(syncResponse.json().run.status, "success");
            assert.equal(syncResponse.json().run.source, "monobank");
            assert.equal(
              syncResponse.json().stats.itemsSeen,
              fixtureItemsCount,
            );
            assert.ok(syncResponse.json().stats.apiCalls >= 3);
            assert.equal(seenTokens.has(monobankToken), true);
          } finally {
            await server.close();
          }
        });
      });
    } finally {
      Date.now = previousNow;
    }
  } finally {
    if (previousToken === undefined) {
      Reflect.deleteProperty(process.env, "MONOBANK_TOKEN");
    } else {
      process.env.MONOBANK_TOKEN = previousToken;
    }

    if (previousBaseUrl === undefined) {
      Reflect.deleteProperty(process.env, "MONOBANK_BASE_URL");
    } else {
      process.env.MONOBANK_BASE_URL = previousBaseUrl;
    }
  }
});

test("local API sync with monobank source uses saved token store and shared sync pipeline", async () => {
  const monobankToken = "stored-live-monobank-token";
  const fixtureSet = await loadMonobankFixtureSet();
  const statementByAccount = fixtureSet.statements;
  const allStatementTimes = Object.values(statementByAccount).flatMap((items) =>
    items.map((item) => item.time),
  );
  const fixtureMinStatementTime =
    allStatementTimes.length > 0 ? Math.min(...allStatementTimes) : 0;
  const fixtureItemsCount = Object.values(statementByAccount).reduce(
    (total, statementItems) => total + statementItems.length,
    0,
  );
  const requestLog = [];
  const seenTokens = new Set();

  const mockHandler = createMonobankMockHttpHandler({
    clientInfo: fixtureSet.clientInfo,
    currencyRates: fixtureSet.currencyRates,
    statementByAccount,
    onRequest: ({ endpoint, headers }) => {
      requestLog.push(endpoint);

      const tokenHeader = headers["x-token"];
      if (typeof tokenHeader === "string" && tokenHeader.length > 0) {
        seenTokens.add(tokenHeader);
      }
    },
  });

  const previousToken = process.env.MONOBANK_TOKEN;
  process.env.MONOBANK_TOKEN = "";

  try {
    const previousNow = Date.now;
    let syntheticNow = 1_800_000_000_000;

    Date.now = () => {
      const value = syntheticNow;
      syntheticNow += 60_001;
      return value;
    };

    try {
      await withMockMonobankServer(mockHandler, async (mockBaseUrl) => {
        await withTempLedger(async ({ tempRoot }) => {
          const monobankTokenStore = createSessionMonobankTokenStore();
          await monobankTokenStore.setToken("demo", monobankToken);

          const db = createSqliteLedgerDb({
            filePath: path.join(tempRoot, "demo.sqlite"),
            profile: "demo",
          });

          try {
            await db.migrate();
            await db.transaction(async (tx) => {
              const cursorTimestamp = new Date().toISOString();
              for (const account of fixtureSet.clientInfo.accounts) {
                await tx.setSyncCursor({
                  profile: "demo",
                  accountId: account.id,
                  source: "monobank",
                  statementFrom: 0,
                  statementTo: Math.max(0, fixtureMinStatementTime - 1),
                  updatedAt: cursorTimestamp,
                });
              }
            });
          } finally {
            await db.close();
          }

          const server = createLocalApiServer({
            profile: "demo",
            source: "monobank",
            dataDir: tempRoot,
            monobankBaseUrl: mockBaseUrl,
            monobankTokenStore,
          });

          try {
            const configResponse = await server.inject({
              method: "GET",
              url: "/api/app/config",
            });
            const syncResponse = await server.inject({
              method: "POST",
              url: "/api/sync/run",
            });
            const transactionsResponse = await server.inject({
              method: "GET",
              url: "/api/ledger/transactions?limit=5",
            });
            const accountsResponse = await server.inject({
              method: "GET",
              url: "/api/ledger/accounts",
            });

            assert.equal(configResponse.statusCode, 200);
            assert.deepEqual(configResponse.json().token, {
              profile: "demo",
              hasToken: true,
              storage: "session",
              persistence: "session",
              fallbackReason: "secure_storage_unavailable",
            });
            assert.equal(syncResponse.statusCode, 200);
            assert.equal(syncResponse.json().run.status, "success");
            assert.equal(syncResponse.json().run.source, "monobank");
            assert.equal(
              syncResponse.json().stats.itemsSeen,
              fixtureItemsCount,
            );
            assert.equal(
              requestLog.includes("GET /personal/client-info"),
              true,
            );
            assert.equal(requestLog.includes("GET /bank/currency"), true);
            assert.equal(
              requestLog.some((endpoint) =>
                endpoint.startsWith("GET /personal/statement/"),
              ),
              true,
            );
            assert.equal(seenTokens.has(monobankToken), true);

            assert.equal(accountsResponse.statusCode, 200);
            assert.equal(
              accountsResponse.json().length,
              fixtureSet.clientInfo.accounts.length,
            );
            assert.equal(transactionsResponse.statusCode, 200);
            assert.equal(transactionsResponse.json().total, fixtureItemsCount);
            assert.equal(
              transactionsResponse
                .json()
                .entries[0].accountId.startsWith("fixture-account-"),
              true,
            );
          } finally {
            await server.close();
          }

          const syncedDb = createSqliteLedgerDb({
            filePath: path.join(tempRoot, "demo.sqlite"),
            profile: "demo",
          });

          try {
            await syncedDb.migrate();
            const summary = await syncedDb.getDatabaseInfo("demo");
            const entries = await syncedDb.listLedgerEntries({
              profile: "demo",
              limit: 5,
            });

            assert.equal(
              summary.accounts,
              fixtureSet.clientInfo.accounts.length,
            );
            assert.equal(summary.ledgerEntries, fixtureItemsCount);
            assert.equal(summary.syncRuns, 1);
            assert.equal(entries.total, fixtureItemsCount);
            assert.equal(
              entries.entries.every((entry) =>
                entry.rawStatementItemId.startsWith("fixture-stmt-"),
              ),
              true,
            );
          } finally {
            await syncedDb.close();
          }
        });
      });
    } finally {
      Date.now = previousNow;
    }
  } finally {
    if (previousToken === undefined) {
      Reflect.deleteProperty(process.env, "MONOBANK_TOKEN");
    } else {
      process.env.MONOBANK_TOKEN = previousToken;
    }
  }
});

test("local API token endpoint saves and deletes monobank token state", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const monobankTokenStore = createSessionMonobankTokenStore();
    const server = createLocalApiServer({
      profile: "demo",
      source: "monobank",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 55666,
      monobankTokenStore,
      validateMonobankTokenOnSave: false,
    });

    try {
      await monobankTokenStore.setToken("other", "other-profile-token");

      const noTokenConfig = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const emptyTokenSync = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });
      const saveResponse = await server.inject({
        method: "POST",
        url: "/api/app/token",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profile: "demo",
          token: "test-monobank-token",
        }),
      });
      const wrongProfileResponse = await server.inject({
        method: "POST",
        url: "/api/app/token",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profile: "other",
          token: "test-monobank-token",
        }),
      });
      const invalidSaveResponse = await server.inject({
        method: "POST",
        url: "/api/app/token",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: "   ",
        }),
      });
      const whitespaceTokenResponse = await server.inject({
        method: "POST",
        url: "/api/app/token",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profile: "demo",
          token: "test monobank token",
        }),
      });
      const populatedTokenConfig = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const deleteResponse = await server.inject({
        method: "DELETE",
        url: "/api/app/token",
      });
      const deletedTokenConfig = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const deletedTokenSync = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });

      assert.equal(noTokenConfig.statusCode, 200);
      assert.equal(noTokenConfig.json().token.profile, "demo");
      assert.equal(noTokenConfig.json().token.hasToken, false);
      assert.equal(emptyTokenSync.statusCode, 400);
      assert.deepEqual(emptyTokenSync.json(), {
        error: "auth_required",
        message:
          "Monobank source is configured, but no token is provided. Set MONOBANK_TOKEN or pass monobankToken.",
      });
      assert.equal(saveResponse.statusCode, 200);
      assert.deepEqual(saveResponse.json(), {
        profile: "demo",
        hasToken: true,
        storage: "session",
        persistence: "session",
        fallbackReason: "secure_storage_unavailable",
      });
      assert.equal(wrongProfileResponse.statusCode, 400);
      assert.deepEqual(wrongProfileResponse.json(), {
        error: "config_invalid",
        message: "Monobank token profile must match demo.",
      });
      assert.equal(invalidSaveResponse.statusCode, 400);
      assert.deepEqual(invalidSaveResponse.json(), {
        error: "invalid_token",
        message: "Monobank token must be a non-empty string.",
      });
      assert.equal(whitespaceTokenResponse.statusCode, 400);
      assert.deepEqual(whitespaceTokenResponse.json(), {
        error: "invalid_token",
        message: "Monobank token must not contain whitespace.",
      });
      assert.equal(populatedTokenConfig.statusCode, 200);
      assert.equal(populatedTokenConfig.json().token.profile, "demo");
      assert.equal(populatedTokenConfig.json().token.hasToken, true);
      assert.equal(deleteResponse.statusCode, 200);
      assert.deepEqual(deleteResponse.json(), {
        profile: "demo",
        hasToken: false,
        storage: "session",
        persistence: "session",
        fallbackReason: "secure_storage_unavailable",
      });
      assert.equal(deletedTokenConfig.statusCode, 200);
      assert.equal(deletedTokenConfig.json().token.profile, "demo");
      assert.equal(deletedTokenConfig.json().token.hasToken, false);
      // After a successful token save, the workspace auto-promotes
      // to monobank; after a token delete, it stays there so the UI
      // shows sign-in instead of silently switching to fixture data.
      assert.equal(deletedTokenConfig.json().source, "monobank");
      assert.equal(
        await monobankTokenStore.getToken("other"),
        "other-profile-token",
      );
      assert.equal(deletedTokenSync.statusCode, 400);
      assert.deepEqual(deletedTokenSync.json(), {
        error: "auth_required",
        message:
          "Monobank source is configured, but no token is provided. Set MONOBANK_TOKEN or pass monobankToken.",
      });
    } finally {
      await server.close();
    }
  });
});

test("local API supports legacy custom monobank token stores without status metadata", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const tokens = new Map();
    const monobankTokenStore = {
      async getToken(profile) {
        return tokens.get(profile);
      },
      async setToken(profile, token) {
        tokens.set(profile, token);
      },
      async deleteToken(profile) {
        tokens.delete(profile);
      },
    };
    const server = createLocalApiServer({
      profile: "demo",
      source: "monobank",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 55667,
      monobankTokenStore,
      validateMonobankTokenOnSave: false,
    });

    try {
      const emptyConfig = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const saveResponse = await server.inject({
        method: "POST",
        url: "/api/app/token",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profile: "demo",
          token: "legacy-store-token",
        }),
      });

      assert.equal(emptyConfig.statusCode, 200);
      assert.deepEqual(emptyConfig.json().token, {
        profile: "demo",
        hasToken: false,
        storage: "session",
        persistence: "session",
      });
      assert.equal(saveResponse.statusCode, 200);
      assert.deepEqual(saveResponse.json(), {
        profile: "demo",
        hasToken: true,
        storage: "session",
        persistence: "session",
      });
      assert.equal(tokens.get("demo"), "legacy-store-token");
      const deleteResponse = await server.inject({
        method: "DELETE",
        url: "/api/app/token",
      });

      assert.equal(deleteResponse.statusCode, 200);
      assert.deepEqual(deleteResponse.json(), {
        profile: "demo",
        hasToken: false,
        storage: "session",
        persistence: "session",
      });
      assert.equal(tokens.has("demo"), false);
    } finally {
      await server.close();
    }
  });
});

test("local API loads saved monobank token from token store", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const monobankTokenStore = createSessionMonobankTokenStore();
    const firstServer = createLocalApiServer({
      profile: "demo",
      source: "monobank",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 55667,
      monobankTokenStore,
      validateMonobankTokenOnSave: false,
    });

    try {
      const saveResponse = await firstServer.inject({
        method: "POST",
        url: "/api/app/token",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profile: "demo",
          token: "stored-monobank-token",
        }),
      });

      assert.equal(saveResponse.statusCode, 200);
      assert.deepEqual(saveResponse.json(), {
        profile: "demo",
        hasToken: true,
        storage: "session",
        persistence: "session",
        fallbackReason: "secure_storage_unavailable",
      });
    } finally {
      await firstServer.close();
    }

    const previousToken = process.env.MONOBANK_TOKEN;
    process.env.MONOBANK_TOKEN = "";

    try {
      const secondServer = createLocalApiServer({
        profile: "demo",
        source: "monobank",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55668,
        monobankTokenStore,
        validateMonobankTokenOnSave: false,
      });

      const configResponse = await secondServer.inject({
        method: "GET",
        url: "/api/app/config",
      });

      assert.equal(configResponse.statusCode, 200);
      assert.deepEqual(configResponse.json().token, {
        profile: "demo",
        hasToken: true,
        storage: "session",
        persistence: "session",
        fallbackReason: "secure_storage_unavailable",
      });

      await secondServer.close();
    } finally {
      if (previousToken === undefined) {
        Reflect.deleteProperty(process.env, "MONOBANK_TOKEN");
      } else {
        process.env.MONOBANK_TOKEN = previousToken;
      }
    }
  });
});

test("local API creates the first-run workspace database on demand", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const databasePath = path.join(tempRoot, "first-run.sqlite");
    const server = createLocalApiServer({
      profile: "first-run",
      source: "fixture",
      dataDir: tempRoot,
    });

    try {
      assert.equal(existsSync(databasePath), false);

      const response = await server.inject({
        method: "POST",
        url: "/api/app/workspace",
      });
      const configResponse = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.json().profile, "first-run");
      assert.equal(response.json().source, "fixture");
      assert.equal(response.json().databasePath, databasePath);
      assert.equal(response.json().localOnly, true);
      assert.equal(existsSync(databasePath), true);
      assert.equal(configResponse.statusCode, 200);
      assert.equal(configResponse.json().databasePath, databasePath);
    } finally {
      await server.close();
    }
  });
});

test("local API can switch between fixture and monobank sources at runtime", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const server = createLocalApiServer({
      profile: "demo",
      source: "fixture",
      dataDir: tempRoot,
      monobankToken: "",
      host: "127.0.0.1",
      port: 55667,
    });

    try {
      const fixtureConfig = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const switchToMonobank = await server.inject({
        method: "POST",
        url: "/api/app/source",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          source: "monobank",
        }),
      });
      const monobankConfig = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const monobankRun = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });
      const switchBackToFixture = await server.inject({
        method: "POST",
        url: "/api/app/source",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          source: "fixture",
        }),
      });
      const fixtureRun = await server.inject({
        method: "POST",
        url: "/api/sync/run",
      });

      assert.equal(fixtureConfig.statusCode, 200);
      assert.equal(fixtureConfig.json().source, "fixture");
      assert.equal(switchToMonobank.statusCode, 200);
      assert.equal(monobankConfig.statusCode, 200);
      assert.equal(monobankConfig.json().source, "monobank");
      assert.equal(switchToMonobank.json().source, "monobank");
      assert.equal(monobankRun.statusCode, 400);
      assert.deepEqual(monobankRun.json(), {
        error: "auth_required",
        message:
          "Monobank source is configured, but no token is provided. Set MONOBANK_TOKEN or pass monobankToken.",
      });
      assert.equal(switchBackToFixture.statusCode, 200);
      assert.equal(fixtureRun.statusCode, 200);
    } finally {
      await server.close();
    }
  });
});

test("local API loads profile settings from storage unless environment overrides", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const previousSource = process.env.MONO_LEDGER_SYNC_SOURCE;
    const firstServer = createLocalApiServer({
      profile: "demo",
      source: "fixture",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 55668,
    });

    try {
      const switchResponse = await firstServer.inject({
        method: "POST",
        url: "/api/app/source",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          source: "monobank",
        }),
      });

      assert.equal(switchResponse.statusCode, 200);
      assert.equal(switchResponse.json().source, "monobank");
    } finally {
      await firstServer.close();
    }

    const storedServer = createLocalApiServer({
      profile: "demo",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 55669,
    });

    try {
      const storedConfig = await storedServer.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const [concurrentConfig, concurrentSync] = await Promise.all([
        storedServer.inject({
          method: "GET",
          url: "/api/app/config",
        }),
        storedServer.inject({
          method: "POST",
          url: "/api/sync/run",
        }),
      ]);

      assert.equal(storedConfig.statusCode, 200);
      assert.equal(storedConfig.json().source, "monobank");
      assert.equal(concurrentConfig.statusCode, 200);
      assert.equal(concurrentConfig.json().source, "monobank");
      assert.equal(concurrentSync.statusCode, 400);
      assert.equal(concurrentSync.json().error, "auth_required");
    } finally {
      await storedServer.close();
    }

    try {
      process.env.MONO_LEDGER_SYNC_SOURCE = "fixture";

      const envServer = createLocalApiServer({
        profile: "demo",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55670,
      });

      try {
        const envConfig = await envServer.inject({
          method: "GET",
          url: "/api/app/config",
        });

        assert.equal(envConfig.statusCode, 200);
        assert.equal(envConfig.json().source, "fixture");
      } finally {
        await envServer.close();
      }
    } finally {
      if (previousSource === undefined) {
        Reflect.deleteProperty(process.env, "MONO_LEDGER_SYNC_SOURCE");
      } else {
        process.env.MONO_LEDGER_SYNC_SOURCE = previousSource;
      }
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
      const configResponse = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const webhookPath = configResponse.json().webhook.path;

      const invalidLimitResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?limit=not-a-number",
      });
      const invalidStatusResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?status=unknown",
      });
      const invalidSortByResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?sortBy=raw_payload",
      });
      const invalidSortDirectionResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/transactions?sortDirection=sideways",
      });
      const unsupportedFormatResponse = await server.inject({
        method: "GET",
        url: "/api/exports/ledger?format=xlsx",
      });
      const unsupportedPresetResponse = await server.inject({
        method: "GET",
        url: "/api/exports/ledger?preset=unknown",
      });
      const webhookValidationResponse = await server.inject({
        method: "GET",
        url: webhookPath,
      });
      const webhookResponse = await server.inject({
        method: "POST",
        url: webhookPath,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(webhookEvent),
      });
      const invalidWebhookResponse = await server.inject({
        method: "POST",
        url: webhookPath,
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
      const webhookEventsResponse = await server.inject({
        method: "GET",
        url: "/api/webhooks/events",
      });
      const webhookBody = webhookResponse.json();
      const webhookEventsBody = webhookEventsResponse.json();

      assert.equal(invalidLimitResponse.statusCode, 400);
      assert.match(invalidLimitResponse.body, /limit/);
      assert.equal(invalidStatusResponse.statusCode, 400);
      assert.match(invalidStatusResponse.body, /status/);
      assert.equal(invalidSortByResponse.statusCode, 400);
      assert.match(invalidSortByResponse.body, /sortBy/);
      assert.equal(invalidSortDirectionResponse.statusCode, 400);
      assert.match(invalidSortDirectionResponse.body, /sortDirection/);
      assert.equal(unsupportedFormatResponse.statusCode, 400);
      assert.deepEqual(unsupportedFormatResponse.json(), {
        error: "unsupported_export_format",
        message:
          "Supported export formats: csv, json, jsonl, journal-csv, parquet, sqlite",
      });
      assert.equal(unsupportedPresetResponse.statusCode, 400);
      assert.deepEqual(unsupportedPresetResponse.json(), {
        error: "unsupported_export_preset",
        message:
          "Supported export presets: accountant-handoff, monthly-personal-finance, bookkeeping, budget-analysis, raw-transaction-archive",
      });
      assert.equal(webhookValidationResponse.statusCode, 200);
      assert.equal(webhookValidationResponse.body, "ok");
      assert.equal(webhookResponse.statusCode, 200);
      assert.equal(webhookBody.accepted, true);
      assert.equal(webhookBody.pullRequired, true);
      assert.equal(webhookBody.event.accountId, "fixture-account-uah-main");
      assert.equal(
        webhookBody.event.statementItemId,
        "fixture-webhook-validation-test",
      );
      assert.equal(webhookEventsResponse.statusCode, 200);
      assert.equal(webhookEventsBody.length, 1);
      assert.equal(
        webhookEventsBody[0].statementItemId,
        "fixture-webhook-validation-test",
      );
      assert.equal(webhookEventsBody[0].accountId, "fixture-account-uah-main");
      assert.equal(webhookEventsBody[0].type, "StatementItem");
      assert.equal(invalidWebhookResponse.statusCode, 400);
      assert.deepEqual(invalidWebhookResponse.json(), {
        error: "invalid_webhook_payload",
        message: "Webhook payload is malformed.",
      });
    } finally {
      await server.close();
    }
  });
});

test("local API deduplicates webhook deliveries by payload and delivery metadata", async () => {
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
          id: "fixture-webhook-duplicate-test",
          time: 1775031300,
          description: "Duplicate delivery transfer",
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
    const reorderedWebhookEventJson = JSON.stringify({
      data: {
        statementItem: {
          hold: false,
          balance: 97000,
          cashbackAmount: 0,
          commissionRate: 0,
          currencyCode: 980,
          operationAmount: -2500,
          amount: -2500,
          originalMcc: 4829,
          mcc: 4829,
          description: "Duplicate delivery transfer",
          time: 1775031300,
          id: "fixture-webhook-duplicate-test",
        },
        account: "fixture-account-uah-main",
      },
      type: "StatementItem",
    });

    try {
      const configResponse = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const webhookPath = configResponse.json().webhook.path;

      const firstResponse = await server.inject({
        method: "POST",
        url: webhookPath,
        headers: {
          "content-type": "application/json",
          "x-monobank-delivery-id": "delivery-111",
        },
        body: reorderedWebhookEventJson,
      });
      const secondResponse = await server.inject({
        method: "POST",
        url: webhookPath,
        headers: {
          "content-type": "application/json",
          "x-monobank-delivery-id": "delivery-111",
        },
        body: JSON.stringify(webhookEvent),
      });
      const thirdResponse = await server.inject({
        method: "POST",
        url: webhookPath,
        headers: {
          "content-type": "application/json",
          "x-monobank-delivery-id": "delivery-222",
        },
        body: JSON.stringify(webhookEvent),
      });
      const webhookEventsResponse = await server.inject({
        method: "GET",
        url: "/api/webhooks/events",
      });
      const webhookBody = webhookEventsResponse.json();

      assert.equal(firstResponse.statusCode, 200);
      assert.equal(secondResponse.statusCode, 200);
      assert.equal(thirdResponse.statusCode, 200);
      assert.deepEqual(firstResponse.json(), {
        accepted: true,
        pullRequired: true,
        event: {
          id: firstResponse.json().event.id,
          profile: "demo",
          accountId: "fixture-account-uah-main",
          type: "StatementItem",
          statementItemId: "fixture-webhook-duplicate-test",
          receivedAt: firstResponse.json().event.receivedAt,
          status: "pending",
          ...(firstResponse.json().event.processedAt === undefined
            ? {}
            : { processedAt: firstResponse.json().event.processedAt }),
        },
      });
      assert.equal(
        secondResponse.json().event.id,
        firstResponse.json().event.id,
        "duplicate delivery should not create a new webhook event",
      );
      assert.equal(secondResponse.json().event.status, "duplicate");
      assert.notEqual(
        thirdResponse.json().event.id,
        firstResponse.json().event.id,
        "different delivery metadata should create separate webhook events",
      );
      assert.equal(thirdResponse.json().event.status, "pending");
      assert.equal(webhookEventsResponse.statusCode, 200);
      assert.equal(webhookBody.length, 2);
      assert.equal(
        webhookBody.find((event) => event.id === firstResponse.json().event.id)
          ?.status,
        "duplicate",
      );
      assert.equal(
        webhookBody.find((event) => event.id === thirdResponse.json().event.id)
          ?.status,
        "pending",
      );
    } finally {
      await server.close();
    }
  });
});

test("local API does not log raw webhook payloads", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const logs = [];
    const server = createLocalApiServer({
      profile: "demo",
      source: "fixture",
      dataDir: tempRoot,
      logSink: (value) => {
        logs.push(value);
      },
    });
    const invalidWebhook = {
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
          hold: "bad-hold",
        },
      },
    };

    try {
      const configResponse = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const webhookPath = configResponse.json().webhook.path;

      const response = await server.inject({
        method: "POST",
        url: webhookPath,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(invalidWebhook),
      });

      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.json(), {
        error: "invalid_webhook_payload",
        message: "Webhook payload is malformed.",
      });
      assert.equal(
        logs.length,
        1,
        "malformed webhook payload should be logged once",
      );
      assert.match(logs[0], /Rejected malformed webhook payload/);
      assert.match(logs[0], /request.body/);
      assert.equal(logs[0].includes("Validation test transfer"), false);
      assert.equal(logs[0].includes("1775031300"), false);
      assert.equal(logs[0].includes("fixture-webhook-validation-test"), false);
    } finally {
      await server.close();
    }
  });
});

test("local API rate limits webhook delivery endpoint", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    let now = 0;
    const server = createLocalApiServer({
      profile: "demo",
      source: "fixture",
      dataDir: tempRoot,
      now: () => now,
      webhookRateLimitWindowMs: 50,
      webhookRateLimitMaxRequests: 1,
    });
    const webhookEvent = {
      type: "StatementItem",
      data: {
        account: "fixture-account-uah-main",
        statementItem: {
          id: "fixture-webhook-rate-limit-test",
          time: 1775031300,
          description: "Rate limit test transfer",
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
      const configResponse = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const webhookPath = configResponse.json().webhook.path;

      const firstResponse = await server.inject({
        method: "POST",
        url: webhookPath,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(webhookEvent),
      });
      const secondResponse = await server.inject({
        method: "POST",
        url: webhookPath,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(webhookEvent),
      });
      const otherAccountResponse = await server.inject({
        method: "POST",
        url: webhookPath,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...webhookEvent,
          data: {
            ...webhookEvent.data,
            account: "fixture-account-uah-secondary",
            statementItem: {
              ...webhookEvent.data.statementItem,
              id: "fixture-webhook-rate-limit-other-account",
            },
          },
        }),
      });
      now += 60;
      const thirdResponse = await server.inject({
        method: "POST",
        url: webhookPath,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...webhookEvent,
          data: {
            ...webhookEvent.data,
            statementItem: {
              ...webhookEvent.data.statementItem,
              id: "fixture-webhook-rate-limit-test-after",
            },
          },
        }),
      });

      assert.equal(firstResponse.statusCode, 200);
      assert.equal(firstResponse.json().accepted, true);
      assert.equal(secondResponse.statusCode, 429);
      assert.equal(secondResponse.json().error, "webhook_rate_limit_exceeded");
      assert.equal(otherAccountResponse.statusCode, 200);
      assert.equal(otherAccountResponse.json().accepted, true);
      assert.match(
        secondResponse.body,
        /Webhook endpoint rate limit exceeded/i,
      );
      assert.equal(thirdResponse.statusCode, 200);
    } finally {
      await server.close();
    }
  });
});

test("local API rate limits malformed webhook requests before repeated logging", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const logs = [];
    const server = createLocalApiServer({
      profile: "demo",
      source: "fixture",
      dataDir: tempRoot,
      webhookRateLimitWindowMs: 60_000,
      webhookRateLimitMaxRequests: 1,
      logSink: (line) => logs.push(line),
    });
    const malformedWebhookEvent = {
      type: "StatementItem",
      data: {
        account: "fixture-account-uah-main",
      },
    };

    try {
      const configResponse = await server.inject({
        method: "GET",
        url: "/api/app/config",
      });
      const webhookPath = configResponse.json().webhook.path;

      const firstResponse = await server.inject({
        method: "POST",
        url: webhookPath,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(malformedWebhookEvent),
      });
      const secondResponse = await server.inject({
        method: "POST",
        url: webhookPath,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(malformedWebhookEvent),
      });

      assert.equal(firstResponse.statusCode, 400);
      assert.equal(firstResponse.json().error, "invalid_webhook_payload");
      assert.equal(secondResponse.statusCode, 429);
      assert.equal(secondResponse.json().error, "webhook_rate_limit_exceeded");
      assert.equal(logs.length, 1);
    } finally {
      await server.close();
    }
  });
});
