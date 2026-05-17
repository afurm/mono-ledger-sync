import type {
  AccountBalance,
  Budget,
  LedgerAccount,
  LedgerEntry,
  LedgerEntryAnnotationUpdate,
  LedgerEntryPage,
  Category,
  CategoryRule,
  LedgerEntryQuery,
  LedgerEntrySplitPlanUpdate,
  LedgerSummary,
  LedgerWriteStats,
  LocalAppSettings,
  LocalAppSettingsUpdate,
  Merchant,
  RecurringItem,
  SyncCursor,
  SyncRun,
  SyncRunStatus,
  StoredWebhookEvent,
  WebhookEventStatus,
  ledgerEntrySortDirections,
  ledgerEntrySortFields,
} from "../domain/index.js";

export type {
  AccountBalance,
  LedgerAccount,
  LedgerEntry,
  LedgerEntryAnnotationUpdate,
  LedgerEntrySplitPlanUpdate,
  LedgerEntryPage,
  Category,
  CategoryRule,
  Budget,
  LedgerEntryQuery,
  LedgerSummary,
  LocalAppSettings,
  LocalAppSettingsUpdate,
  Merchant,
  RecurringItem,
  SyncCursor,
  SyncRun,
  SyncRunStatus,
  StoredWebhookEvent,
  LedgerWriteStats,
  WebhookEventStatus,
} from "../domain/index.js";

import type {
  MonobankAccount,
  MonobankJar,
  MonobankStatementItem,
} from "../monobank/index.js";

export type LedgerEntrySortField = (typeof ledgerEntrySortFields)[number];
export type LedgerEntrySortDirection =
  (typeof ledgerEntrySortDirections)[number];

export {
  ledgerEntrySortFields,
  ledgerEntrySortDirections,
  syncRunStatuses,
} from "../domain/index.js";
export {
  createLedgerQueryService,
  createLedgerQueryServices,
  createLedgerServices,
  createLedgerWriteService,
  type LedgerBalanceQueryService,
  type LedgerBudgetQueryService,
  type LedgerCategoryQueryService,
  type LedgerQueryServices,
  type LedgerQueryService,
  type LedgerRecurringItemQueryService,
  type LedgerServices,
  type LedgerSyncStateQueryService,
  type LedgerTransactionQueryService,
  type LedgerWriteService,
} from "./services.js";

export interface LedgerDbTransaction {
  upsertLedgerEntries(entries: readonly LedgerEntry[]): Promise<void>;
  setSyncCursor(cursor: SyncCursor): Promise<void>;
  updateLedgerEntryAnnotation(
    profile: string,
    id: string,
    update: LedgerEntryAnnotationUpdate,
  ): Promise<LedgerEntry | undefined>;
  updateLedgerEntrySplitPlan(
    profile: string,
    id: string,
    update: LedgerEntrySplitPlanUpdate,
  ): Promise<LedgerEntry | undefined>;
}

export interface LedgerDb {
  migrate(): Promise<void>;
  transaction<T>(callback: (tx: LedgerDbTransaction) => Promise<T>): Promise<T>;
  getAccountBalances(profile: string): Promise<readonly AccountBalance[]>;
  getSyncCursor(
    profile: string,
    accountId: string,
  ): Promise<SyncCursor | undefined>;
  getLocalAppSettings(profile: string): Promise<LocalAppSettings | undefined>;
  updateLocalAppSettings(
    profile: string,
    update: LocalAppSettingsUpdate,
  ): Promise<LocalAppSettings>;
  recordSyncRun(run: SyncRun): Promise<void>;
  listCategories(profile?: string): Promise<readonly Category[]>;
  listCategoryRules(profile?: string): Promise<readonly CategoryRule[]>;
  listMerchants(profile?: string): Promise<readonly Merchant[]>;
  listBudgets(profile?: string): Promise<readonly Budget[]>;
  listWebhookEvents(
    profile?: string,
    limit?: number,
  ): Promise<readonly StoredWebhookEvent[]>;
}
