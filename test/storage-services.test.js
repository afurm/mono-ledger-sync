import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createBundledFixtureMonobankAdapter } from "../dist/monobank/index.js";
import {
  createLedgerQueryService,
  createLedgerQueryServices,
  createLedgerServices,
  createLedgerWriteService,
} from "../dist/storage/index.js";
import { createSqliteLedgerDb } from "../dist/sqlite/index.js";
import { syncLedgerWithMonobank } from "../dist/sync/index.js";

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
      const accounts = await queryService.listAccounts();
      const balances = await queryService.getAccountBalances();
      const page = await queryService.listLedgerEntries({
        limit: 3,
        sortBy: "time",
        sortDirection: "desc",
      });
      const categories = await queryService.listCategories();
      const budgets = await queryService.listBudgets();
      const recurringItems = await queryService.listRecurringItems();
      const runs = await queryService.listSyncRuns();
      const events = await queryService.listWebhookEvents();
      const groupedPage = await queryServices.transactions.listLedgerEntries({
        limit: 2,
        sortBy: "time",
        sortDirection: "desc",
      });
      const groupedBalances = await queryServices.balances.getAccountBalances();
      const groupedCategories = await queryServices.categories.listCategories();
      const groupedBudgets = await queryServices.budgets.listBudgets();
      const groupedRecurringItems =
        await queryServices.recurringItems.listRecurringItems();
      const groupedRuns = await queryServices.syncState.listSyncRuns();

      assert.equal(summary.profile, profile);
      assert.equal(summary.ledgerEntries, 7);
      assert.equal(accounts.length, 2);
      assert.equal(balances.length, 2);
      assert.equal(page.limit, 3);
      assert.equal(page.entries.length, 3);
      assert.equal(page.total, 7);
      const categoryIds = categories.map((category) => category.id);
      assert.equal(categoryIds.length > 0, true);
      assert.ok(categoryIds.includes("income"));
      assert.ok(categoryIds.includes("uncategorized"));
      assert.deepEqual(budgets, []);
      assert.deepEqual(recurringItems, []);
      assert.equal(runs.length, 1);
      assert.equal(runs[0].profile, profile);
      assert.ok(Array.isArray(events));
      assert.equal(groupedPage.entries.length, 2);
      assert.equal(groupedBalances.length, balances.length);
      assert.deepEqual(
        groupedCategories.map((category) => category.id),
        categoryIds,
      );
      assert.deepEqual(groupedBudgets, []);
      assert.deepEqual(groupedRecurringItems, []);
      assert.equal(groupedRuns.length, runs.length);
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
      assert.equal(
        typeof services.queries.transactions.listLedgerEntries,
        "function",
      );
      assert.equal(typeof services.queries.balances.listAccounts, "function");
      assert.equal(
        typeof services.queries.categories.listCategories,
        "function",
      );
      assert.equal(typeof services.queries.budgets.listBudgets, "function");
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
