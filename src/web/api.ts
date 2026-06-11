import type {
  LocalActivityEvent as DomainLocalActivityEvent,
  LocalActivityEventSeverity as DomainLocalActivityEventSeverity,
  LocalActivityEventType as DomainLocalActivityEventType,
  WebhookEventStatus as DomainWebhookEventStatus,
} from "../domain/index.js";

export interface LocalApiHealth {
  status: "ok";
  localOnly: true;
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

export interface LocalApiAppConfig {
  profile: string;
  source: "fixture" | "monobank";
  dataDir: string;
  databasePath: string;
  localOnly: true;
  webhook: LocalApiWebhookSettings;
  token: LocalApiMonobankTokenStatus;
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
  status: "queued" | "running" | "success" | "partial" | "failed";
  startedAt: string;
  finishedAt?: string;
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

export interface LocalApiFixtureSummary {
  source: "fixture";
  profile: string;
  accounts: number;
  jars: number;
  currencyRates: number;
  statementAccounts: number;
  statementItems: number;
  webhookEvents: number;
  errorStates: number;
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
  activityEvents: readonly LocalActivityEvent[];
  fixtures?: LocalApiFixtureSummary;
  offline?: OfflineSnapshotMetadata;
}

interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CachedLocalAppSnapshot {
  cachedAt: string;
  snapshot: LocalAppSnapshot;
}

type PersistedLocalAppSnapshot = Omit<
  LocalAppSnapshot,
  | "netWorthTrend"
  | "jars"
  | "savingsGoalProgress"
  | "categorySpending"
  | "cashflowReport"
  | "savingsRateReport"
  | "balanceProjectionReport"
  | "categoryTrendReport"
  | "merchantTrendReport"
  | "monthlySpendingReport"
  | "budgetProgress"
  | "upcomingRecurringPayments"
  | "missedRecurringPayments"
  | "subscriptionIncreaseAlerts"
  | "recurringDetectionCandidates"
  | "recurringCalendar"
  | "merchantCleanupRules"
  | "categoryRules"
> & {
  netWorthTrend?: NetWorthTrend;
  jars?: readonly LedgerJar[];
  savingsGoalProgress?: readonly SavingsGoalProgress[];
  categorySpending?: readonly LedgerCategorySpending[];
  cashflowReport?: CashflowReport;
  savingsRateReport?: SavingsRateReport;
  balanceProjectionReport?: BalanceProjectionReport;
  categoryTrendReport?: CategoryTrendReport;
  merchantTrendReport?: MerchantTrendReport;
  monthlySpendingReport?: MonthlySpendingReport;
  budgetProgress?: readonly BudgetProgress[];
  upcomingRecurringPayments?: readonly UpcomingRecurringPayment[];
  missedRecurringPayments?: readonly MissedRecurringPayment[];
  subscriptionIncreaseAlerts?: readonly SubscriptionIncreaseAlert[];
  recurringDetectionCandidates?: readonly RecurringDetectionCandidate[];
  recurringCalendar?: readonly RecurringCalendarEvent[];
  merchantCleanupRules?: readonly MerchantCleanupRule[];
  categoryRules?: readonly CategoryRule[];
  summary: Omit<LedgerSummary, "monthToDate"> & {
    monthToDate?: LedgerCashflowSummary;
  };
};

const LOCAL_APP_SNAPSHOT_CACHE_PREFIX =
  "mono-ledger-sync:local-app-snapshot:v1:";
const LOCAL_APP_ACTIVE_SNAPSHOT_CACHE_KEY =
  "mono-ledger-sync:active-snapshot:v1";
const LOCAL_APP_TRANSACTION_LIMIT = 25;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Local API unavailable";
}

function browserStorage(): BrowserStorage | undefined {
  try {
    return (globalThis as { localStorage?: BrowserStorage }).localStorage;
  } catch {
    return undefined;
  }
}

function snapshotCacheKey(profile: string, databasePath: string): string {
  return `${LOCAL_APP_SNAPSHOT_CACHE_PREFIX}${encodeURIComponent(
    profile,
  )}:${encodeURIComponent(databasePath)}`;
}

function readCachedJson<T>(key: string): T | undefined {
  const storage = browserStorage();

  if (!storage) {
    return undefined;
  }

  try {
    const raw = storage.getItem(key);

    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    try {
      storage.removeItem(key);
    } catch {}

    return undefined;
  }
}

function writeCachedJson(key: string, value: unknown): void {
  const storage = browserStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {}
}

function cacheableSnapshot(snapshot: LocalAppSnapshot): LocalAppSnapshot {
  const { offline: _offline, ...cacheable } = snapshot;

  return cacheable;
}

function emptyCashflowReport(
  profile: string,
  monthToDate: LedgerCashflowSummary,
): CashflowReport {
  return {
    profile,
    from: monthToDate.from,
    to: monthToDate.to,
    months: 1,
    generatedAt: new Date().toISOString(),
    totalIncome: 0,
    totalExpenses: 0,
    netCashflow: 0,
    transactionCount: 0,
    currencies: [],
    totals: [],
    points: [],
  };
}

function emptySavingsRateReport(
  profile: string,
  monthToDate: LedgerCashflowSummary,
): SavingsRateReport {
  return {
    profile,
    from: monthToDate.from,
    to: monthToDate.to,
    months: 1,
    generatedAt: new Date().toISOString(),
    totalIncome: 0,
    totalExpenses: 0,
    totalSavings: 0,
    savingsRate: 0,
    transactionCount: 0,
    currencies: [],
    totals: [],
    points: [],
  };
}

function emptyBalanceProjectionReport(
  profile: string,
  monthToDate: LedgerCashflowSummary,
): BalanceProjectionReport {
  return {
    profile,
    from: monthToDate.to,
    to: monthToDate.to,
    days: 1,
    generatedAt: new Date().toISOString(),
    totalCurrentBalance: 0,
    totalProjectedOutflows: 0,
    totalProjectedBalance: 0,
    currencies: [],
    totals: [],
    points: [],
    events: [],
  };
}

function emptyCategoryTrendReport(
  profile: string,
  monthToDate: LedgerCashflowSummary,
): CategoryTrendReport {
  return {
    profile,
    from: monthToDate.from,
    to: monthToDate.to,
    months: 1,
    generatedAt: new Date().toISOString(),
    totalExpenses: 0,
    transactionCount: 0,
    currencies: [],
    categories: [],
    points: [],
  };
}

function emptyMerchantTrendReport(
  profile: string,
  monthToDate: LedgerCashflowSummary,
): MerchantTrendReport {
  return {
    profile,
    from: monthToDate.from,
    to: monthToDate.to,
    months: 1,
    generatedAt: new Date().toISOString(),
    totalExpenses: 0,
    transactionCount: 0,
    currencies: [],
    merchants: [],
    points: [],
  };
}

function emptyMonthlySpendingReport(
  profile: string,
  monthToDate: LedgerCashflowSummary,
): MonthlySpendingReport {
  return {
    profile,
    month: monthToDate.month,
    from: monthToDate.from,
    to: monthToDate.to,
    generatedAt: new Date().toISOString(),
    totalExpenses: 0,
    transactionCount: 0,
    averageTransactionAmount: 0,
    currencies: [],
    currencyTotals: [],
    categories: [],
    merchants: [],
  };
}

function normalizeCachedLocalAppSnapshot(
  cached: CachedLocalAppSnapshot,
): CachedLocalAppSnapshot {
  const snapshot = cached.snapshot as PersistedLocalAppSnapshot;
  const monthToDate = snapshot.summary.monthToDate ?? {
    month: "cached",
    from: "cached",
    to: "cached",
    income: snapshot.summary.income,
    expenses: snapshot.summary.expenses,
    net: snapshot.summary.net,
  };

  return {
    ...cached,
    snapshot: {
      ...snapshot,
      summary: {
        ...snapshot.summary,
        monthToDate,
      },
      netWorthTrend: snapshot.netWorthTrend ?? {
        enabled: false,
        reason: "Manual account and asset support is not enabled.",
        points: [],
      },
      jars: snapshot.jars ?? [],
      savingsGoalProgress: snapshot.savingsGoalProgress ?? [],
      categorySpending: snapshot.categorySpending ?? [],
      cashflowReport:
        snapshot.cashflowReport ??
        emptyCashflowReport(snapshot.summary.profile, monthToDate),
      savingsRateReport:
        snapshot.savingsRateReport ??
        emptySavingsRateReport(snapshot.summary.profile, monthToDate),
      balanceProjectionReport:
        snapshot.balanceProjectionReport ??
        emptyBalanceProjectionReport(snapshot.summary.profile, monthToDate),
      categoryTrendReport:
        snapshot.categoryTrendReport ??
        emptyCategoryTrendReport(snapshot.summary.profile, monthToDate),
      merchantTrendReport:
        snapshot.merchantTrendReport ??
        emptyMerchantTrendReport(snapshot.summary.profile, monthToDate),
      monthlySpendingReport:
        snapshot.monthlySpendingReport ??
        emptyMonthlySpendingReport(snapshot.summary.profile, monthToDate),
      budgetProgress: snapshot.budgetProgress ?? [],
      upcomingRecurringPayments: snapshot.upcomingRecurringPayments ?? [],
      missedRecurringPayments: snapshot.missedRecurringPayments ?? [],
      subscriptionIncreaseAlerts: snapshot.subscriptionIncreaseAlerts ?? [],
      recurringDetectionCandidates: snapshot.recurringDetectionCandidates ?? [],
      recurringCalendar: snapshot.recurringCalendar ?? [],
      merchantCleanupRules: snapshot.merchantCleanupRules ?? [],
      categoryRules: snapshot.categoryRules ?? [],
    },
  };
}

function readCachedLocalAppSnapshot(
  cacheKey: string,
): CachedLocalAppSnapshot | undefined {
  const cached = readCachedJson<CachedLocalAppSnapshot>(cacheKey);

  return cached ? normalizeCachedLocalAppSnapshot(cached) : undefined;
}

function readCachedActiveSnapshotKey(): string | undefined {
  return readCachedJson<string>(LOCAL_APP_ACTIVE_SNAPSHOT_CACHE_KEY);
}

function writeCachedLocalAppSnapshot(snapshot: LocalAppSnapshot): void {
  const cacheKey = snapshotCacheKey(
    snapshot.config.profile,
    snapshot.config.databasePath,
  );

  writeCachedJson(LOCAL_APP_ACTIVE_SNAPSHOT_CACHE_KEY, cacheKey);
  writeCachedJson(cacheKey, {
    cachedAt: new Date().toISOString(),
    snapshot: cacheableSnapshot(snapshot),
  } satisfies CachedLocalAppSnapshot);
}

function syncRunInProgressLabel(status: SyncRun["status"]): boolean {
  return status === "queued" || status === "running";
}

function formatSyncRunDuration(run: SyncRun): string {
  const startedAt = Date.parse(run.startedAt);
  if (!Number.isFinite(startedAt) || syncRunInProgressLabel(run.status)) {
    return "in progress";
  }

  const finishedAt = Date.parse(run.finishedAt ?? "");

  if (!Number.isFinite(finishedAt)) {
    return "unknown";
  }

  const totalSeconds = Math.round((finishedAt - startedAt) / 1000);

  if (totalSeconds < 1) {
    return "less than 1s";
  }

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function syncRunSeverity(
  status: SyncRun["status"],
): LocalActivityEventSeverity {
  if (status === "running" || status === "queued") {
    return "info";
  }

  if (status === "partial") {
    return "warning";
  }

  if (status === "failed") {
    return "error";
  }

  return "success";
}

function syncRunStatusLabel(status: SyncRun["status"]): string {
  switch (status) {
    case "queued":
      return "Queued sync";
    case "running":
      return "Running sync";
    case "success":
      return "Successful sync";
    case "partial":
      return "Partial sync";
    case "failed":
      return "Failed sync";
  }
}

function syncRunSummary(run: SyncRun): string {
  return `Seen ${run.itemsSeen}, inserted ${run.itemsInserted}, updated ${run.itemsUpdated}, skipped ${run.itemsSkipped} in ${formatSyncRunDuration(run)}`;
}

function syncRunSourceLabel(source: SyncRun["source"]): string {
  switch (source) {
    case "fixture":
      return "Fixture sync";
    case "monobank":
      return "Monobank sync";
    default:
      return "Local sync";
  }
}

function sortActivityEvents(
  events: readonly LocalActivityEvent[],
): readonly LocalActivityEvent[] {
  return [...events].sort(
    (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp),
  );
}

function formatSyncRunTimestamp(run: SyncRun): string {
  return syncRunInProgressLabel(run.status) && run.startedAt
    ? run.startedAt
    : (run.finishedAt ?? run.startedAt);
}

function syncRunCanRefreshReports(run: SyncRun): boolean {
  return run.status === "success" || run.status === "partial";
}

function syncRunLedgerWriteCount(run: SyncRun): number {
  return run.itemsInserted + run.itemsUpdated;
}

function syncRunLedgerWriteSeverity(run: SyncRun): LocalActivityEventSeverity {
  if (run.status === "partial") {
    return "partial";
  }

  return syncRunSeverity(run.status);
}

function webhookDeliveryPending(status: DomainWebhookEventStatus): boolean {
  return status === "pending";
}

function webhookDeliverySeverity(
  status: DomainWebhookEventStatus,
): LocalActivityEventSeverity {
  if (status === "failed") {
    return "error";
  }

  if (status === "processed") {
    return "success";
  }

  if (status === "duplicate") {
    return "info";
  }

  return "warning";
}

function webhookDeliveryLabel(status: DomainWebhookEventStatus): string {
  switch (status) {
    case "processed":
      return "Webhook reconciled";
    case "pending":
      return "Webhook not reconciled";
    case "duplicate":
      return "Webhook duplicate";
    case "ignored":
      return "Webhook ignored";
    case "failed":
      return "Webhook failed";
  }
}

export function buildLocalActivityEvents(
  syncRuns: readonly SyncRun[],
  webhookEvents: readonly WebhookEvent[],
): readonly LocalActivityEvent[] {
  const events: LocalActivityEvent[] = [];

  for (const run of syncRuns) {
    const isInProgress = syncRunInProgressLabel(run.status);

    events.push({
      id: `sync-run:${run.id}`,
      type: "sync_run",
      title: syncRunStatusLabel(run.status),
      details: `${syncRunSourceLabel(run.source)} • ${syncRunSummary(run)}`,
      timestamp: formatSyncRunTimestamp(run),
      severity: syncRunSeverity(run.status),
      source: run.profile,
      referenceId: run.id,
    });

    if (run.status === "failed") {
      events.push({
        id: `sync-run:${run.id}:error`,
        type: "error",
        title: "Sync run failed",
        details: `${syncRunSourceLabel(
          run.source,
        )} run ${run.id} needs attention`,
        timestamp: formatSyncRunTimestamp(run),
        severity: "error",
        source: run.profile,
        referenceId: run.id,
      });
    } else if (isInProgress) {
      events.push({
        id: `sync-run:${run.id}:pending`,
        type: "warning",
        title: "Sync still in progress",
        details: `${syncRunSourceLabel(run.source)} for ${
          run.profile
        } has not finished yet`,
        timestamp: formatSyncRunTimestamp(run),
        severity: "warning",
        source: run.profile,
        referenceId: run.id,
      });
    }

    const timestamp = formatSyncRunTimestamp(run);
    const ledgerWriteCount = syncRunLedgerWriteCount(run);

    if (ledgerWriteCount > 0) {
      events.push({
        id: `sync-run:${run.id}:ledger-write`,
        type: "ledger_write",
        title: "Ledger updated",
        details: `${ledgerWriteCount} local ledger ${
          ledgerWriteCount === 1 ? "entry" : "entries"
        } written from ${syncRunSourceLabel(run.source)}`,
        timestamp,
        severity: syncRunLedgerWriteSeverity(run),
        source: run.profile,
        referenceId: run.id,
        correlationId: run.id,
      });
    }

    if (syncRunCanRefreshReports(run)) {
      events.push({
        id: `sync-run:${run.id}:report-refresh`,
        type: "report_refresh",
        title: "Reports refreshed",
        details: `Local summaries refreshed after ${syncRunSourceLabel(
          run.source,
        )}`,
        timestamp,
        severity: run.status === "partial" ? "partial" : "success",
        source: run.profile,
        referenceId: run.id,
        correlationId: run.id,
      });
    }
  }

  for (const event of webhookEvents) {
    const status = event.status;
    events.push({
      id: `webhook:${event.id}`,
      type: "webhook_delivery",
      title: `Webhook ${event.type}`,
      details: `account ${event.accountId}${event.statementItemId ? ` • statement ${event.statementItemId}` : ""}`,
      timestamp: event.receivedAt,
      severity: webhookDeliverySeverity(status),
      source: event.accountId,
      referenceId: event.id,
    });

    if (webhookDeliveryPending(status)) {
      events.push({
        id: `webhook:${event.id}:warning`,
        type: "warning",
        title: webhookDeliveryLabel(status),
        details: `Pending pull for ${event.accountId} ${event.statementItemId ? `statement ${event.statementItemId}` : ""}`,
        timestamp: event.receivedAt,
        severity: "warning",
        source: event.accountId,
        referenceId: event.id,
      });
    }

    if (status === "failed") {
      events.push({
        id: `webhook:${event.id}:error`,
        type: "error",
        title: webhookDeliveryLabel(status),
        details: `Webhook event for ${event.accountId} failed`,
        timestamp: event.receivedAt,
        severity: "error",
        source: event.accountId,
        referenceId: event.id,
      });
    }

    if (status === "ignored") {
      events.push({
        id: `webhook:${event.id}:ignored`,
        type: "warning",
        title: webhookDeliveryLabel(status),
        details: `Webhook event for ${event.accountId} was ignored`,
        timestamp: event.receivedAt,
        severity: "warning",
        source: event.accountId,
        referenceId: event.id,
      });
    }
  }

  return sortActivityEvents(events);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  return (await response.json()) as T;
}

function transactionQueryString(filters: LedgerTransactionFilters): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") {
      continue;
    }

    params.set(key, String(value));
  }

  return params.toString();
}

export async function loadLedgerTransactions(
  filters: LedgerTransactionFilters = {},
): Promise<LedgerEntryPage> {
  const queryString = transactionQueryString(filters);

  return requestJson<LedgerEntryPage>(
    `/api/ledger/transactions${queryString ? `?${queryString}` : ""}`,
  );
}

export async function updateLedgerTransactionAnnotation(
  id: string,
  update: { note?: string; tags?: readonly string[] },
): Promise<LedgerEntry> {
  return requestJson<LedgerEntry>(
    `/api/ledger/transactions/${encodeURIComponent(id)}/annotation`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(update),
    },
  );
}

export async function updateLedgerTransactionsBulk(
  update: LedgerEntryBulkEditUpdate,
): Promise<readonly LedgerEntry[]> {
  return requestJson<readonly LedgerEntry[]>(
    "/api/ledger/transactions/bulk-edit",
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(update),
    },
  );
}

export async function updateLedgerTransactionSplitPlan(
  id: string,
  update: LedgerEntrySplitPlanUpdate,
): Promise<LedgerEntry> {
  return requestJson<LedgerEntry>(
    `/api/ledger/transactions/${encodeURIComponent(id)}/split-plan`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(update),
    },
  );
}

export async function createMonthlyCategoryBudget(
  input: MonthlyCategoryBudgetInput,
): Promise<BudgetProgress> {
  return requestJson<BudgetProgress>("/api/ledger/budgets/monthly", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function deleteMonthlyCategoryBudget(
  budgetPeriodId: string,
): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(
    `/api/ledger/budgets/monthly/${encodeURIComponent(budgetPeriodId)}`,
    {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
      },
    },
  );
}

export async function closeMonthlyBudgetPeriod(
  budgetPeriodId: string,
): Promise<BudgetProgress> {
  return requestJson<BudgetProgress>(
    `/api/ledger/budgets/monthly/${encodeURIComponent(budgetPeriodId)}/close`,
    {
      method: "PATCH",
    },
  );
}

export async function reopenMonthlyBudgetPeriod(
  budgetPeriodId: string,
): Promise<BudgetProgress> {
  return requestJson<BudgetProgress>(
    `/api/ledger/budgets/monthly/${encodeURIComponent(budgetPeriodId)}/reopen`,
    {
      method: "PATCH",
    },
  );
}

export async function loadRecurringDetectionCandidates(): Promise<
  readonly RecurringDetectionCandidate[]
> {
  return requestJson<readonly RecurringDetectionCandidate[]>(
    "/api/ledger/recurring-detections",
  );
}

export async function loadMonthlySpendingReport(options?: {
  month?: string;
}): Promise<MonthlySpendingReport> {
  const params = new URLSearchParams();

  if (options?.month) {
    params.set("month", options.month);
  }

  const query = params.toString();

  return requestJson<MonthlySpendingReport>(
    `/api/ledger/reports/monthly-spending${query ? `?${query}` : ""}`,
  );
}

export async function loadCashflowReport(options?: {
  months?: number;
}): Promise<CashflowReport> {
  const params = new URLSearchParams();

  if (options?.months !== undefined) {
    params.set("months", String(options.months));
  }

  const query = params.toString();

  return requestJson<CashflowReport>(
    `/api/ledger/reports/cashflow${query ? `?${query}` : ""}`,
  );
}

export async function loadSavingsRateReport(options?: {
  months?: number;
}): Promise<SavingsRateReport> {
  const params = new URLSearchParams();

  if (options?.months !== undefined) {
    params.set("months", String(options.months));
  }

  const query = params.toString();

  return requestJson<SavingsRateReport>(
    `/api/ledger/reports/savings-rate${query ? `?${query}` : ""}`,
  );
}

export async function loadBalanceProjectionReport(options?: {
  days?: number;
}): Promise<BalanceProjectionReport> {
  const params = new URLSearchParams();

  if (options?.days !== undefined) {
    params.set("days", String(options.days));
  }

  const query = params.toString();

  return requestJson<BalanceProjectionReport>(
    `/api/ledger/reports/balance-projection${query ? `?${query}` : ""}`,
  );
}

export async function loadCategoryTrendReport(options?: {
  months?: number;
}): Promise<CategoryTrendReport> {
  const params = new URLSearchParams();

  if (options?.months !== undefined) {
    params.set("months", String(options.months));
  }

  const query = params.toString();

  return requestJson<CategoryTrendReport>(
    `/api/ledger/reports/category-trends${query ? `?${query}` : ""}`,
  );
}

export async function loadMerchantTrendReport(options?: {
  months?: number;
}): Promise<MerchantTrendReport> {
  const params = new URLSearchParams();

  if (options?.months !== undefined) {
    params.set("months", String(options.months));
  }

  const query = params.toString();

  return requestJson<MerchantTrendReport>(
    `/api/ledger/reports/merchant-trends${query ? `?${query}` : ""}`,
  );
}

export async function confirmRecurringDetection(
  candidateId: string,
): Promise<RecurringDetectionDecisionResult> {
  return requestJson<RecurringDetectionDecisionResult>(
    `/api/ledger/recurring-detections/${encodeURIComponent(candidateId)}/confirm`,
    {
      method: "POST",
    },
  );
}

export async function ignoreRecurringDetection(
  candidateId: string,
): Promise<RecurringDetectionDecisionResult> {
  return requestJson<RecurringDetectionDecisionResult>(
    `/api/ledger/recurring-detections/${encodeURIComponent(candidateId)}/ignore`,
    {
      method: "POST",
    },
  );
}

export async function loadMissedRecurringPayments(
  options: {
    asOf?: string;
  } = {},
): Promise<readonly MissedRecurringPayment[]> {
  const params = new URLSearchParams();

  if (options.asOf) {
    params.set("asOf", options.asOf);
  }

  const query = params.toString();

  return requestJson<readonly MissedRecurringPayment[]>(
    `/api/ledger/missed-recurring-payments${query ? `?${query}` : ""}`,
  );
}

export async function loadSubscriptionIncreaseAlerts(
  options: {
    asOf?: string;
  } = {},
): Promise<readonly SubscriptionIncreaseAlert[]> {
  const params = new URLSearchParams();

  if (options.asOf) {
    params.set("asOf", options.asOf);
  }

  const query = params.toString();

  return requestJson<readonly SubscriptionIncreaseAlert[]>(
    `/api/ledger/subscription-increase-alerts${query ? `?${query}` : ""}`,
  );
}

export async function loadRecurringCalendar(
  options: {
    from?: string;
    to?: string;
  } = {},
): Promise<readonly RecurringCalendarEvent[]> {
  const params = new URLSearchParams();

  if (options.from) {
    params.set("from", options.from);
  }

  if (options.to) {
    params.set("to", options.to);
  }

  const query = params.toString();

  return requestJson<readonly RecurringCalendarEvent[]>(
    `/api/ledger/recurring-calendar${query ? `?${query}` : ""}`,
  );
}

export async function loadLocalAppSnapshot(): Promise<LocalAppSnapshot> {
  let config: LocalApiAppConfig | undefined;

  try {
    config = await requestJson<LocalApiAppConfig>("/api/app/config");

    const [
      health,
      summary,
      netWorthTrend,
      accounts,
      jars,
      savingsGoalProgress,
      categories,
      categoryRules,
      merchantCleanupRules,
      categorySpending,
      cashflowReport,
      savingsRateReport,
      balanceProjectionReport,
      categoryTrendReport,
      merchantTrendReport,
      monthlySpendingReport,
      budgetProgress,
      upcomingRecurringPayments,
      missedRecurringPayments,
      subscriptionIncreaseAlerts,
      recurringDetectionCandidates,
      recurringCalendar,
      transactions,
      syncRuns,
      webhookEvents,
    ] = await Promise.all([
      requestJson<LocalApiHealth>("/api/health"),
      requestJson<LedgerSummary>("/api/ledger/summary"),
      requestJson<NetWorthTrend>("/api/ledger/net-worth-trend"),
      requestJson<readonly LedgerAccount[]>("/api/ledger/accounts"),
      requestJson<readonly LedgerJar[]>("/api/ledger/jars"),
      requestJson<readonly SavingsGoalProgress[]>(
        "/api/ledger/savings-goal-progress",
      ),
      requestJson<readonly Category[]>("/api/ledger/categories"),
      requestJson<readonly CategoryRule[]>("/api/ledger/category-rules"),
      requestJson<readonly MerchantCleanupRule[]>(
        "/api/ledger/merchant-cleanup-rules",
      ),
      requestJson<readonly LedgerCategorySpending[]>(
        "/api/ledger/category-spending",
      ),
      loadCashflowReport(),
      loadSavingsRateReport(),
      loadBalanceProjectionReport(),
      loadCategoryTrendReport(),
      loadMerchantTrendReport(),
      loadMonthlySpendingReport(),
      requestJson<readonly BudgetProgress[]>("/api/ledger/budget-progress"),
      requestJson<readonly UpcomingRecurringPayment[]>(
        "/api/ledger/upcoming-recurring-payments",
      ),
      loadMissedRecurringPayments(),
      loadSubscriptionIncreaseAlerts(),
      loadRecurringDetectionCandidates(),
      loadRecurringCalendar(),
      loadLedgerTransactions({ limit: LOCAL_APP_TRANSACTION_LIMIT }),
      requestJson<readonly SyncRun[]>("/api/sync/runs"),
      requestJson<readonly WebhookEvent[]>("/api/webhooks/events"),
    ]);

    const activityEvents = buildLocalActivityEvents(syncRuns, webhookEvents);

    const fixtures =
      config.source === "fixture"
        ? await requestJson<LocalApiFixtureSummary>("/api/fixtures/summary")
        : undefined;

    const snapshot = {
      health,
      config,
      summary,
      netWorthTrend,
      accounts,
      jars,
      savingsGoalProgress,
      categories,
      categoryRules,
      merchantCleanupRules,
      categorySpending,
      cashflowReport,
      savingsRateReport,
      balanceProjectionReport,
      categoryTrendReport,
      merchantTrendReport,
      monthlySpendingReport,
      budgetProgress,
      upcomingRecurringPayments,
      missedRecurringPayments,
      subscriptionIncreaseAlerts,
      recurringDetectionCandidates,
      recurringCalendar,
      transactions,
      syncRuns,
      webhookEvents,
      activityEvents,
      ...(fixtures ? { fixtures } : {}),
    } satisfies LocalAppSnapshot;

    writeCachedLocalAppSnapshot(snapshot);

    return snapshot;
  } catch (error) {
    const cacheKey = config
      ? snapshotCacheKey(config.profile, config.databasePath)
      : readCachedActiveSnapshotKey();
    const cached = cacheKey ? readCachedLocalAppSnapshot(cacheKey) : undefined;

    if (cached) {
      return {
        ...cached.snapshot,
        offline: {
          cachedAt: cached.cachedAt,
          reason: errorMessage(error),
        },
      };
    }

    throw error;
  }
}

export async function runFixtureSync(): Promise<void> {
  await requestJson("/api/sync/run", {
    method: "POST",
  });
}

export async function saveMonobankToken(
  token: string,
  profile: string,
): Promise<LocalApiMonobankTokenStatus> {
  return requestJson<LocalApiMonobankTokenStatus>("/api/app/token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ profile, token }),
  });
}

export async function clearMonobankToken(): Promise<LocalApiMonobankTokenStatus> {
  return requestJson<LocalApiMonobankTokenStatus>("/api/app/token", {
    method: "DELETE",
  });
}

export type RecheckMonobankConnectionResult =
  | LocalApiMonobankTokenStatus
  | {
      error: string;
      message?: string;
      upstreamStatus?: number;
    };

export async function recheckMonobankConnection(): Promise<RecheckMonobankConnectionResult> {
  return requestJson<RecheckMonobankConnectionResult>(
    "/api/app/token/recheck",
    {
      method: "POST",
    },
  );
}

export async function initializeWorkspace(): Promise<
  LocalAppSnapshot["config"]
> {
  return requestJson<LocalAppSnapshot["config"]>("/api/app/workspace", {
    method: "POST",
  });
}

export async function setMonobankSource(
  source: LocalAppSnapshot["config"]["source"],
): Promise<LocalAppSnapshot["config"]> {
  return requestJson<LocalAppSnapshot["config"]>("/api/app/source", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ source }),
  });
}
