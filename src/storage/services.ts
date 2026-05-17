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
  Category,
  LedgerSummary,
  RecurringItem,
  StoredWebhookEvent,
  SyncRun,
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
}

export interface LedgerCategoryQueryService {
  listCategories(profile?: string): Promise<readonly Category[]>;
}

export interface LedgerBudgetQueryService {
  listBudgets(profile?: string): Promise<readonly Budget[]>;
  listBudgetPeriods(profile?: string): Promise<readonly BudgetPeriod[]>;
}

export interface LedgerRecurringItemQueryService {
  listRecurringItems(profile?: string): Promise<readonly RecurringItem[]>;
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

function coerceProfile(profile: string | undefined, fallback: string): string {
  return profile === undefined || profile.trim() === "" ? fallback : profile;
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
    listCategories(profile) {
      return db.listCategories(coerceProfile(profile, defaultProfile));
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
    },
    categories: {
      listCategories: query.listCategories,
    },
    budgets: {
      listBudgets: query.listBudgets,
      listBudgetPeriods: query.listBudgetPeriods,
    },
    recurringItems: {
      listRecurringItems: query.listRecurringItems,
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
