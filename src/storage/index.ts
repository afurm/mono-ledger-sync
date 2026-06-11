import type {
  AccountBalance,
  BudgetProgress,
  Budget,
  BudgetPeriod,
  ConvertedReportTotals,
  CashflowReport,
  CashflowReportCurrencyTotal,
  CashflowReportPoint,
  SavingsRateReport,
  SavingsRateReportCurrencyTotal,
  SavingsRateReportPoint,
  BalanceProjectionReport,
  BalanceProjectionCurrencyTotal,
  BalanceProjectionEvent,
  BalanceProjectionPoint,
  CategoryTrendReport,
  CategoryTrendReportCategory,
  CategoryTrendReportPoint,
  MerchantTrendReport,
  MerchantTrendReportMerchant,
  MerchantTrendReportPoint,
  LedgerAccount,
  LedgerEntry,
  LedgerEntryAnnotationUpdate,
  LedgerEntryBulkEditUpdate,
  LedgerEntryCategoryRestoreEntry,
  LedgerEntryPage,
  Category,
  CategoryRule,
  LedgerEntryQuery,
  LedgerEntrySplitPlanUpdate,
  LedgerSummary,
  LedgerWriteStats,
  LedgerCategorySpending,
  LedgerJar,
  ReportCurrencyConversionRate,
  SavingsGoalProgress,
  LocalAppSettings,
  LocalAppSettingsUpdate,
  Merchant,
  MerchantCleanupRule,
  MissedRecurringPayment,
  MonthlySpendingCategory,
  MonthlySpendingCurrencyTotal,
  MonthlySpendingMerchant,
  MonthlySpendingReport,
  NetWorthTrend,
  NetWorthTrendPoint,
  RecurringCalendarEvent,
  RecurringDetectionCandidate,
  RecurringDetectionDecision,
  RecurringDetectionDecisionAction,
  RecurringDetectionDecisionResult,
  RecurringItem,
  SubscriptionIncreaseAlert,
  SyncCursor,
  SyncRun,
  SyncRunStatus,
  StoredWebhookEvent,
  Tag,
  UpcomingRecurringPayment,
  WebhookEventStatus,
  ledgerEntrySortDirections,
  ledgerEntrySortFields,
} from "../domain/index.js";

export type {
  AccountBalance,
  BudgetProgress,
  ConvertedReportTotals,
  LedgerAccount,
  LedgerCategorySpending,
  LedgerJar,
  SavingsGoalProgress,
  LedgerEntry,
  LedgerEntryCategorySource,
  LedgerEntryAnnotationUpdate,
  LedgerEntryBulkEditUpdate,
  LedgerEntryCategoryRestoreEntry,
  LedgerEntrySplitPlanUpdate,
  LedgerEntryPage,
  CashflowReport,
  CashflowReportCurrencyTotal,
  CashflowReportPoint,
  ReportCurrencyConversionRate,
  SavingsRateReport,
  SavingsRateReportCurrencyTotal,
  SavingsRateReportPoint,
  BalanceProjectionReport,
  BalanceProjectionCurrencyTotal,
  BalanceProjectionEvent,
  BalanceProjectionPoint,
  CategoryTrendReport,
  CategoryTrendReportCategory,
  CategoryTrendReportPoint,
  MerchantTrendReport,
  MerchantTrendReportMerchant,
  MerchantTrendReportPoint,
  Category,
  CategoryRule,
  Budget,
  BudgetPeriod,
  LedgerEntryQuery,
  LedgerSummary,
  LocalAppSettings,
  LocalAppSettingsUpdate,
  Merchant,
  MerchantCleanupRule,
  MissedRecurringPayment,
  MonthlySpendingCategory,
  MonthlySpendingCurrencyTotal,
  MonthlySpendingMerchant,
  MonthlySpendingReport,
  NetWorthTrend,
  NetWorthTrendPoint,
  RecurringCalendarEvent,
  RecurringDetectionCandidate,
  RecurringDetectionDecision,
  RecurringDetectionDecisionAction,
  RecurringDetectionDecisionResult,
  RecurringItem,
  SubscriptionIncreaseAlert,
  SyncCursor,
  SyncRun,
  SyncRunStatus,
  StoredWebhookEvent,
  Tag,
  UpcomingRecurringPayment,
  LedgerWriteStats,
  WebhookEventStatus,
} from "../domain/index.js";

import type {
  MonobankAccount,
  MonobankCurrencyRate,
  MonobankJar,
  MonobankStatementItem,
} from "../monobank/index.js";

export type {
  MonobankAccount,
  MonobankCurrencyRate,
  MonobankJar,
  MonobankStatementItem,
};

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
  type LedgerReportQueryService,
  type LedgerRecurringItemQueryService,
  type LedgerServices,
  type LedgerSyncStateQueryService,
  type LedgerTransactionQueryService,
  type LedgerWriteService,
  type MonthlyCategoryBudgetInput,
} from "./services.js";

export interface LedgerDbTransaction {
  upsertLedgerEntries(entries: readonly LedgerEntry[]): Promise<void>;
  setSyncCursor(cursor: SyncCursor): Promise<void>;
  updateLedgerEntryAnnotation(
    profile: string,
    id: string,
    update: LedgerEntryAnnotationUpdate,
  ): Promise<LedgerEntry | undefined>;
  updateLedgerEntriesBulkEdit(
    profile: string,
    ids: readonly string[],
    update: LedgerEntryBulkEditUpdate,
  ): Promise<readonly LedgerEntry[]>;
  restoreLedgerEntryCategories(
    profile: string,
    entries: readonly LedgerEntryCategoryRestoreEntry[],
  ): Promise<readonly LedgerEntry[]>;
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
  listCurrencyRates(profile?: string): Promise<readonly MonobankCurrencyRate[]>;
  updateLocalAppSettings(
    profile: string,
    update: LocalAppSettingsUpdate,
  ): Promise<LocalAppSettings>;
  recordSyncRun(run: SyncRun): Promise<void>;
  listCategories(profile?: string): Promise<readonly Category[]>;
  listCategorySpending(
    profile?: string,
  ): Promise<readonly LedgerCategorySpending[]>;
  listJars(profile?: string): Promise<readonly LedgerJar[]>;
  listCategoryRules(profile?: string): Promise<readonly CategoryRule[]>;
  listMerchants(profile?: string): Promise<readonly Merchant[]>;
  listMerchantCleanupRules(
    profile?: string,
  ): Promise<readonly MerchantCleanupRule[]>;
  listBudgets(profile?: string): Promise<readonly Budget[]>;
  listBudgetPeriods(profile?: string): Promise<readonly BudgetPeriod[]>;
  updateMonthlyBudgetPeriodStatus(
    profile: string,
    budgetPeriodId: string,
    status: BudgetPeriod["status"],
    actualAmount?: number,
  ): Promise<BudgetPeriod | undefined>;
  listRecurringItems(profile?: string): Promise<readonly RecurringItem[]>;
  listTags(profile?: string): Promise<readonly Tag[]>;
  listWebhookEvents(
    profile?: string,
    limit?: number,
  ): Promise<readonly StoredWebhookEvent[]>;
}
