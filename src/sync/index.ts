import crypto from "node:crypto";

import type {
  MonobankAdapter,
  MonobankStatementItem,
} from "../monobank/index.js";
import type { SqliteLedgerDb } from "../sqlite/index.js";
import type {
  LedgerEntry,
  LedgerSummary,
  LedgerWriteStats,
  SyncRun,
} from "../storage/index.js";

export interface LedgerCategoryMatch {
  categoryId: string;
  categoryName: string;
}

export interface SyncLedgerOptions {
  profile: string;
  source: "fixture" | "monobank";
  adapter: MonobankAdapter;
  db: SqliteLedgerDb;
  dryRun?: boolean;
  from?: number;
  to?: number;
  accountIds?: readonly string[];
  sliceSeconds?: number;
  signal?: AbortSignal;
}

export interface SyncLedgerAccountResult {
  accountId: string;
  from: number;
  to: number;
  windowsFetched: number;
  itemsSeen: number;
  writeStats: LedgerWriteStats;
}

export interface SyncLedgerResult {
  run: SyncRun;
  accounts: readonly SyncLedgerAccountResult[];
  dryRun: boolean;
  stats: SyncLedgerStats;
  summary: LedgerSummary;
}

export interface SyncLedgerStats {
  apiCalls: number;
  windowsFetched: number;
  itemsSeen: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsSkipped: number;
  rateLimited: number;
}

const fixtureSyncTo = 4_102_444_800;
const liveSyncWindowSeconds = 31 * 24 * 60 * 60;

export const monobankPersonalStatementWindowMaxSeconds =
  31 * 24 * 60 * 60 + 60 * 60;

export interface StatementSyncWindow {
  from: number;
  to: number;
}

function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyWriteStats(): LedgerWriteStats {
  return {
    inserted: 0,
    updated: 0,
    skipped: 0,
  };
}

function addWriteStats(
  left: LedgerWriteStats,
  right: LedgerWriteStats,
): LedgerWriteStats {
  return {
    inserted: left.inserted + right.inserted,
    updated: left.updated + right.updated,
    skipped: left.skipped + right.skipped,
  };
}

function emptySyncStats(): SyncLedgerStats {
  return {
    apiCalls: 0,
    windowsFetched: 0,
    itemsSeen: 0,
    itemsInserted: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    rateLimited: 0,
  };
}

function statsFromWriteStats(
  stats: SyncLedgerStats,
  writeStats: LedgerWriteStats,
): SyncLedgerStats {
  return {
    ...stats,
    itemsInserted: stats.itemsInserted + writeStats.inserted,
    itemsUpdated: stats.itemsUpdated + writeStats.updated,
    itemsSkipped: stats.itemsSkipped + writeStats.skipped,
  };
}

export function categorizeStatementItem(
  item: MonobankStatementItem,
): LedgerCategoryMatch {
  const description = item.description.toLowerCase();

  if (item.amount > 0) {
    return {
      categoryId: "income",
      categoryName: "Income",
    };
  }

  if (item.mcc === 5411 || description.includes("grocery")) {
    return {
      categoryId: "groceries",
      categoryName: "Groceries",
    };
  }

  if (item.mcc === 5734 || description.includes("subscription")) {
    return {
      categoryId: "subscriptions",
      categoryName: "Subscriptions",
    };
  }

  if (item.mcc === 4111 || description.includes("metro")) {
    return {
      categoryId: "transport",
      categoryName: "Transport",
    };
  }

  if (item.mcc === 4722 || description.includes("travel")) {
    return {
      categoryId: "travel",
      categoryName: "Travel",
    };
  }

  if (item.mcc === 5814 || description.includes("coffee")) {
    return {
      categoryId: "dining",
      categoryName: "Dining",
    };
  }

  if (item.mcc === 4829 || description.includes("transfer")) {
    return {
      categoryId: "transfers",
      categoryName: "Transfers",
    };
  }

  return {
    categoryId: "uncategorized",
    categoryName: "Uncategorized",
  };
}

export function createLedgerEntryFromStatementItem(
  accountId: string,
  item: MonobankStatementItem,
): LedgerEntry {
  const category = categorizeStatementItem(item);

  return {
    id: `${accountId}:${item.id}`,
    accountId,
    time: item.time,
    description: item.description,
    amount: item.amount,
    operationAmount: item.operationAmount,
    currencyCode: item.currencyCode,
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    merchantName: item.counterName ?? item.description,
    hold: item.hold,
    balance: item.balance,
    rawStatementItemId: item.id,
  };
}

function defaultSyncWindow(
  source: "fixture" | "monobank",
  cursorTo: number | undefined,
): StatementSyncWindow {
  if (source === "fixture") {
    return {
      from: cursorTo === undefined ? 0 : Math.min(cursorTo + 1, fixtureSyncTo),
      to: fixtureSyncTo,
    };
  }

  const to = nowUnixSeconds();

  return {
    from:
      cursorTo === undefined
        ? to - liveSyncWindowSeconds
        : Math.min(cursorTo + 1, to),
    to,
  };
}

export function createStatementSyncWindows(
  from: number,
  to: number,
  sliceSeconds = monobankPersonalStatementWindowMaxSeconds,
): readonly StatementSyncWindow[] {
  if (!Number.isInteger(from) || from < 0) {
    throw new Error("statement window from must be a non-negative integer");
  }

  if (!Number.isInteger(to) || to < 0) {
    throw new Error("statement window to must be a non-negative integer");
  }

  if (to < from) {
    return [];
  }

  const normalizedSliceSeconds = Math.max(
    1,
    Math.min(
      Math.trunc(sliceSeconds),
      monobankPersonalStatementWindowMaxSeconds,
    ),
  );
  const windows: StatementSyncWindow[] = [];
  let cursor = from;

  while (cursor <= to) {
    const windowTo = Math.min(cursor + normalizedSliceSeconds, to);

    windows.push({
      from: cursor,
      to: windowTo,
    });
    cursor = windowTo + 1;
  }

  return windows;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal || !signal.aborted) {
    return;
  }

  throw new DOMException("Sync was interrupted", "AbortError");
}

function shouldFetchAccount(
  accountId: string,
  accountIds: readonly string[] | undefined,
): boolean {
  return !accountIds?.length || accountIds.includes(accountId);
}

export async function syncLedgerWithMonobank(
  options: SyncLedgerOptions,
): Promise<SyncLedgerResult> {
  throwIfAborted(options.signal);

  await options.db.migrate();

  const startedAt = nowIso();
  const run: SyncRun = {
    id: crypto.randomUUID(),
    profile: options.profile,
    source: options.source,
    status: "running",
    startedAt,
    itemsSeen: 0,
    itemsInserted: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
  };

  if (!options.dryRun) {
    await options.db.recordSyncRun(run);
  }

  let stats = emptySyncStats();

  try {
    const clientInfo = await options.adapter.getClientInfo();
    throwIfAborted(options.signal);

    stats = {
      ...stats,
      apiCalls: stats.apiCalls + 1,
    };

    const currencyRates = await options.adapter.getCurrency();

    stats = {
      ...stats,
      apiCalls: stats.apiCalls + 1,
    };

    let aggregateStats = emptyWriteStats();

    if (!options.dryRun) {
      await options.db.upsertAccounts(clientInfo.accounts);
      await options.db.upsertJars(clientInfo.jars ?? []);
      await options.db.upsertCurrencyRates(currencyRates);
    }

    const accountResults: SyncLedgerAccountResult[] = [];

    for (const account of clientInfo.accounts.filter((item) =>
      shouldFetchAccount(item.id, options.accountIds),
    )) {
      const cursor = await options.db.getSyncCursor(
        options.profile,
        account.id,
      );
      const defaultWindow = defaultSyncWindow(
        options.source,
        cursor?.statementTo,
      );
      const from = options.from ?? defaultWindow.from;
      const to = options.to ?? defaultWindow.to;
      const windows =
        options.source === "monobank" || options.sliceSeconds !== undefined
          ? createStatementSyncWindows(from, to, options.sliceSeconds)
          : [{ from, to }];
      let accountStats = emptyWriteStats();
      let accountItemsSeen = 0;
      let accountCompletedWindow: { from: number; to: number } | undefined;

      for (const window of windows) {
        throwIfAborted(options.signal);

        const statementItems = await options.adapter.getStatement({
          accountId: account.id,
          from: window.from,
          to: window.to,
        });
        stats = {
          ...stats,
          apiCalls: stats.apiCalls + 1,
          windowsFetched: stats.windowsFetched + 1,
          itemsSeen: stats.itemsSeen + statementItems.length,
        };
        const entries = statementItems.map((item) => {
          return createLedgerEntryFromStatementItem(account.id, item);
        });

        let writeStats = emptyWriteStats();

        if (!options.dryRun) {
          writeStats = await options.db.upsertStatementItems(
            account.id,
            statementItems,
            entries,
          );

          accountCompletedWindow = {
            from: window.from,
            to: window.to,
          };
        }

        accountItemsSeen += statementItems.length;
        accountStats = addWriteStats(accountStats, writeStats);
        stats = statsFromWriteStats(stats, writeStats);
      }

      aggregateStats = addWriteStats(aggregateStats, accountStats);
      if (
        !options.dryRun &&
        accountCompletedWindow !== undefined &&
        windows.length > 0
      ) {
        await options.db.transaction(async (tx) => {
          await tx.setSyncCursor({
            profile: options.profile,
            accountId: account.id,
            source: options.source,
            statementFrom: accountCompletedWindow.from,
            statementTo: accountCompletedWindow.to,
            updatedAt: nowIso(),
          });
        });
      }

      accountResults.push({
        accountId: account.id,
        from,
        to,
        windowsFetched: windows.length,
        itemsSeen: accountItemsSeen,
        writeStats: accountStats,
      });
    }

    const itemsSeen = accountResults.reduce((total, account) => {
      return total + account.itemsSeen;
    }, 0);
    const finishedRun: SyncRun = {
      ...run,
      status: "success",
      finishedAt: nowIso(),
      itemsSeen,
      itemsInserted: aggregateStats.inserted,
      itemsUpdated: aggregateStats.updated,
      itemsSkipped: aggregateStats.skipped,
    };

    if (!options.dryRun) {
      await options.db.recordSyncRun(finishedRun);
    }

    return {
      run: finishedRun,
      accounts: accountResults,
      dryRun: options.dryRun ?? false,
      stats,
      summary: await options.db.getLedgerSummary(options.profile),
    };
  } catch (error) {
    const failedRun: SyncRun = {
      ...run,
      status: options.signal?.aborted ? "partial" : "failed",
      finishedAt: nowIso(),
      itemsSeen: stats.itemsSeen,
      itemsInserted: stats.itemsInserted,
      itemsUpdated: stats.itemsUpdated,
      itemsSkipped: stats.itemsSkipped,
    };

    if (!options.dryRun) {
      await options.db.recordSyncRun(failedRun);
    }
    throw error;
  }
}
