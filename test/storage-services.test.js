import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

import { createBundledFixtureMonobankAdapter } from "../dist/monobank/index.js";
import {
  createLedgerQueryService,
  createLedgerQueryServices,
  createLedgerServices,
  createLedgerWriteService,
} from "../dist/storage/index.js";
import { createSqliteLedgerDb } from "../dist/sqlite/index.js";
import {
  createLedgerEntryFromStatementItem,
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

test("query service defaults profile and wraps storage reads", async () => {
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

      const queryService = createLedgerQueryService({
        db,
        defaultProfile: profile,
      });
      const queryServices = createLedgerQueryServices({
        db,
        defaultProfile: profile,
      });
      const summary = await queryService.getLedgerSummary();
      const netWorthTrend = await queryService.getNetWorthTrend();
      const accounts = await queryService.listAccounts();
      const jars = await queryService.listJars();
      const balances = await queryService.getAccountBalances();
      const page = await queryService.listLedgerEntries({
        limit: 3,
        sortBy: "time",
        sortDirection: "desc",
      });
      const categories = await queryService.listCategories();
      const categorySpending = await queryService.listCategorySpending();
      const budgets = await queryService.listBudgets();
      const budgetPeriods = await queryService.listBudgetPeriods();
      const budgetProgress = await queryService.listBudgetProgress();
      const recurringItems = await queryService.listRecurringItems();
      const runs = await queryService.listSyncRuns();
      const events = await queryService.listWebhookEvents();
      const groupedPage = await queryServices.transactions.listLedgerEntries({
        limit: 2,
        sortBy: "time",
        sortDirection: "desc",
      });
      const groupedBalances = await queryServices.balances.getAccountBalances();
      const groupedNetWorthTrend =
        await queryServices.balances.getNetWorthTrend();
      const groupedJars = await queryServices.balances.listJars();
      const groupedCategories = await queryServices.categories.listCategories();
      const groupedCategorySpending =
        await queryServices.categories.listCategorySpending();
      const groupedBudgets = await queryServices.budgets.listBudgets();
      const groupedBudgetPeriods =
        await queryServices.budgets.listBudgetPeriods();
      const groupedBudgetProgress =
        await queryServices.budgets.listBudgetProgress();
      const groupedRecurringItems =
        await queryServices.recurringItems.listRecurringItems();
      const groupedRuns = await queryServices.syncState.listSyncRuns();

      assert.equal(summary.profile, profile);
      assert.equal(summary.ledgerEntries, 7);
      assert.deepEqual(summary.monthToDate, {
        month: "2026-04",
        from: "2026-04-01",
        to: "2026-04-10",
        income: 8520000,
        expenses: 408650,
        net: 8111350,
      });
      assert.deepEqual(netWorthTrend, {
        enabled: false,
        reason: "Manual account and asset support is not enabled.",
        points: [],
      });
      assert.equal(accounts.length, 2);
      assert.equal(jars.length, 1);
      assert.equal(balances.length, 2);
      assert.equal(page.limit, 3);
      assert.equal(page.entries.length, 3);
      assert.equal(page.total, 7);
      const categoryIds = categories.map((category) => category.id);
      assert.equal(categoryIds.length > 0, true);
      assert.ok(categoryIds.includes("income"));
      assert.ok(categoryIds.includes("uncategorized"));
      assert.deepEqual(
        categorySpending.map((row) => [
          row.categoryId,
          row.currencyCode,
          row.amount,
        ]),
        [
          ["transfers", 980, 250000],
          ["groceries", 980, 84250],
          ["subscriptions", 840, 52900],
          ["travel", 978, 20000],
          ["transport", 980, 1500],
        ],
      );
      assert.deepEqual(budgets, []);
      assert.deepEqual(budgetPeriods, []);
      assert.deepEqual(budgetProgress, []);
      assert.deepEqual(recurringItems, []);
      assert.equal(runs.length, 1);
      assert.equal(runs[0].profile, profile);
      assert.ok(Array.isArray(events));
      assert.equal(groupedPage.entries.length, 2);
      assert.equal(groupedBalances.length, balances.length);
      assert.deepEqual(groupedNetWorthTrend, netWorthTrend);
      assert.equal(groupedJars.length, jars.length);
      assert.deepEqual(
        groupedCategories.map((category) => category.id),
        categoryIds,
      );
      assert.deepEqual(groupedCategorySpending, categorySpending);
      assert.deepEqual(groupedBudgets, []);
      assert.deepEqual(groupedBudgetPeriods, []);
      assert.deepEqual(groupedBudgetProgress, []);
      assert.deepEqual(groupedRecurringItems, []);
      assert.equal(groupedRuns.length, runs.length);
    } finally {
      await db.close();
    }
  });
});

test("query service ranks budget progress and overspend warnings", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();
      await db.importLocalConfiguration(profile, {
        budgets: [
          {
            id: "groceries-monthly",
            profile,
            categoryId: "groceries",
            currencyCode: 980,
            periodStart: "2026-05-01",
            periodEnd: "2026-05-31",
            amountLimit: 100000,
            rollover: false,
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-01T00:00:00.000Z",
          },
          {
            id: "transport-monthly",
            profile,
            categoryId: "transport",
            currencyCode: 980,
            periodStart: "2026-05-01",
            periodEnd: "2026-05-31",
            amountLimit: 50000,
            rollover: false,
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-01T00:00:00.000Z",
          },
        ],
        budgetPeriods: [
          {
            id: "groceries-2026-05",
            profile,
            budgetId: "groceries-monthly",
            periodStart: "2026-05-01",
            periodEnd: "2026-05-31",
            plannedAmount: 100000,
            actualAmount: 125000,
            status: "open",
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-17T08:00:00.000Z",
          },
          {
            id: "transport-2026-05",
            profile,
            budgetId: "transport-monthly",
            periodStart: "2026-05-01",
            periodEnd: "2026-05-31",
            plannedAmount: 50000,
            actualAmount: 44000,
            status: "open",
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-17T08:00:00.000Z",
          },
        ],
      });

      const queryService = createLedgerQueryService({
        db,
        defaultProfile: profile,
      });
      const queryServices = createLedgerQueryServices({
        db,
        defaultProfile: profile,
      });
      const progress = await queryService.listBudgetProgress();

      assert.deepEqual(
        progress.map((row) => [
          row.budgetId,
          row.categoryName,
          row.actualAmount,
          row.remainingAmount,
          row.progressPercentage,
          row.status,
        ]),
        [
          ["groceries-monthly", "Groceries", 125000, -25000, 125, "overspent"],
          ["transport-monthly", "Transport", 44000, 6000, 88, "near_limit"],
        ],
      );
      assert.deepEqual(
        await queryServices.budgets.listBudgetProgress(),
        progress,
      );
    } finally {
      await db.close();
    }
  });
});

test("write service creates monthly category budgets with live transaction progress", async () => {
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
        id: "monthly-budget-grocery",
        time: 1_775_001_600,
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

      const writeService = createLedgerWriteService({
        db,
        defaultProfile: profile,
      });
      const progress = await writeService.createMonthlyCategoryBudget({
        categoryId: "groceries",
        currencyCode: 980,
        month: "2026-04",
        amountLimit: 10_000,
      });

      assert.equal(progress.budgetId, "monthly-groceries-980-2026-04");
      assert.equal(progress.periodStart, "2026-04-01");
      assert.equal(progress.periodEnd, "2026-04-30");
      assert.equal(progress.amountLimit, 10_000);
      assert.equal(progress.actualAmount, 2450);
      assert.equal(progress.remainingAmount, 7550);
      assert.equal(progress.progressPercentage, 25);
      assert.equal(progress.status, "on_track");
    } finally {
      await db.close();
    }
  });
});

test("write service creates monthly income plans with live inflow progress", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const accountId = "fixture-account-uah-main";
      const salaryStatementItem = {
        id: "monthly-income-plan-salary",
        time: Math.floor(Date.parse("2026-04-05T09:00:00.000Z") / 1000),
        description: "Salary payment",
        mcc: 0,
        originalMcc: 0,
        amount: 85_000,
        operationAmount: 85_000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 185_000,
        hold: false,
      };
      const refundStatementItem = {
        id: "monthly-income-plan-refund",
        time: Math.floor(Date.parse("2026-04-08T09:00:00.000Z") / 1000),
        description: "Store refund",
        mcc: 5411,
        originalMcc: 5411,
        amount: 5_000,
        operationAmount: 5_000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 190_000,
        hold: false,
      };
      const expenseStatementItem = {
        id: "monthly-income-plan-expense",
        time: Math.floor(Date.parse("2026-04-10T09:00:00.000Z") / 1000),
        description: "Store groceries",
        mcc: 5411,
        originalMcc: 5411,
        amount: -6_000,
        operationAmount: -6_000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 184_000,
        hold: false,
      };

      await db.upsertStatementItems(
        accountId,
        [salaryStatementItem, refundStatementItem, expenseStatementItem],
        [
          {
            ...createLedgerEntryFromStatementItem(
              accountId,
              salaryStatementItem,
            ),
            categoryId: "income",
            categoryName: "Income",
            categorySource: "system_rule",
          },
          {
            ...createLedgerEntryFromStatementItem(
              accountId,
              refundStatementItem,
            ),
            categoryId: "income",
            categoryName: "Income",
            categorySource: "system_rule",
          },
          {
            ...createLedgerEntryFromStatementItem(
              accountId,
              expenseStatementItem,
            ),
            categoryId: "income",
            categoryName: "Income",
            categorySource: "system_rule",
          },
        ],
      );

      const writeService = createLedgerWriteService({
        db,
        defaultProfile: profile,
      });
      const queryService = createLedgerQueryService({
        db,
        defaultProfile: profile,
      });
      const progress = await writeService.createMonthlyCategoryBudget({
        categoryId: "income",
        currencyCode: 980,
        month: "2026-04",
        amountLimit: 100_000,
        rollover: true,
      });
      const incomeBudget = (await queryService.listBudgets()).find(
        (budget) => budget.id === progress.budgetId,
      );

      assert.equal(incomeBudget?.includeInflows, true);
      assert.equal(incomeBudget?.rollover, false);
      assert.equal(progress.categoryName, "Income");
      assert.equal(progress.amountLimit, 100_000);
      assert.equal(progress.actualAmount, 90_000);
      assert.equal(progress.remainingAmount, 10_000);
      assert.equal(progress.progressPercentage, 90);
      assert.equal(progress.status, "on_track");
    } finally {
      await db.close();
    }
  });
});

test("write service carries over remaining amount from previous rollover budget period", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const accountId = "fixture-account-uah-main";
      await db.upsertAccounts([
        {
          id: accountId,
          type: "account-uah",
          currencyCode: 980,
          balance: 200_000,
          creditLimit: 0,
        },
      ]);

      const previousMonthExpense = {
        id: "fixture-transfer-from-previous-month",
        time: Math.floor(Date.parse("2026-04-20T11:00:00.000Z") / 1000),
        description: "Store groceries",
        mcc: 5411,
        originalMcc: 5411,
        amount: -4_000,
        operationAmount: -4_000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 196_000,
        hold: false,
      };

      await db.upsertStatementItems(
        accountId,
        [previousMonthExpense],
        [
          {
            ...createLedgerEntryFromStatementItem(
              accountId,
              previousMonthExpense,
            ),
            categoryId: "groceries",
            categoryName: "Groceries",
            categorySource: "system_rule",
          },
        ],
      );

      const writeService = createLedgerWriteService({
        db,
        defaultProfile: profile,
      });
      const queryService = createLedgerQueryService({
        db,
        defaultProfile: profile,
      });

      await writeService.createMonthlyCategoryBudget({
        categoryId: "groceries",
        currencyCode: 980,
        month: "2026-04",
        amountLimit: 10_000,
        rollover: true,
      });

      const newProgress = await writeService.createMonthlyCategoryBudget({
        categoryId: "groceries",
        currencyCode: 980,
        month: "2026-05",
        amountLimit: 10_000,
        rollover: true,
      });
      const currentProgress = (await queryService.listBudgetProgress()).find(
        (row) => row.budgetId === newProgress.budgetId,
      );

      assert.equal(currentProgress?.amountLimit, 16_000);
      assert.equal(currentProgress?.remainingAmount, 16_000);
    } finally {
      await db.close();
    }
  });
});

test("write service does not inherit carryover without previous rollover flag", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const accountId = "fixture-account-uah-main";
      await db.upsertAccounts([
        {
          id: accountId,
          type: "account-uah",
          currencyCode: 980,
          balance: 200_000,
          creditLimit: 0,
        },
      ]);

      const previousMonthExpense = {
        id: "fixture-previous-month-no-rollover",
        time: Math.floor(Date.parse("2026-04-22T11:00:00.000Z") / 1000),
        description: "Store groceries",
        mcc: 5411,
        originalMcc: 5411,
        amount: -5_000,
        operationAmount: -5_000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 195_000,
        hold: false,
      };

      await db.upsertStatementItems(
        accountId,
        [previousMonthExpense],
        [
          {
            ...createLedgerEntryFromStatementItem(
              accountId,
              previousMonthExpense,
            ),
            categoryId: "groceries",
            categoryName: "Groceries",
            categorySource: "system_rule",
          },
        ],
      );

      const writeService = createLedgerWriteService({
        db,
        defaultProfile: profile,
      });
      const queryService = createLedgerQueryService({
        db,
        defaultProfile: profile,
      });

      await writeService.createMonthlyCategoryBudget({
        categoryId: "groceries",
        currencyCode: 980,
        month: "2026-04",
        amountLimit: 10_000,
        rollover: false,
      });

      const newProgress = await writeService.createMonthlyCategoryBudget({
        categoryId: "groceries",
        currencyCode: 980,
        month: "2026-05",
        amountLimit: 10_000,
        rollover: true,
      });
      const currentProgress = (await queryService.listBudgetProgress()).find(
        (row) => row.budgetId === newProgress.budgetId,
      );

      assert.equal(currentProgress?.amountLimit, 10_000);
      assert.equal(currentProgress?.remainingAmount, 10_000);
    } finally {
      await db.close();
    }
  });
});

test("write service ignores transfer-like entries when calculating budget progress", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const accountId = "fixture-account-uah-main";
      await db.upsertAccounts([
        {
          id: accountId,
          type: "account-uah",
          currencyCode: 980,
          balance: 200_000,
          creditLimit: 0,
        },
      ]);

      const groceryStatementItem = {
        id: "fixture-grocery-2026-04",
        time: Math.floor(Date.parse("2026-04-12T10:00:00.000Z") / 1000),
        description: "Store groceries",
        mcc: 5411,
        originalMcc: 5411,
        amount: -3_000,
        operationAmount: -3_000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 197_000,
        hold: false,
      };
      const transferStatementItem = {
        id: "fixture-transfer-2026-04",
        time: Math.floor(Date.parse("2026-04-12T11:00:00.000Z") / 1000),
        description: "Переказ на рахунок заощаджень",
        mcc: 6012,
        originalMcc: 6012,
        amount: -1_200,
        operationAmount: -1_200,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 195_800,
        hold: false,
      };

      await db.upsertStatementItems(
        accountId,
        [groceryStatementItem, transferStatementItem],
        [
          {
            ...createLedgerEntryFromStatementItem(
              accountId,
              groceryStatementItem,
            ),
            categoryId: "groceries",
            categoryName: "Groceries",
            categorySource: "system_rule",
          },
          {
            ...createLedgerEntryFromStatementItem(
              accountId,
              transferStatementItem,
            ),
            categoryId: "groceries",
            categoryName: "Groceries",
            categorySource: "system_rule",
          },
        ],
      );

      const writeService = createLedgerWriteService({
        db,
        defaultProfile: profile,
      });
      const progress = await writeService.createMonthlyCategoryBudget({
        categoryId: "groceries",
        currencyCode: 980,
        month: "2026-04",
        amountLimit: 10_000,
      });

      assert.equal(progress.actualAmount, 3_000);
      assert.equal(progress.status, "on_track");
    } finally {
      await db.close();
    }
  });
});

test("write service deletes monthly category budget periods", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();
      const writeService = createLedgerWriteService({
        db,
        defaultProfile: profile,
      });

      const progress = await writeService.createMonthlyCategoryBudget({
        categoryId: "groceries",
        currencyCode: 980,
        month: "2026-04",
        amountLimit: 10_000,
      });
      const queryService = createLedgerQueryService({
        db,
        defaultProfile: profile,
      });

      const notDeleted =
        await writeService.deleteMonthlyCategoryBudget("non-existent");
      assert.equal(notDeleted, false);

      const deleted = await writeService.deleteMonthlyCategoryBudget(
        progress.id,
      );

      assert.equal(deleted, true);
      assert.deepEqual(await queryService.listBudgetProgress(), []);
      assert.deepEqual(await queryService.listBudgets(), []);
      assert.deepEqual(await queryService.listBudgetPeriods(), []);
    } finally {
      await db.close();
    }
  });
});

test("write service delegates annotation and split-plan updates", async () => {
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

      const queryService = createLedgerQueryService({
        db,
        defaultProfile: profile,
      });
      const writeService = createLedgerWriteService({
        db,
        defaultProfile: profile,
      });
      const entry = (
        await queryService.listLedgerEntries({
          limit: 1,
          sortBy: "time",
          sortDirection: "asc",
        })
      ).entries.at(0);

      assert.ok(entry);

      const annotated = await writeService.updateTransactionAnnotation(
        entry.id,
        {
          note: "Reviewed in service layer",
          tags: ["service", "test"],
        },
      );

      assert.equal(annotated?.note, "Reviewed in service layer");
      assert.deepEqual(annotated?.tags, ["service", "test"]);

      const split = await writeService.updateTransactionSplitPlan(entry.id, {
        lines: [{ category: "testing", amount: 250 }],
      });

      assert.equal(split?.splitPlan?.length, 1);
      assert.equal(split?.splitPlan?.[0]?.category, "testing");
      assert.equal(split?.splitPlan?.[0]?.amount, 250);
    } finally {
      await db.close();
    }
  });
});

test("write service delegates bulk transaction edits", async () => {
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

      const queryService = createLedgerQueryService({
        db,
        defaultProfile: profile,
      });
      const writeService = createLedgerWriteService({
        db,
        defaultProfile: profile,
      });
      const entries = (
        await queryService.listLedgerEntries({
          limit: 2,
          sortBy: "time",
          sortDirection: "asc",
        })
      ).entries;

      assert.equal(entries.length, 2);

      const updated = await writeService.updateTransactionsBulk(
        entries.map((entry) => entry.id),
        {
          categoryId: "subscriptions",
          merchantName: "Service Bulk Merchant",
          tags: ["service", "service", "bulk"],
        },
      );

      assert.deepEqual(
        updated.map((entry) => [
          entry.id,
          entry.categoryId,
          entry.categoryName,
          entry.merchantName,
          entry.tags,
        ]),
        entries.map((entry) => [
          entry.id,
          "subscriptions",
          "Subscriptions",
          "Service Bulk Merchant",
          ["service", "bulk"],
        ]),
      );
    } finally {
      await db.close();
    }
  });
});

test("query service projects upcoming recurring payments", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    try {
      await db.migrate();

      const database = new Database(databasePath);

      try {
        database.pragma("foreign_keys = ON");
        database.exec(`
          INSERT INTO accounts (
            profile,
            id,
            type,
            currency_code,
            balance,
            credit_limit,
            masked_pan_json,
            raw_json,
            updated_at
          ) VALUES (
            'demo',
            'account-uah',
            'black',
            980,
            100000,
            0,
            NULL,
            '{}',
            '2026-05-17T08:00:00.000Z'
          );

          INSERT INTO recurring_items (
            profile,
            id,
            account_id,
            category_id,
            merchant_name,
            frequency,
            expected_amount_min,
            expected_amount_max,
            is_active,
            started_at,
            last_seen_at,
            created_at,
            updated_at
          ) VALUES
            (
              'demo',
              'weekly-gym',
              'account-uah',
              'subscriptions',
              'Fixture Gym',
              'weekly',
              15000,
              15000,
              1,
              '2026-04-01T00:00:00.000Z',
              '2026-05-10T08:00:00.000Z',
              '2026-04-01T00:00:00.000Z',
              '2026-05-10T08:00:00.000Z'
            ),
            (
              'demo',
              'monthly-internet',
              'account-uah',
              'subscriptions',
              'Fixture Internet',
              'monthly',
              42000,
              46000,
              1,
              '2026-01-20T00:00:00.000Z',
              '2026-04-20T08:00:00.000Z',
              '2026-01-20T00:00:00.000Z',
              '2026-04-20T08:00:00.000Z'
            ),
            (
              'demo',
              'inactive-plan',
              'account-uah',
              'subscriptions',
              'Inactive Plan',
              'monthly',
              1000,
              1000,
              0,
              '2026-01-01T00:00:00.000Z',
              '2026-04-01T00:00:00.000Z',
              '2026-01-01T00:00:00.000Z',
              '2026-04-01T00:00:00.000Z'
            );
        `);
      } finally {
        database.close();
      }

      const queryService = createLedgerQueryService({
        db,
        defaultProfile: profile,
      });
      const queryServices = createLedgerQueryServices({
        db,
        defaultProfile: profile,
      });
      const upcoming = await queryService.listUpcomingRecurringPayments(
        undefined,
        new Date("2026-05-17T12:00:00.000Z"),
      );

      assert.deepEqual(
        upcoming.map((payment) => [
          payment.recurringItemId,
          payment.nextDueAt,
          payment.daysUntilDue,
          payment.expectedAmountMin,
          payment.expectedAmountMax,
          payment.currencyCode,
          payment.isOverdue,
        ]),
        [
          [
            "weekly-gym",
            "2026-05-17T00:00:00.000Z",
            0,
            15000,
            15000,
            980,
            false,
          ],
          [
            "monthly-internet",
            "2026-05-20T00:00:00.000Z",
            3,
            42000,
            46000,
            980,
            false,
          ],
        ],
      );
      assert.deepEqual(
        await queryServices.recurringItems.listUpcomingRecurringPayments(
          undefined,
          new Date("2026-05-17T12:00:00.000Z"),
        ),
        upcoming,
      );
    } finally {
      await db.close();
    }
  });
});

test("write service runs transaction edits inside explicit boundaries", async () => {
  const calls = [];
  const db = {
    async transaction(callback) {
      calls.push({ type: "begin" });

      const result = await callback({
        async updateLedgerEntryAnnotation(profile, id, update) {
          calls.push({ type: "annotation", profile, id, update });
          return {
            id,
            accountId: "account",
            time: 1,
            description: "entry",
            amount: 1,
            currencyCode: 980,
            rawStatementItemId: "raw",
          };
        },
        async updateLedgerEntriesBulkEdit(profile, ids, update) {
          calls.push({ type: "bulk", profile, ids, update });
          return ids.map((id) => ({
            id,
            accountId: "account",
            time: 1,
            description: "entry",
            amount: 1,
            currencyCode: 980,
            rawStatementItemId: "raw",
            ...update,
          }));
        },
        async updateLedgerEntrySplitPlan(profile, id, update) {
          calls.push({ type: "split", profile, id, update });
          return {
            id,
            accountId: "account",
            time: 1,
            description: "entry",
            amount: 1,
            currencyCode: 980,
            rawStatementItemId: "raw",
          };
        },
        async upsertLedgerEntries() {},
        async setSyncCursor() {},
      });

      calls.push({ type: "commit" });
      return result;
    },
  };
  const writeService = createLedgerWriteService({
    db,
    defaultProfile: "demo",
  });

  await writeService.updateTransactionNote("entry-1", "Reviewed");
  await writeService.updateTransactionTags("entry-1", ["reviewed"], " ");
  await writeService.updateTransactionsBulk(
    ["entry-1", "entry-2"],
    {
      categoryId: "groceries",
      merchantName: "Bulk Merchant",
      tags: ["bulk"],
    },
    " ",
  );
  await writeService.updateTransactionSplitPlan("entry-1", {
    lines: [{ category: "Groceries", amount: 100 }],
  });

  assert.deepEqual(
    calls.map((call) => call.type),
    [
      "begin",
      "annotation",
      "commit",
      "begin",
      "annotation",
      "commit",
      "begin",
      "bulk",
      "commit",
      "begin",
      "split",
      "commit",
    ],
  );
  assert.deepEqual(calls[1], {
    type: "annotation",
    profile: "demo",
    id: "entry-1",
    update: { note: "Reviewed" },
  });
  assert.deepEqual(calls[4], {
    type: "annotation",
    profile: "demo",
    id: "entry-1",
    update: { tags: ["reviewed"] },
  });
  assert.deepEqual(calls[7], {
    type: "bulk",
    profile: "demo",
    ids: ["entry-1", "entry-2"],
    update: {
      categoryId: "groceries",
      merchantName: "Bulk Merchant",
      tags: ["bulk"],
    },
  });
  assert.deepEqual(calls[10], {
    type: "split",
    profile: "demo",
    id: "entry-1",
    update: { lines: [{ category: "Groceries", amount: 100 }] },
  });
});

test("ledger services factory returns both query and write surfaces", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile: "demo",
    });
    const services = createLedgerServices({
      db,
      defaultProfile: "demo",
    });

    try {
      assert.equal(typeof services.query.getLedgerSummary, "function");
      assert.equal(typeof services.query.getNetWorthTrend, "function");
      assert.equal(
        typeof services.queries.transactions.listLedgerEntries,
        "function",
      );
      assert.equal(typeof services.queries.balances.listAccounts, "function");
      assert.equal(
        typeof services.queries.balances.getNetWorthTrend,
        "function",
      );
      assert.equal(
        typeof services.queries.categories.listCategories,
        "function",
      );
      assert.equal(typeof services.queries.budgets.listBudgets, "function");
      assert.equal(
        typeof services.queries.budgets.listBudgetPeriods,
        "function",
      );
      assert.equal(
        typeof services.queries.budgets.listBudgetProgress,
        "function",
      );
      assert.equal(
        typeof services.queries.recurringItems.listRecurringItems,
        "function",
      );
      assert.equal(typeof services.queries.syncState.listSyncRuns, "function");
      assert.equal(
        typeof services.write.updateTransactionSplitPlan,
        "function",
      );
    } finally {
      await db.close();
    }
  });
});
