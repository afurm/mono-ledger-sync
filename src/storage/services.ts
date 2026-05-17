import type {
  AccountBalance,
  Budget,
  BudgetPeriod,
  LedgerAccount,
  LedgerEntry,
  LedgerEntryAnnotationUpdate,
  LedgerEntryPage,
  LedgerEntryQuery,
  LedgerEntrySplitPlanUpdate,
  LedgerCategorySpending,
  LedgerJar,
  Category,
  LedgerSummary,
  RecurringItem,
  StoredWebhookEvent,
  SyncRun,
  UpcomingRecurringPayment,
} from "./index.js";

import type { LedgerDbTransaction } from "./index.js";
import type { SqliteLedgerDb } from "../sqlite/index.js";

export interface LedgerTransactionQueryService {
  listLedgerEntries(
    query: Omit<LedgerEntryQuery, "profile"> & { profile?: string },
  ): Promise<LedgerEntryPage>;
}

export interface LedgerBalanceQueryService {
  getLedgerSummary(profile?: string): Promise<LedgerSummary>;
  getAccountBalances(profile?: string): Promise<readonly AccountBalance[]>;
  listAccounts(profile?: string): Promise<readonly LedgerAccount[]>;
  listJars(profile?: string): Promise<readonly LedgerJar[]>;
}

export interface LedgerCategoryQueryService {
  listCategories(profile?: string): Promise<readonly Category[]>;
  listCategorySpending(
    profile?: string,
  ): Promise<readonly LedgerCategorySpending[]>;
}

export interface LedgerBudgetQueryService {
  listBudgets(profile?: string): Promise<readonly Budget[]>;
  listBudgetPeriods(profile?: string): Promise<readonly BudgetPeriod[]>;
}

export interface LedgerRecurringItemQueryService {
  listRecurringItems(profile?: string): Promise<readonly RecurringItem[]>;
  listUpcomingRecurringPayments(
    profile?: string,
    asOf?: Date,
  ): Promise<readonly UpcomingRecurringPayment[]>;
}

export interface LedgerSyncStateQueryService {
  listSyncRuns(profile?: string, limit?: number): Promise<readonly SyncRun[]>;
  listWebhookEvents(
    profile?: string,
    limit?: number,
  ): Promise<readonly StoredWebhookEvent[]>;
}

export interface LedgerQueryServices {
  transactions: LedgerTransactionQueryService;
  balances: LedgerBalanceQueryService;
  categories: LedgerCategoryQueryService;
  budgets: LedgerBudgetQueryService;
  recurringItems: LedgerRecurringItemQueryService;
  syncState: LedgerSyncStateQueryService;
}

export interface LedgerQueryService
  extends
    LedgerTransactionQueryService,
    LedgerBalanceQueryService,
    LedgerCategoryQueryService,
    LedgerBudgetQueryService,
    LedgerRecurringItemQueryService,
    LedgerSyncStateQueryService {}

export interface LedgerWriteService {
  updateTransactionNote(
    id: string,
    note: string | undefined,
    profile?: string,
  ): Promise<LedgerEntry | undefined>;
  updateTransactionTags(
    id: string,
    tags: readonly string[] | undefined,
    profile?: string,
  ): Promise<LedgerEntry | undefined>;
  updateTransactionAnnotation(
    id: string,
    update: LedgerEntryAnnotationUpdate,
    profile?: string,
  ): Promise<LedgerEntry | undefined>;
  updateTransactionSplitPlan(
    id: string,
    update: LedgerEntrySplitPlanUpdate,
    profile?: string,
  ): Promise<LedgerEntry | undefined>;
}

export interface LedgerServices {
  query: LedgerQueryService;
  queries: LedgerQueryServices;
  write: LedgerWriteService;
}

interface CreateLedgerServicesOptions {
  db: SqliteLedgerDb;
  defaultProfile: string;
}

const DEFAULT_SYNC_LIST_LIMIT = 20;
const UPCOMING_RECURRING_PAYMENT_LIMIT = 8;

function coerceProfile(profile: string | undefined, fallback: string): string {
  return profile === undefined || profile.trim() === "" ? fallback : profile;
}

function startOfUtcDate(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addUtcMonths(value: Date, months: number): Date {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + months;
  const day = Math.min(
    value.getUTCDate(),
    daysInUtcMonth(year + Math.floor(month / 12), ((month % 12) + 12) % 12),
  );

  return new Date(Date.UTC(year, month, day));
}

function addRecurringFrequency(
  value: Date,
  frequency: RecurringItem["frequency"],
): Date {
  const next = new Date(value);

  switch (frequency) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    case "monthly":
      return addUtcMonths(next, 1);
    case "quarterly":
      return addUtcMonths(next, 3);
    case "yearly":
      return addUtcMonths(next, 12);
    case "irregular":
      return next;
  }
}

function resolveNextRecurringDate(
  item: RecurringItem,
  asOf: Date,
): Date | undefined {
  const anchor = item.lastSeenAt ?? item.startedAt ?? item.createdAt;
  const parsedAnchor = Date.parse(anchor);

  if (!Number.isFinite(parsedAnchor)) {
    return undefined;
  }

  let nextDueAt = startOfUtcDate(new Date(parsedAnchor));
  const asOfDate = startOfUtcDate(asOf);

  if (item.frequency === "irregular") {
    return nextDueAt;
  }

  while (nextDueAt < asOfDate) {
    const next = addRecurringFrequency(nextDueAt, item.frequency);

    if (next.getTime() === nextDueAt.getTime()) {
      return undefined;
    }

    nextDueAt = next;
  }

  return nextDueAt;
}

function daysBetweenUtcDates(left: Date, right: Date): number {
  const millisecondsPerDay = 86_400_000;

  return Math.round(
    (startOfUtcDate(left).getTime() - startOfUtcDate(right).getTime()) /
      millisecondsPerDay,
  );
}

async function listUpcomingRecurringPayments(
  db: SqliteLedgerDb,
  profile: string,
  asOf = new Date(),
): Promise<readonly UpcomingRecurringPayment[]> {
  const [items, accounts] = await Promise.all([
    db.listRecurringItems(profile),
    db.listAccounts(profile),
  ]);
  const accountCurrencyCodes = new Map(
    accounts.map((account) => [account.id, account.currencyCode]),
  );
  const asOfDate = startOfUtcDate(asOf);

  return items
    .filter((item) => item.isActive)
    .flatMap((item): UpcomingRecurringPayment[] => {
      const nextDueAt = resolveNextRecurringDate(item, asOfDate);
      const currencyCode = accountCurrencyCodes.get(item.accountId);

      if (!nextDueAt || currencyCode === undefined) {
        return [];
      }

      const daysUntilDue = daysBetweenUtcDates(nextDueAt, asOfDate);

      return [
        {
          id: `${item.id}:${nextDueAt.toISOString().slice(0, 10)}`,
          recurringItemId: item.id,
          profile: item.profile,
          accountId: item.accountId,
          ...(item.categoryId === undefined
            ? {}
            : { categoryId: item.categoryId }),
          ...(item.merchantName === undefined
            ? {}
            : { merchantName: item.merchantName }),
          frequency: item.frequency,
          ...(item.expectedAmountMin === undefined
            ? {}
            : { expectedAmountMin: item.expectedAmountMin }),
          ...(item.expectedAmountMax === undefined
            ? {}
            : { expectedAmountMax: item.expectedAmountMax }),
          currencyCode,
          ...(item.lastSeenAt === undefined
            ? {}
            : { lastSeenAt: item.lastSeenAt }),
          nextDueAt: nextDueAt.toISOString(),
          daysUntilDue,
          isOverdue: daysUntilDue < 0,
        },
      ];
    })
    .sort((left, right) => {
      const dueDiff = Date.parse(left.nextDueAt) - Date.parse(right.nextDueAt);

      if (dueDiff !== 0) {
        return dueDiff;
      }

      return (left.merchantName ?? left.recurringItemId).localeCompare(
        right.merchantName ?? right.recurringItemId,
      );
    })
    .slice(0, UPCOMING_RECURRING_PAYMENT_LIMIT);
}

export function createLedgerQueryService({
  db,
  defaultProfile,
}: CreateLedgerServicesOptions): LedgerQueryService {
  return {
    getLedgerSummary(profile) {
      return db.getLedgerSummary(coerceProfile(profile, defaultProfile));
    },
    getAccountBalances(profile) {
      return db.getAccountBalances(coerceProfile(profile, defaultProfile));
    },
    listAccounts(profile) {
      return db.listAccounts(coerceProfile(profile, defaultProfile));
    },
    listJars(profile) {
      return db.listJars(coerceProfile(profile, defaultProfile));
    },
    listCategories(profile) {
      return db.listCategories(coerceProfile(profile, defaultProfile));
    },
    listCategorySpending(profile) {
      return db.listCategorySpending(coerceProfile(profile, defaultProfile));
    },
    listBudgets(profile) {
      return db.listBudgets(coerceProfile(profile, defaultProfile));
    },
    listBudgetPeriods(profile) {
      return db.listBudgetPeriods(coerceProfile(profile, defaultProfile));
    },
    listRecurringItems(profile) {
      return db.listRecurringItems(coerceProfile(profile, defaultProfile));
    },
    listUpcomingRecurringPayments(profile, asOf) {
      return listUpcomingRecurringPayments(
        db,
        coerceProfile(profile, defaultProfile),
        asOf,
      );
    },
    listLedgerEntries({ profile, ...query }) {
      return db.listLedgerEntries({
        ...query,
        profile: coerceProfile(profile, defaultProfile),
      });
    },
    listSyncRuns(profile, limit) {
      return db.listSyncRuns(coerceProfile(profile, defaultProfile), limit);
    },
    listWebhookEvents(profile, limit = DEFAULT_SYNC_LIST_LIMIT) {
      return db.listWebhookEvents(
        coerceProfile(profile, defaultProfile),
        limit,
      );
    },
  };
}

export function createLedgerQueryServices(
  options: CreateLedgerServicesOptions,
): LedgerQueryServices {
  const query = createLedgerQueryService(options);

  return {
    transactions: {
      listLedgerEntries: query.listLedgerEntries,
    },
    balances: {
      getLedgerSummary: query.getLedgerSummary,
      getAccountBalances: query.getAccountBalances,
      listAccounts: query.listAccounts,
      listJars: query.listJars,
    },
    categories: {
      listCategories: query.listCategories,
      listCategorySpending: query.listCategorySpending,
    },
    budgets: {
      listBudgets: query.listBudgets,
      listBudgetPeriods: query.listBudgetPeriods,
    },
    recurringItems: {
      listRecurringItems: query.listRecurringItems,
      listUpcomingRecurringPayments: query.listUpcomingRecurringPayments,
    },
    syncState: {
      listSyncRuns: query.listSyncRuns,
      listWebhookEvents: query.listWebhookEvents,
    },
  };
}

export function createLedgerWriteService({
  db,
  defaultProfile,
}: CreateLedgerServicesOptions): LedgerWriteService {
  async function withProfileTransaction<T>(
    profile: string | undefined,
    callback: (tx: LedgerDbTransaction, profile: string) => Promise<T>,
  ): Promise<T> {
    const resolvedProfile = coerceProfile(profile, defaultProfile);

    return db.transaction((tx) => callback(tx, resolvedProfile));
  }

  function updateTransactionAnnotation(
    id: string,
    update: LedgerEntryAnnotationUpdate,
    profile?: string,
  ): Promise<LedgerEntry | undefined> {
    return withProfileTransaction(profile, (tx, resolvedProfile) =>
      tx.updateLedgerEntryAnnotation(resolvedProfile, id, update),
    );
  }

  return {
    updateTransactionNote(id, note, profile) {
      return updateTransactionAnnotation(
        id,
        note === undefined ? {} : { note },
        profile,
      );
    },
    updateTransactionTags(id, tags, profile) {
      return updateTransactionAnnotation(
        id,
        tags === undefined ? {} : { tags },
        profile,
      );
    },
    updateTransactionAnnotation,
    updateTransactionSplitPlan(id, update, profile) {
      return withProfileTransaction(profile, (tx, resolvedProfile) =>
        tx.updateLedgerEntrySplitPlan(resolvedProfile, id, update),
      );
    },
  };
}

export function createLedgerServices(
  options: CreateLedgerServicesOptions,
): LedgerServices {
  return {
    query: createLedgerQueryService(options),
    queries: createLedgerQueryServices(options),
    write: createLedgerWriteService(options),
  };
}
