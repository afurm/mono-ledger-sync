import type {
  LocalActivityEvent as DomainLocalActivityEvent,
  LocalActivityEventSeverity as DomainLocalActivityEventSeverity,
  LocalActivityEventType as DomainLocalActivityEventType,
  WebhookEventStatus as DomainWebhookEventStatus,
} from "../domain/index.js";

export interface LocalApiHealth {
  status: "ok";
  localOnly: boolean;
  version: string;
  framework: string;
  apiPrefix: string;
  architecture: {
    ui: string;
    server: string;
    storage: string;
  };
}

export interface LocalApiWebhookSettings {
  enabled: boolean;
  path: string;
  host: string;
  port: number;
  url: string;
}

export interface LocalApiAccessBinding {
  localOnly: boolean;
  host: string;
  authentication: "none" | "passcode";
}

export interface LocalApiMonobankClientInfoSummary {
  clientId: string;
  name: string;
  accounts: number;
  jars: number;
  masked: true;
}

export interface LocalApiMonobankTokenStatus {
  profile: string;
  hasToken: boolean;
  storage: "secure" | "session";
  persistence: "persistent" | "session";
  fallbackReason?: "secure_storage_unavailable" | "secure_storage_write_failed";
  clientInfo?: LocalApiMonobankClientInfoSummary;
}

export type RecheckMonobankConnectionResult =
  | LocalApiMonobankTokenStatus
  | {
      error: string;
      message?: string;
      upstreamStatus?: number;
    };

export type LocalAppSyncSchedule = "manual" | "hourly" | "daily" | "app_start";

export interface LocalAppSettings {
  profile: string;
  source?: "fixture" | "monobank";
  syncSchedule?: LocalAppSyncSchedule;
  excludedAccountIds?: readonly string[];
  exportDirectory?: string;
  budgetWarningThreshold?: number;
  rawStatementRetentionDays?: number;
  lastBackupAt?: string;
  lastCompactAt?: string;
  updatedAt: string;
}

export type LocalAppSettingsUpdate = Partial<
  Pick<
    LocalAppSettings,
    | "syncSchedule"
    | "excludedAccountIds"
    | "exportDirectory"
    | "budgetWarningThreshold"
    | "rawStatementRetentionDays"
  >
>;

export interface LocalApiAppConfigSyncState {
  lastSyncedAt?: string;
  nextSyncAllowedAt?: number;
  schedule: LocalAppSyncSchedule;
}

export interface LocalApiAppConfig {
  profile: string;
  source: "fixture" | "monobank";
  dataDir: string;
  databasePath: string;
  localOnly: boolean;
  access: LocalApiAccessBinding;
  webhook: LocalApiWebhookSettings;
  token: LocalApiMonobankTokenStatus;
  settings: LocalAppSettings;
  sync: LocalApiAppConfigSyncState;
}

export interface LocalApiStorageInfo {
  profile: string;
  dataDir: string;
  databasePath: string;
  databaseBytes: number;
  databaseModifiedAt?: string;
  integrityCheck: string;
  pageCount: number;
  pageSize: number;
  migrations: readonly string[];
  accounts: number;
  ledgerEntries: number;
  syncRuns: number;
  webhookEvents: number;
  backupDirectory: string;
  backups: readonly LocalApiBackupFile[];
  latestBackupPath?: string;
  latestBackupAt?: string;
  lastCompactAt?: string;
}

export interface LocalApiBackupFile {
  path: string;
  modifiedAt: string;
  bytes: number;
}

export interface LocalApiBackupResult {
  profile: string;
  backupPath: string;
  databasePath: string;
  createdAt: string;
  bytes: number;
}

export interface LocalApiLocalDataDeletionResult {
  profile: string;
  databasePath: string;
  tokenRemoved: boolean;
  ledgerDataDeleted: boolean;
  deleted: Record<string, number>;
}

export interface LocalConfigurationImportResult {
  imported: {
    categories: number;
    categoryRules: number;
    budgets: number;
    budgetPeriods: number;
    tags: number;
  };
}

export interface LocalExportRecord {
  id: string;
  profile: string;
  format: string;
  preset?: string;
  filters: Record<string, unknown>;
  rowCount: number;
  destination: "browser_download" | "local_folder" | "database_copy";
  filePath?: string;
  status: "success" | "failed";
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface LedgerExportRequest {
  format?: "csv" | "json" | "jsonl" | "journal-csv" | "parquet" | "sqlite";
  preset?: string;
  from?: number;
  to?: number;
  accountId?: string;
  categoryId?: string;
  merchantName?: string;
  status?: "hold" | "posted";
  reviewState?: "needs_review" | "reviewed" | "ignored";
  currencyCode?: number;
  amountMin?: number;
  amountMax?: number;
  tag?: string;
  includeExcludedAccounts?: boolean;
  redacted?: boolean;
}

export interface LedgerSummary {
  profile: string;
  accounts: number;
  ledgerEntries: number;
  income: number;
  expenses: number;
  net: number;
  monthToDate: LedgerCashflowSummary;
  currencies: readonly number[];
  lastSyncedAt?: string;
  oldestSyncCursorUpdatedAt?: string;
}

export interface LedgerCashflowSummary {
  month: string;
  from: string;
  to: string;
  income: number;
  expenses: number;
  net: number;
}

export interface LedgerCategorySpending {
  categoryId: string;
  categoryName: string;
  currencyCode: number;
  amount: number;
  transactionCount: number;
}

export interface MonthlySpendingCurrencyTotal {
  currencyCode: number;
  amount: number;
  transactionCount: number;
  averageTransactionAmount: number;
}

export interface MonthlySpendingCategory {
  categoryId: string;
  categoryName: string;
  currencyCode: number;
  amount: number;
  transactionCount: number;
  sharePercentage: number;
}

export interface MonthlySpendingMerchant {
  merchantName: string;
  currencyCode: number;
  amount: number;
  transactionCount: number;
  sharePercentage: number;
}

export interface ReportCurrencyConversionRate {
  currencyCode: number;
  baseCurrencyCode: number;
  rate: number;
  date: number;
}

export interface ConvertedReportTotals {
  baseCurrencyCode: number;
  totalIncome?: number;
  totalExpenses?: number;
  netCashflow?: number;
  totalSavings?: number;
  totalCurrentBalance?: number;
  totalProjectedOutflows?: number;
  totalProjectedBalance?: number;
  missingCurrencyCodes: readonly number[];
  rates: readonly ReportCurrencyConversionRate[];
}

export interface MonthlySpendingReport {
  profile: string;
  month: string;
  from: string;
  to: string;
  generatedAt: string;
  totalExpenses: number;
  transactionCount: number;
  averageTransactionAmount: number;
  currencies: readonly number[];
  currencyTotals: readonly MonthlySpendingCurrencyTotal[];
  categories: readonly MonthlySpendingCategory[];
  merchants: readonly MonthlySpendingMerchant[];
  convertedTotals?: ConvertedReportTotals;
}

export interface CashflowReportPoint {
  month: string;
  from: string;
  to: string;
  currencyCode: number;
  income: number;
  expenses: number;
  net: number;
  transactionCount: number;
}

export interface CashflowReportCurrencyTotal {
  currencyCode: number;
  income: number;
  expenses: number;
  net: number;
  transactionCount: number;
}

export interface CashflowReport {
  profile: string;
  from: string;
  to: string;
  months: number;
  generatedAt: string;
  totalIncome: number;
  totalExpenses: number;
  netCashflow: number;
  transactionCount: number;
  currencies: readonly number[];
  totals: readonly CashflowReportCurrencyTotal[];
  points: readonly CashflowReportPoint[];
  convertedTotals?: ConvertedReportTotals;
}

export interface SavingsRateReportPoint {
  month: string;
  from: string;
  to: string;
  currencyCode: number;
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;
  transactionCount: number;
}

export interface SavingsRateReportCurrencyTotal {
  currencyCode: number;
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;
  transactionCount: number;
  averageMonthlySavings: number;
}

export interface SavingsRateReport {
  profile: string;
  from: string;
  to: string;
  months: number;
  generatedAt: string;
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  savingsRate: number;
  transactionCount: number;
  currencies: readonly number[];
  totals: readonly SavingsRateReportCurrencyTotal[];
  points: readonly SavingsRateReportPoint[];
  convertedTotals?: ConvertedReportTotals;
}

export interface BalanceProjectionPoint {
  date: string;
  currencyCode: number;
  startingBalance: number;
  projectedOutflows: number;
  projectedBalance: number;
  eventCount: number;
}

export interface BalanceProjectionCurrencyTotal {
  currencyCode: number;
  currentBalance: number;
  projectedOutflows: number;
  projectedBalance: number;
  eventCount: number;
}

export interface BalanceProjectionEvent {
  id: string;
  recurringItemId: string;
  accountId: string;
  categoryId?: string;
  merchantName?: string;
  frequency: RecurringCalendarEvent["frequency"];
  currencyCode: number;
  date: string;
  dueAt: string;
  projectedAmount: number;
}

export interface BalanceProjectionReport {
  profile: string;
  from: string;
  to: string;
  days: number;
  generatedAt: string;
  totalCurrentBalance: number;
  totalProjectedOutflows: number;
  totalProjectedBalance: number;
  currencies: readonly number[];
  totals: readonly BalanceProjectionCurrencyTotal[];
  points: readonly BalanceProjectionPoint[];
  events: readonly BalanceProjectionEvent[];
  convertedTotals?: ConvertedReportTotals;
}

export interface CategoryTrendReportPoint {
  month: string;
  from: string;
  to: string;
  categoryId: string;
  categoryName: string;
  currencyCode: number;
  amount: number;
  transactionCount: number;
}

export interface CategoryTrendReportCategory {
  categoryId: string;
  categoryName: string;
  currencyCode: number;
  amount: number;
  transactionCount: number;
  averageMonthlyAmount: number;
}

export interface CategoryTrendReport {
  profile: string;
  from: string;
  to: string;
  months: number;
  generatedAt: string;
  totalExpenses: number;
  transactionCount: number;
  currencies: readonly number[];
  categories: readonly CategoryTrendReportCategory[];
  points: readonly CategoryTrendReportPoint[];
  convertedTotals?: ConvertedReportTotals;
}

export interface MerchantTrendReportPoint {
  month: string;
  from: string;
  to: string;
  merchantName: string;
  currencyCode: number;
  amount: number;
  transactionCount: number;
}

export interface MerchantTrendReportMerchant {
  merchantName: string;
  currencyCode: number;
  amount: number;
  transactionCount: number;
  averageMonthlyAmount: number;
}

export interface MerchantTrendReport {
  profile: string;
  from: string;
  to: string;
  months: number;
  generatedAt: string;
  totalExpenses: number;
  transactionCount: number;
  currencies: readonly number[];
  merchants: readonly MerchantTrendReportMerchant[];
  points: readonly MerchantTrendReportPoint[];
  convertedTotals?: ConvertedReportTotals;
}

export interface BudgetProgress {
  id: string;
  budgetId: string;
  profile: string;
  categoryId: string;
  categoryName: string;
  currencyCode: number;
  periodStart: string;
  periodEnd: string;
  periodStatus?: "open" | "closed";
  amountLimit: number;
  actualAmount: number;
  remainingAmount: number;
  progressPercentage: number;
  status: "on_track" | "near_limit" | "overspent";
}

export interface NetWorthTrendPoint {
  date: string;
  amount: number;
  currencyCode: number;
}

export interface NetWorthTrend {
  enabled: boolean;
  reason?: string;
  points: readonly NetWorthTrendPoint[];
}

export interface UpcomingRecurringPayment {
  id: string;
  recurringItemId: string;
  profile: string;
  accountId: string;
  categoryId?: string;
  merchantName?: string;
  frequency:
    | "daily"
    | "weekly"
    | "monthly"
    | "quarterly"
    | "yearly"
    | "irregular";
  expectedAmountMin?: number;
  expectedAmountMax?: number;
  currencyCode: number;
  lastSeenAt?: string;
  nextDueAt: string;
  daysUntilDue: number;
  isOverdue: boolean;
}

export interface MissedRecurringPayment {
  id: string;
  recurringItemId: string;
  profile: string;
  accountId: string;
  categoryId?: string;
  merchantName?: string;
  frequency:
    | "daily"
    | "weekly"
    | "monthly"
    | "quarterly"
    | "yearly"
    | "irregular";
  expectedAmountMin?: number;
  expectedAmountMax?: number;
  currencyCode: number;
  expectedDate: string;
  expectedDueAt: string;
  daysOverdue: number;
  matchWindowStart: string;
  matchWindowEnd: string;
  lastSeenAt?: string;
}

export interface SubscriptionIncreaseAlert {
  id: string;
  recurringItemId: string;
  ledgerEntryId: string;
  profile: string;
  accountId: string;
  categoryId?: string;
  merchantName?: string;
  frequency:
    | "daily"
    | "weekly"
    | "monthly"
    | "quarterly"
    | "yearly"
    | "irregular";
  expectedAmountMin?: number;
  expectedAmountMax: number;
  actualAmount: number;
  increaseAmount: number;
  increasePercentage: number;
  currencyCode: number;
  occurredAt: string;
  lastSeenAt?: string;
}

export interface RecurringCalendarEvent {
  id: string;
  recurringItemId: string;
  profile: string;
  accountId: string;
  categoryId?: string;
  merchantName?: string;
  frequency:
    | "daily"
    | "weekly"
    | "monthly"
    | "quarterly"
    | "yearly"
    | "irregular";
  expectedAmountMin?: number;
  expectedAmountMax?: number;
  currencyCode: number;
  date: string;
  month: string;
  dueAt: string;
  isPast: boolean;
}

export interface RecurringDetectionCandidate {
  id: string;
  profile: string;
  accountId: string;
  categoryId?: string;
  merchantName: string;
  frequency:
    | "daily"
    | "weekly"
    | "monthly"
    | "quarterly"
    | "yearly"
    | "irregular";
  expectedAmountMin: number;
  expectedAmountMax: number;
  currencyCode: number;
  occurrences: number;
  confidence: number;
  firstSeenAt: string;
  lastSeenAt: string;
  averageGapDays?: number;
  latestLedgerEntryId: string;
}

export interface RecurringItem {
  id: string;
  profile: string;
  accountId: string;
  categoryId?: string;
  merchantName?: string;
  frequency:
    | "daily"
    | "weekly"
    | "monthly"
    | "quarterly"
    | "yearly"
    | "irregular";
  expectedAmountMin?: number;
  expectedAmountMax?: number;
  isActive: boolean;
  startedAt?: string;
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManualRecurringItemInput {
  accountId: string;
  categoryId?: string;
  merchantName?: string;
  frequency: RecurringItem["frequency"];
  expectedAmountMin?: number;
  expectedAmountMax?: number;
  isActive?: boolean;
  startedAt?: string;
}

export interface RecurringDetectionDecisionResult {
  profile: string;
  candidateId: string;
  action: "confirmed" | "ignored";
  updatedAt: string;
  recurringItem?: RecurringItem;
}

export interface LedgerAccount {
  id: string;
  type: string;
  currencyCode: number;
  balance: number;
  creditLimit: number;
  maskedPan?: readonly string[];
  includedInReports?: boolean;
  updatedAt: string;
}

export interface LedgerJar {
  id: string;
  title: string;
  description: string;
  currencyCode: number;
  balance: number;
  goal: number;
  updatedAt: string;
}

export interface SavingsGoalProgress {
  id: string;
  source: "jar";
  sourceId: string;
  title: string;
  description: string;
  currencyCode: number;
  currentAmount: number;
  targetAmount: number;
  remainingAmount: number;
  progressPercentage: number;
  status: "not_started" | "in_progress" | "completed";
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  description?: string;
  isSystem?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CategoryRule {
  id: string;
  categoryId: string;
  name: string;
  priority: number;
  matchType: "condition" | "fallback";
  merchantContains?: string;
  descriptionContains?: string;
  mcc?: number;
  amountDirection?: "income" | "expense" | "any";
  isSystem?: boolean;
  isEnabled?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CategoryRuleInput {
  categoryId: string;
  name?: string;
  merchantContains?: string;
  descriptionContains?: string;
  mcc?: number;
  amountDirection?: "income" | "expense" | "any";
  priority?: number;
  isEnabled?: boolean;
}

export interface MerchantCleanupRule {
  id: string;
  name: string;
  priority: number;
  merchantContains: string;
  canonicalName: string;
  isSystem?: boolean;
  isEnabled?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface LedgerEntry {
  id: string;
  accountId: string;
  time: number;
  description: string;
  amount: number;
  operationAmount?: number;
  currencyCode: number;
  categoryId?: string;
  categoryName?: string;
  categorySource?: "system_rule" | "user_rule" | "manual";
  categoryRuleId?: string;
  categoryRuleVersion?: string;
  merchantName?: string;
  hold?: boolean;
  balance?: number;
  note?: string;
  tags?: readonly string[];
  splitPlan?: readonly {
    category: string;
    amount: number;
  }[];
  reviewState?: "needs_review" | "reviewed" | "ignored";
  reviewedAt?: string;
  reviewedSource?: string;
  rawStatementItemId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LedgerEntrySplitPlanUpdate {
  lines: readonly {
    category: string;
    amount: number;
  }[];
}

export interface LedgerEntryBulkEditUpdate {
  ids: readonly string[];
  categoryId?: string;
  merchantName?: string;
  tags?: readonly string[];
  reviewState?: "needs_review" | "reviewed" | "ignored";
  reviewedSource?: string;
}

export interface LedgerEntryCategoryRestoreEntry {
  id: string;
  categoryId?: string;
  categoryName?: string;
  categorySource?: "system_rule" | "user_rule" | "manual";
  categoryRuleId?: string;
  categoryRuleVersion?: string;
}

export interface MonthlyCategoryBudgetInput {
  categoryId: string;
  currencyCode?: number;
  month: string;
  amountLimit: number;
  rollover?: boolean;
}

export interface LedgerEntryPage {
  entries: readonly LedgerEntry[];
  total: number;
  limit: number;
  offset: number;
}

export type LedgerTransactionSortField =
  | "time"
  | "merchant"
  | "amount"
  | "account"
  | "category"
  | "status";

export type LedgerTransactionSortDirection = "asc" | "desc";

export interface LedgerTransactionFilters {
  accountId?: string;
  categoryId?: string;
  merchantName?: string;
  status?: "hold" | "posted";
  reviewState?: "needs_review" | "reviewed" | "ignored";
  currencyCode?: number;
  amountMin?: number;
  amountMax?: number;
  search?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
  sortBy?: LedgerTransactionSortField;
  sortDirection?: LedgerTransactionSortDirection;
}

export interface SyncRun {
  id: string;
  profile: string;
  source: "fixture" | "monobank";
  status:
    | "queued"
    | "running"
    | "success"
    | "partial"
    | "failed"
    | "interrupted";
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
  apiCalls: number;
  windowsFetched: number;
  itemsSeen: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsSkipped: number;
  rateLimited: number;
}

export interface WebhookEvent {
  id: string;
  profile: string;
  accountId: string;
  type: string;
  statementItemId?: string;
  status: DomainWebhookEventStatus;
  receivedAt: string;
  processedAt?: string;
}

export type LocalActivityEventType = DomainLocalActivityEventType;

export type LocalActivityEventSeverity = DomainLocalActivityEventSeverity;

export type LocalActivityEvent = DomainLocalActivityEvent;

export interface OfflineSnapshotMetadata {
  cachedAt: string;
  reason: string;
}

export interface LocalAppSnapshot {
  health: LocalApiHealth;
  config: LocalApiAppConfig;
  summary: LedgerSummary;
  netWorthTrend: NetWorthTrend;
  accounts: readonly LedgerAccount[];
  jars: readonly LedgerJar[];
  savingsGoalProgress: readonly SavingsGoalProgress[];
  categories: readonly Category[];
  categoryRules: readonly CategoryRule[];
  merchantCleanupRules: readonly MerchantCleanupRule[];
  categorySpending: readonly LedgerCategorySpending[];
  cashflowReport: CashflowReport;
  savingsRateReport: SavingsRateReport;
  balanceProjectionReport: BalanceProjectionReport;
  categoryTrendReport: CategoryTrendReport;
  merchantTrendReport: MerchantTrendReport;
  monthlySpendingReport: MonthlySpendingReport;
  budgetProgress: readonly BudgetProgress[];
  upcomingRecurringPayments: readonly UpcomingRecurringPayment[];
  missedRecurringPayments: readonly MissedRecurringPayment[];
  subscriptionIncreaseAlerts: readonly SubscriptionIncreaseAlert[];
  recurringDetectionCandidates: readonly RecurringDetectionCandidate[];
  recurringCalendar: readonly RecurringCalendarEvent[];
  transactions: LedgerEntryPage;
  syncRuns: readonly SyncRun[];
  webhookEvents: readonly WebhookEvent[];
  storage: LocalApiStorageInfo;
  exportHistory: readonly LocalExportRecord[];
  activityEvents: readonly LocalActivityEvent[];
  offline?: OfflineSnapshotMetadata;
}
