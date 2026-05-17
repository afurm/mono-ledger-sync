import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import {
  createLedgerExport,
  exportPresetDefinitions,
} from "../dist/exports/index.js";
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
            entry.categoryId === "groceries"
          );
        }),
      );
      assert.equal(annotated.note, "Review with accountant");
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
          "subscriptions-mcc-or-text",
          "transport-mcc-or-text",
          "travel-mcc-or-text",
          "dining-mcc-or-text",
          "transfers-mcc-or-text",
          "uncategorized-fallback",
        ],
      );
      assert.equal(rules[0].categoryId, "income");
      assert.equal(rules[0].amountDirection, "income");
      assert.equal(rules[1].mcc, 5411);
      assert.equal(rules[1].descriptionContains, "grocery");
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

      assert.equal(result.run.status, "success");
      assert.equal(duplicateEvent?.status, "duplicate");
      assert.equal(pendingEvent?.status, "processed");
      assert.equal(typeof pendingEvent?.processedAt, "string");
      assert.equal(pendingEvent?.processedAt?.trim().length > 0, true);
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

test("records a partial run when sync is interrupted and keeps cursor untouched", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });
    const syncAbortController = new AbortController();
    let statementCalls = 0;
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
      async getStatement() {
        statementCalls += 1;

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
      assert.equal(
        await db.getSyncCursor(profile, "interrupted-account"),
        undefined,
      );
      assert.equal(statementCalls, 1);
      assert.equal(
        (await db.listLedgerEntries({ profile, limit: 20 })).total,
        1,
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
      ]);
      assert.equal(afterMigration.accounts, 1);
      assert.equal(afterMigration.ledgerEntries, 0);
      assert.equal(afterMigration.syncRuns, 0);
      assert.equal((await db.listCategories(profile)).length, 8);
      assert.equal((await db.listCategoryRules(profile)).length, 8);
      assert.deepEqual(await db.listBudgets(profile), []);
      assert.deepEqual(await db.listBudgetPeriods(profile), []);
      assert.deepEqual(await db.listRecurringItems(profile), []);
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
        assert.equal(
          afterMigration.migrations.at(-1),
          "0015_query_performance_indexes",
        );

        const summary = await db.getLedgerSummary(profile);
        assert.equal(summary.ledgerEntries, 2);
        assert.equal(summary.income, 500000);
        assert.equal(summary.expenses, 2450);
        assert.equal(summary.net, 497550);
        assert.equal(summary.lastSyncedAt, "2026-05-16T08:03:00.000Z");

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
      assert.ok(indexes.includes("idx_budgets_profile_category_period"));
      assert.ok(indexes.includes("idx_budget_periods_profile_period"));
    } finally {
      database.close();
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
      const taggedJsonExport = await createLedgerExport(db, {
        profile,
        format: "json",
        tag: "reviewed",
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
      const parsedTagged = JSON.parse(taggedJsonExport.body);
      assert.equal(parsedTagged.filters.tag, "reviewed");
      assert.equal(parsedTagged.total, 1);
      assert.equal(parsedTagged.entries.length, 1);
      assert.equal(parsedTagged.entries[0].id, firstTransaction.id);
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
      const categoriesResponse = await server.inject({
        method: "GET",
        url: "/api/ledger/categories",
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
      assert.equal(categoriesResponse.statusCode, 200);
      assert.deepEqual(
        categoriesResponse.json().map((category) => category.id),
        [
          "dining",
          "groceries",
          "income",
          "subscriptions",
          "transfers",
          "transport",
          "travel",
          "uncategorized",
        ],
      );
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
    });

    try {
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
        url: "/api/exports/ledger?format=sqlite",
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
        message: "Supported export formats: csv, json, jsonl, journal-csv",
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
        body: JSON.stringify(webhookEvent),
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
