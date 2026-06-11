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
      const savingsGoalProgress = await queryService.listSavingsGoalProgress();
      const balances = await queryService.getAccountBalances();
      const page = await queryService.listLedgerEntries({
        limit: 3,
        sortBy: "time",
        sortDirection: "desc",
      });
      const categories = await queryService.listCategories();
      const categorySpending = await queryService.listCategorySpending();
      const cashflowReport = await queryService.getCashflowReport();
      const categoryTrendReport = await queryService.getCategoryTrendReport();
      const monthlySpendingReport =
        await queryService.getMonthlySpendingReport();
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
      const groupedSavingsGoalProgress =
        await queryServices.balances.listSavingsGoalProgress();
      const groupedCategories = await queryServices.categories.listCategories();
      const groupedCategorySpending =
        await queryServices.categories.listCategorySpending();
      const groupedCashflowReport =
        await queryServices.reports.getCashflowReport();
      const groupedCategoryTrendReport =
        await queryServices.reports.getCategoryTrendReport();
      const groupedMonthlySpendingReport =
        await queryServices.reports.getMonthlySpendingReport();
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
      assert.deepEqual(savingsGoalProgress, [
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
          updatedAt: savingsGoalProgress[0]?.updatedAt,
        },
      ]);
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
      assert.equal(cashflowReport.months, 6);
      assert.equal(cashflowReport.from, "2025-11-01");
      assert.equal(cashflowReport.to, "2026-04-30");
      assert.equal(cashflowReport.totalIncome, 8520000);
      assert.equal(cashflowReport.totalExpenses, 408650);
      assert.equal(cashflowReport.netCashflow, 8111350);
      assert.equal(cashflowReport.transactionCount, 7);
      assert.deepEqual(
        cashflowReport.totals.map((row) => [
          row.currencyCode,
          row.income,
          row.expenses,
          row.net,
          row.transactionCount,
        ]),
        [
          [980, 8500000, 335750, 8164250, 4],
          [840, 0, 52900, -52900, 1],
          [978, 20000, 20000, 0, 2],
        ],
      );
      assert.deepEqual(
        cashflowReport.points.map((row) => [
          row.month,
          row.currencyCode,
          row.income,
          row.expenses,
          row.net,
          row.transactionCount,
        ]),
        [
          ["2026-04", 840, 0, 52900, -52900, 1],
          ["2026-04", 978, 20000, 20000, 0, 2],
          ["2026-04", 980, 8500000, 335750, 8164250, 4],
        ],
      );
      const singleMonthCashflowReport = await queryService.getCashflowReport(
        undefined,
        1,
      );

      assert.equal(singleMonthCashflowReport.from, "2026-04-01");
      assert.equal(singleMonthCashflowReport.to, "2026-04-30");
      assert.equal(categoryTrendReport.months, 6);
      assert.equal(categoryTrendReport.from, "2025-11-01");
      assert.equal(categoryTrendReport.to, "2026-04-30");
      assert.equal(categoryTrendReport.totalExpenses, 408650);
      assert.equal(categoryTrendReport.transactionCount, 5);
      assert.deepEqual(
        categoryTrendReport.categories.map((row) => [
          row.categoryId,
          row.currencyCode,
          row.amount,
          row.transactionCount,
          row.averageMonthlyAmount,
        ]),
        [
          ["transfers", 980, 250000, 1, 41667],
          ["groceries", 980, 84250, 1, 14042],
          ["subscriptions", 840, 52900, 1, 8817],
          ["travel", 978, 20000, 1, 3333],
          ["transport", 980, 1500, 1, 250],
        ],
      );
      assert.deepEqual(
        categoryTrendReport.points.map((row) => [
          row.month,
          row.categoryId,
          row.currencyCode,
          row.amount,
          row.transactionCount,
        ]),
        [
          ["2026-04", "transfers", 980, 250000, 1],
          ["2026-04", "groceries", 980, 84250, 1],
          ["2026-04", "subscriptions", 840, 52900, 1],
          ["2026-04", "travel", 978, 20000, 1],
          ["2026-04", "transport", 980, 1500, 1],
        ],
      );
      assert.equal(monthlySpendingReport.month, "2026-04");
      assert.equal(monthlySpendingReport.from, "2026-04-01");
      assert.equal(monthlySpendingReport.to, "2026-04-30");
      assert.equal(monthlySpendingReport.totalExpenses, 408650);
      assert.equal(monthlySpendingReport.transactionCount, 5);
      assert.equal(monthlySpendingReport.averageTransactionAmount, 81730);
      assert.deepEqual(
        monthlySpendingReport.currencyTotals.map((row) => [
          row.currencyCode,
          row.amount,
          row.transactionCount,
          row.averageTransactionAmount,
        ]),
        [
          [980, 335750, 3, 111917],
          [840, 52900, 1, 52900],
          [978, 20000, 1, 20000],
        ],
      );
      assert.deepEqual(
        monthlySpendingReport.categories.map((row) => [
          row.categoryId,
          row.currencyCode,
          row.amount,
          row.transactionCount,
          row.sharePercentage,
        ]),
        [
          ["transfers", 980, 250000, 1, 74.46],
          ["groceries", 980, 84250, 1, 25.09],
          ["subscriptions", 840, 52900, 1, 100],
          ["travel", 978, 20000, 1, 100],
          ["transport", 980, 1500, 1, 0.45],
        ],
      );
      assert.deepEqual(
        monthlySpendingReport.merchants.map((row) => [
          row.merchantName,
          row.currencyCode,
          row.amount,
          row.transactionCount,
        ]),
        [
          ["Emergency fund top-up", 980, 250000, 1],
          ["Fixture Grocery", 980, 84250, 1],
          ["Cloud Subscription", 840, 52900, 1],
          ["Travel booking", 978, 20000, 1],
          ["Kyiv Metro", 980, 1500, 1],
        ],
      );
      const emptyMonthlySpendingReport =
        await queryService.getMonthlySpendingReport(undefined, "2026-05");

      assert.deepEqual(
        {
          ...emptyMonthlySpendingReport,
          generatedAt: "generated",
        },
        {
          profile,
          month: "2026-05",
          from: "2026-05-01",
          to: "2026-05-31",
          generatedAt: "generated",
          totalExpenses: 0,
          transactionCount: 0,
          averageTransactionAmount: 0,
          currencies: [],
          currencyTotals: [],
          categories: [],
          merchants: [],
        },
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
      assert.deepEqual(groupedSavingsGoalProgress, savingsGoalProgress);
      assert.deepEqual(
        groupedCategories.map((category) => category.id),
        categoryIds,
      );
      assert.deepEqual(groupedCategorySpending, categorySpending);
      assert.deepEqual(
        {
          ...groupedCashflowReport,
          generatedAt: "generated",
        },
        {
          ...cashflowReport,
          generatedAt: "generated",
        },
      );
      assert.deepEqual(
        {
          ...groupedCategoryTrendReport,
          generatedAt: "generated",
        },
        {
          ...categoryTrendReport,
          generatedAt: "generated",
        },
      );
      assert.deepEqual(
        {
          ...groupedMonthlySpendingReport,
          generatedAt: "generated",
        },
        {
          ...monthlySpendingReport,
          generatedAt: "generated",
        },
      );
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

test("write service closes and reopens monthly budget periods", async () => {
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

      const writeService = createLedgerWriteService({
        db,
        defaultProfile: profile,
      });
      const queryService = createLedgerQueryService({
        db,
        defaultProfile: profile,
      });
      const progress = await writeService.createMonthlyCategoryBudget({
        categoryId: "groceries",
        currencyCode: 980,
        month: "2026-04",
        amountLimit: 100_000,
        rollover: true,
      });

      assert.equal(
        await writeService.closeMonthlyBudgetPeriod("non-existent"),
        undefined,
      );

      const closed = await writeService.closeMonthlyBudgetPeriod(progress.id);
      const closedPeriod = (await queryService.listBudgetPeriods()).find(
        (period) => period.id === progress.id,
      );

      assert.equal(closed?.actualAmount, 84_250);
      assert.equal(closedPeriod?.status, "closed");
      assert.equal(closedPeriod?.actualAmount, 84_250);

      const accountId = "fixture-account-uah-main";
      const extraGroceryStatementItem = {
        id: "closed-budget-extra-grocery",
        time: Math.floor(Date.parse("2026-04-12T09:00:00.000Z") / 1000),
        description: "Extra groceries",
        mcc: 5411,
        originalMcc: 5411,
        amount: -10_000,
        operationAmount: -10_000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 0,
        balance: 120_000,
        hold: false,
      };

      await db.upsertStatementItems(
        accountId,
        [extraGroceryStatementItem],
        [
          {
            ...createLedgerEntryFromStatementItem(
              accountId,
              extraGroceryStatementItem,
            ),
            categoryId: "groceries",
            categoryName: "Groceries",
            categorySource: "system_rule",
          },
        ],
      );

      const frozen = (await queryService.listBudgetProgress()).find(
        (row) => row.id === progress.id,
      );
      const repeatedClose = await writeService.closeMonthlyBudgetPeriod(
        progress.id,
      );
      const rolloverProgress = await writeService.createMonthlyCategoryBudget({
        categoryId: "groceries",
        currencyCode: 980,
        month: "2026-05",
        amountLimit: 100_000,
        rollover: true,
      });
      const historicalClose = await writeService.closeMonthlyBudgetPeriod(
        progress.id,
      );
      const reopened = await writeService.reopenMonthlyBudgetPeriod(
        progress.id,
      );
      const reopenedPeriod = (await queryService.listBudgetPeriods()).find(
        (period) => period.id === progress.id,
      );

      await db.updateMonthlyBudgetPeriodStatus(profile, progress.id, "closed");
      const closedWithoutStoredActual =
        await writeService.closeMonthlyBudgetPeriod(progress.id);

      assert.equal(frozen?.actualAmount, 84_250);
      assert.equal(repeatedClose?.actualAmount, 84_250);
      assert.equal(rolloverProgress.amountLimit, 115_750);
      assert.equal(historicalClose?.id, progress.id);
      assert.equal(historicalClose?.actualAmount, 84_250);
      assert.equal(reopened?.actualAmount, 94_250);
      assert.equal(reopened?.status, "near_limit");
      assert.equal(reopenedPeriod?.status, "open");
      assert.equal(reopenedPeriod?.actualAmount, undefined);
      assert.equal(closedWithoutStoredActual?.actualAmount, 94_250);
      assert.equal(
        await writeService.reopenMonthlyBudgetPeriod("non-existent"),
        undefined,
      );
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

test("query service projects a bounded recurring calendar", async () => {
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
              'yearly-insurance',
              'account-uah',
              'subscriptions',
              'Annual Insurance',
              'yearly',
              120000,
              120000,
              1,
              '2025-06-15T00:00:00.000Z',
              '2025-06-15T00:00:00.000Z',
              '2025-06-15T00:00:00.000Z',
              '2025-06-15T00:00:00.000Z'
            ),
            (
              'demo',
              'irregular-storage',
              'account-uah',
              'subscriptions',
              'Irregular Storage',
              'irregular',
              9000,
              12000,
              1,
              '2026-06-05T00:00:00.000Z',
              NULL,
              '2026-06-05T00:00:00.000Z',
              '2026-06-05T00:00:00.000Z'
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
      const calendar = await queryService.listRecurringCalendar(
        undefined,
        new Date("2026-05-17T12:00:00.000Z"),
        new Date("2026-07-20T12:00:00.000Z"),
      );
      const byRecurringItem = new Map();

      for (const event of calendar) {
        const rows = byRecurringItem.get(event.recurringItemId) ?? [];

        rows.push(event);
        byRecurringItem.set(event.recurringItemId, rows);
      }

      assert.deepEqual(
        calendar
          .slice(0, 4)
          .map((event) => [
            event.recurringItemId,
            event.date,
            event.month,
            event.currencyCode,
          ]),
        [
          ["weekly-gym", "2026-05-17", "2026-05", 980],
          ["monthly-internet", "2026-05-20", "2026-05", 980],
          ["weekly-gym", "2026-05-24", "2026-05", 980],
          ["weekly-gym", "2026-05-31", "2026-05", 980],
        ],
      );
      assert.deepEqual(
        byRecurringItem
          .get("monthly-internet")
          ?.map((event) => [
            event.date,
            event.expectedAmountMin,
            event.expectedAmountMax,
          ]),
        [
          ["2026-05-20", 42000, 46000],
          ["2026-06-20", 42000, 46000],
          ["2026-07-20", 42000, 46000],
        ],
      );
      assert.deepEqual(
        byRecurringItem
          .get("yearly-insurance")
          ?.map((event) => [event.date, event.frequency]),
        [["2026-06-15", "yearly"]],
      );
      assert.deepEqual(
        byRecurringItem
          .get("irregular-storage")
          ?.map((event) => [event.date, event.frequency]),
        [["2026-06-05", "irregular"]],
      );
      assert.equal(byRecurringItem.has("inactive-plan"), false);
      assert.deepEqual(
        await queryServices.recurringItems.listRecurringCalendar(
          undefined,
          new Date("2026-05-17T12:00:00.000Z"),
          new Date("2026-07-20T12:00:00.000Z"),
        ),
        calendar,
      );
      await assert.rejects(
        () =>
          queryService.listRecurringCalendar(
            undefined,
            new Date("2026-07-20T12:00:00.000Z"),
            new Date("2026-05-17T12:00:00.000Z"),
          ),
        /range start must be before end/,
      );
      await assert.rejects(
        () =>
          queryService.listRecurringCalendar(
            undefined,
            new Date("2026-01-01T12:00:00.000Z"),
            new Date("2027-12-31T12:00:00.000Z"),
          ),
        /cannot exceed 370 days/,
      );
    } finally {
      await db.close();
    }
  });
});

test("query service detects missed recurring payments by expected amount range", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    function timestamp(value) {
      return Math.floor(Date.parse(value) / 1000);
    }

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
            '2026-06-21T08:00:00.000Z'
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
              'monthly-paid',
              'account-uah',
              'subscriptions',
              'Paid Internet',
              'monthly',
              42000,
              46000,
              1,
              '2026-01-10T00:00:00.000Z',
              '2026-05-10T08:00:00.000Z',
              '2026-01-10T00:00:00.000Z',
              '2026-05-10T08:00:00.000Z'
            ),
            (
              'demo',
              'monthly-missed',
              'account-uah',
              'subscriptions',
              'Missed Storage',
              'monthly',
              15000,
              17000,
              1,
              '2026-01-05T00:00:00.000Z',
              '2026-05-05T08:00:00.000Z',
              '2026-01-05T00:00:00.000Z',
              '2026-05-05T08:00:00.000Z'
            ),
            (
              'demo',
              'monthly-increased',
              'account-uah',
              'subscriptions',
              'Raised Cloud',
              'monthly',
              30000,
              32000,
              1,
              '2026-01-12T00:00:00.000Z',
              '2026-05-12T08:00:00.000Z',
              '2026-01-12T00:00:00.000Z',
              '2026-05-12T08:00:00.000Z'
            ),
            (
              'demo',
              'weekly-grace',
              'account-uah',
              'subscriptions',
              'Grace Weekly',
              'weekly',
              9000,
              9000,
              1,
              '2026-06-13T00:00:00.000Z',
              '2026-06-13T08:00:00.000Z',
              '2026-06-13T00:00:00.000Z',
              '2026-06-13T08:00:00.000Z'
            ),
            (
              'demo',
              'inactive-missed',
              'account-uah',
              'subscriptions',
              'Inactive Missed',
              'monthly',
              1000,
              1000,
              0,
              '2026-01-01T00:00:00.000Z',
              '2026-05-01T08:00:00.000Z',
              '2026-01-01T00:00:00.000Z',
              '2026-05-01T08:00:00.000Z'
            );
        `);

        const insertEntry = database.prepare(`
          INSERT INTO ledger_entries (
            profile,
            id,
            account_id,
            time,
            description,
            amount,
            currency_code,
            category_id,
            category_name,
            merchant_name,
            raw_statement_item_id,
            hold,
            created_at,
            updated_at
          ) VALUES (
            @profile,
            @id,
            @accountId,
            @time,
            @description,
            @amount,
            @currencyCode,
            @categoryId,
            @categoryName,
            @merchantName,
            @rawStatementItemId,
            @hold,
            @createdAt,
            @updatedAt
          )
        `);

        for (const [id, date, merchantName, amount] of [
          ["paid-internet-june", "2026-06-11", "Paid Internet", -43000],
          ["raised-cloud-june", "2026-06-12", "Raised Cloud", -39000],
        ]) {
          insertEntry.run({
            profile,
            id,
            accountId: "account-uah",
            time: timestamp(`${date}T08:00:00.000Z`),
            description: merchantName,
            amount,
            currencyCode: 980,
            categoryId: "subscriptions",
            categoryName: "Subscriptions",
            merchantName,
            rawStatementItemId: `raw-${id}`,
            hold: 0,
            createdAt: `${date}T08:00:00.000Z`,
            updatedAt: `${date}T08:00:00.000Z`,
          });
        }
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
      const missedPayments = await queryService.listMissedRecurringPayments(
        undefined,
        new Date("2026-06-21T12:00:00.000Z"),
      );

      assert.deepEqual(
        missedPayments.map((payment) => [
          payment.recurringItemId,
          payment.expectedDate,
          payment.daysOverdue,
          payment.expectedAmountMin,
          payment.expectedAmountMax,
          payment.matchWindowStart.slice(0, 10),
          payment.matchWindowEnd.slice(0, 10),
        ]),
        [
          [
            "monthly-missed",
            "2026-06-05",
            16,
            15000,
            17000,
            "2026-06-02",
            "2026-06-08",
          ],
          [
            "monthly-increased",
            "2026-06-12",
            9,
            30000,
            32000,
            "2026-06-09",
            "2026-06-15",
          ],
        ],
      );
      assert.deepEqual(
        missedPayments.map((payment) => [
          payment.currencyCode,
          payment.frequency,
          payment.lastSeenAt,
        ]),
        [
          [980, "monthly", "2026-05-05T08:00:00.000Z"],
          [980, "monthly", "2026-05-12T08:00:00.000Z"],
        ],
      );
      assert.deepEqual(
        await queryServices.recurringItems.listMissedRecurringPayments(
          undefined,
          new Date("2026-06-21T12:00:00.000Z"),
        ),
        missedPayments,
      );
    } finally {
      await db.close();
    }
  });
});

test("query service detects subscription increase alerts from latest charges", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    function timestamp(value) {
      return Math.floor(Date.parse(value) / 1000);
    }

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
            '2026-06-21T08:00:00.000Z'
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
              'in-range-stream',
              'account-uah',
              'subscriptions',
              'In Range Stream',
              'monthly',
              14000,
              16000,
              1,
              '2026-01-01T00:00:00.000Z',
              '2026-05-01T08:00:00.000Z',
              '2026-01-01T00:00:00.000Z',
              '2026-05-01T08:00:00.000Z'
            ),
            (
              'demo',
              'increased-cloud',
              'account-uah',
              'subscriptions',
              'Raised Cloud',
              'monthly',
              30000,
              32000,
              1,
              '2026-01-12T00:00:00.000Z',
              '2026-05-12T08:00:00.000Z',
              '2026-01-12T00:00:00.000Z',
              '2026-05-12T08:00:00.000Z'
            ),
            (
              'demo',
              'returned-plan',
              'account-uah',
              'subscriptions',
              'Returned Plan',
              'monthly',
              20000,
              25000,
              1,
              '2026-01-15T00:00:00.000Z',
              '2026-05-15T08:00:00.000Z',
              '2026-01-15T00:00:00.000Z',
              '2026-05-15T08:00:00.000Z'
            ),
            (
              'demo',
              'missing-max',
              'account-uah',
              'subscriptions',
              'No Max Plan',
              'monthly',
              10000,
              NULL,
              1,
              '2026-01-20T00:00:00.000Z',
              '2026-05-20T08:00:00.000Z',
              '2026-01-20T00:00:00.000Z',
              '2026-05-20T08:00:00.000Z'
            ),
            (
              'demo',
              'held-increase',
              'account-uah',
              'subscriptions',
              'Held Increase',
              'monthly',
              9000,
              10000,
              1,
              '2026-01-25T00:00:00.000Z',
              '2026-05-25T08:00:00.000Z',
              '2026-01-25T00:00:00.000Z',
              '2026-05-25T08:00:00.000Z'
            ),
            (
              'demo',
              'inactive-increase',
              'account-uah',
              'subscriptions',
              'Inactive Increase',
              'monthly',
              9000,
              10000,
              0,
              '2026-01-25T00:00:00.000Z',
              '2026-05-25T08:00:00.000Z',
              '2026-01-25T00:00:00.000Z',
              '2026-05-25T08:00:00.000Z'
            );
        `);

        const insertEntry = database.prepare(`
          INSERT INTO ledger_entries (
            profile,
            id,
            account_id,
            time,
            description,
            amount,
            currency_code,
            category_id,
            category_name,
            merchant_name,
            raw_statement_item_id,
            hold,
            created_at,
            updated_at
          ) VALUES (
            @profile,
            @id,
            @accountId,
            @time,
            @description,
            @amount,
            @currencyCode,
            @categoryId,
            @categoryName,
            @merchantName,
            @rawStatementItemId,
            @hold,
            @createdAt,
            @updatedAt
          )
        `);

        for (const [id, date, merchantName, amount, hold] of [
          ["stream-june", "2026-06-01", "In Range Stream", -15900, 0],
          ["raised-cloud-june", "2026-06-12", "Raised Cloud", -39000, 0],
          ["returned-plan-may", "2026-05-15", "Returned Plan", -30000, 0],
          ["returned-plan-june", "2026-06-15", "Returned Plan", -24000, 0],
          ["no-max-plan-june", "2026-06-20", "No Max Plan", -50000, 0],
          ["held-increase-june", "2026-06-18", "Held Increase", -20000, 1],
          [
            "inactive-increase-june",
            "2026-06-18",
            "Inactive Increase",
            -20000,
            0,
          ],
        ]) {
          insertEntry.run({
            profile,
            id,
            accountId: "account-uah",
            time: timestamp(`${date}T08:00:00.000Z`),
            description: merchantName,
            amount,
            currencyCode: 980,
            categoryId: "subscriptions",
            categoryName: "Subscriptions",
            merchantName,
            rawStatementItemId: `raw-${id}`,
            hold,
            createdAt: `${date}T08:00:00.000Z`,
            updatedAt: `${date}T08:00:00.000Z`,
          });
        }
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
      const alerts = await queryService.listSubscriptionIncreaseAlerts(
        undefined,
        new Date("2026-06-21T12:00:00.000Z"),
      );

      assert.deepEqual(
        alerts.map((alert) => [
          alert.recurringItemId,
          alert.ledgerEntryId,
          alert.expectedAmountMin,
          alert.expectedAmountMax,
          alert.actualAmount,
          alert.increaseAmount,
          alert.increasePercentage,
          alert.occurredAt,
        ]),
        [
          [
            "increased-cloud",
            "raised-cloud-june",
            30000,
            32000,
            39000,
            7000,
            21.88,
            "2026-06-12T08:00:00.000Z",
          ],
        ],
      );
      assert.deepEqual(
        await queryServices.recurringItems.listSubscriptionIncreaseAlerts(
          undefined,
          new Date("2026-06-21T12:00:00.000Z"),
        ),
        alerts,
      );
    } finally {
      await db.close();
    }
  });
});

test("query service detects recurring transaction candidates", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "demo";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });

    function timestamp(value) {
      return Math.floor(Date.parse(value) / 1000);
    }

    try {
      await db.migrate();

      const database = new Database(databasePath);

      try {
        database.pragma("foreign_keys = ON");
        database.exec(`
          INSERT OR IGNORE INTO profiles (name, created_at)
          VALUES ('demo', '2026-01-01T00:00:00.000Z');

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
        `);

        const insertEntry = database.prepare(`
          INSERT INTO ledger_entries (
            profile,
            id,
            account_id,
            time,
            description,
            amount,
            currency_code,
            category_id,
            category_name,
            merchant_name,
            raw_statement_item_id,
            hold,
            created_at,
            updated_at
          ) VALUES (
            @profile,
            @id,
            @accountId,
            @time,
            @description,
            @amount,
            @currencyCode,
            @categoryId,
            @categoryName,
            @merchantName,
            @rawStatementItemId,
            @hold,
            @createdAt,
            @updatedAt
          )
        `);
        const rows = [
          ["weekly-1", "2026-05-01", "Weekly Stream", -15900],
          ["weekly-2", "2026-05-08", "Weekly Stream", -15900],
          ["weekly-3", "2026-05-15", "Weekly Stream", -15900],
          ["monthly-1", "2026-01-10", "Monthly Internet", -42000],
          ["monthly-2", "2026-02-10", "Monthly Internet", -43000],
          ["monthly-3", "2026-03-10", "Monthly Internet", -42000],
          ["monthly-4", "2026-04-10", "Monthly Internet", -42000],
          ["yearly-1", "2024-06-01", "Annual Insurance", -120000],
          ["yearly-2", "2025-06-01", "Annual Insurance", -120000],
          ["irregular-1", "2026-01-05", "Irregular Storage", -9900],
          ["irregular-2", "2026-02-20", "Irregular Storage", -10900],
          ["irregular-3", "2026-05-18", "Irregular Storage", -9900],
          ["salary-1", "2026-01-31", "Monthly Salary", 850000],
          ["salary-2", "2026-02-28", "Monthly Salary", 850000],
          ["salary-3", "2026-03-31", "Monthly Salary", 850000],
        ];

        for (const [id, date, merchantName, amount] of rows) {
          insertEntry.run({
            profile,
            id,
            accountId: "account-uah",
            time: timestamp(`${date}T08:00:00.000Z`),
            description: merchantName,
            amount,
            currencyCode: 980,
            categoryId: "subscriptions",
            categoryName: "Subscriptions",
            merchantName,
            rawStatementItemId: `raw-${id}`,
            hold: 0,
            createdAt: `${date}T08:00:00.000Z`,
            updatedAt: `${date}T08:00:00.000Z`,
          });
        }

        for (const [id, date] of [
          ["transfer-1", "2026-01-01"],
          ["transfer-2", "2026-02-01"],
          ["transfer-3", "2026-03-01"],
        ]) {
          insertEntry.run({
            profile,
            id,
            accountId: "account-uah",
            time: timestamp(`${date}T08:00:00.000Z`),
            description: "Card Transfer",
            amount: -50000,
            currencyCode: 980,
            categoryId: "transfers",
            categoryName: "Transfers",
            merchantName: "Card Transfer",
            rawStatementItemId: `raw-${id}`,
            hold: 0,
            createdAt: `${date}T08:00:00.000Z`,
            updatedAt: `${date}T08:00:00.000Z`,
          });
        }

        for (const [id, date] of [
          ["hold-1", "2026-01-15"],
          ["hold-2", "2026-02-15"],
          ["hold-3", "2026-03-15"],
        ]) {
          insertEntry.run({
            profile,
            id,
            accountId: "account-uah",
            time: timestamp(`${date}T08:00:00.000Z`),
            description: "Held Subscription",
            amount: -25000,
            currencyCode: 980,
            categoryId: "subscriptions",
            categoryName: "Subscriptions",
            merchantName: "Held Subscription",
            rawStatementItemId: `raw-${id}`,
            hold: 1,
            createdAt: `${date}T08:00:00.000Z`,
            updatedAt: `${date}T08:00:00.000Z`,
          });
        }
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
      const writeService = createLedgerWriteService({
        db,
        defaultProfile: profile,
      });
      const candidates = await queryService.detectRecurringTransactions();
      const byMerchant = new Map(
        candidates.map((candidate) => [candidate.merchantName, candidate]),
      );
      const weeklyCandidate = byMerchant.get("Weekly Stream");
      const monthlyCandidate = byMerchant.get("Monthly Internet");

      assert.equal(weeklyCandidate?.frequency, "weekly");
      assert.equal(weeklyCandidate?.occurrences, 3);
      assert.equal(weeklyCandidate?.expectedAmountMin, 15900);
      assert.equal(monthlyCandidate?.frequency, "monthly");
      assert.equal(monthlyCandidate?.occurrences, 4);
      assert.equal(monthlyCandidate?.expectedAmountMax, 43000);
      assert.equal(byMerchant.get("Annual Insurance")?.frequency, "yearly");
      assert.equal(byMerchant.get("Annual Insurance")?.occurrences, 2);
      assert.equal(byMerchant.get("Irregular Storage")?.frequency, "irregular");
      assert.equal(byMerchant.get("Irregular Storage")?.occurrences, 3);
      assert.equal(byMerchant.has("Monthly Salary"), false);
      assert.equal(byMerchant.has("Card Transfer"), false);
      assert.equal(byMerchant.has("Held Subscription"), false);
      assert.deepEqual(
        await queryServices.recurringItems.detectRecurringTransactions(),
        candidates,
      );

      assert.ok(weeklyCandidate);
      assert.ok(monthlyCandidate);

      const confirmed = await writeService.confirmRecurringDetection(
        weeklyCandidate.id,
      );

      assert.equal(confirmed.action, "confirmed");
      assert.equal(confirmed.candidateId, weeklyCandidate.id);
      assert.equal(confirmed.recurringItem?.id, weeklyCandidate.id);
      assert.equal(confirmed.recurringItem?.isActive, true);
      assert.equal(confirmed.recurringItem?.merchantName, "Weekly Stream");
      assert.equal(
        (await queryService.detectRecurringTransactions()).some(
          (candidate) => candidate.id === weeklyCandidate.id,
        ),
        false,
      );

      const ignored = await writeService.ignoreRecurringDetection(
        monthlyCandidate.id,
      );

      assert.equal(ignored.action, "ignored");
      assert.equal(ignored.candidateId, monthlyCandidate.id);

      const afterDecisions = await queryService.detectRecurringTransactions();

      assert.equal(
        afterDecisions.some((candidate) => candidate.id === weeklyCandidate.id),
        false,
      );
      assert.equal(
        afterDecisions.some(
          (candidate) => candidate.id === monthlyCandidate.id,
        ),
        false,
      );
      assert.deepEqual(
        (await db.listRecurringDetectionDecisions(profile))
          .map((decision) => [decision.candidateId, decision.action])
          .sort(),
        [
          [monthlyCandidate.id, "ignored"],
          [weeklyCandidate.id, "confirmed"],
        ].sort(),
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
      assert.equal(typeof services.query.getCashflowReport, "function");
      assert.equal(typeof services.query.getCategoryTrendReport, "function");
      assert.equal(typeof services.query.getMonthlySpendingReport, "function");
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
        typeof services.queries.reports.getMonthlySpendingReport,
        "function",
      );
      assert.equal(
        typeof services.queries.reports.getCashflowReport,
        "function",
      );
      assert.equal(
        typeof services.queries.reports.getCategoryTrendReport,
        "function",
      );
      assert.equal(
        typeof services.queries.recurringItems.listRecurringItems,
        "function",
      );
      assert.equal(
        typeof services.queries.recurringItems.listMissedRecurringPayments,
        "function",
      );
      assert.equal(
        typeof services.queries.recurringItems.listSubscriptionIncreaseAlerts,
        "function",
      );
      assert.equal(typeof services.queries.syncState.listSyncRuns, "function");
      assert.equal(typeof services.write.confirmRecurringDetection, "function");
      assert.equal(typeof services.write.ignoreRecurringDetection, "function");
      assert.equal(
        typeof services.write.updateTransactionSplitPlan,
        "function",
      );
    } finally {
      await db.close();
    }
  });
});
