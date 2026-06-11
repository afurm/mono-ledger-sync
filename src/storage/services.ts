import type {
  AccountBalance,
  Budget,
  BudgetProgress,
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
  LedgerEntryPage,
  LedgerEntryQuery,
  LedgerEntrySplitPlanUpdate,
  LedgerCategorySpending,
  LedgerJar,
  Category,
  CategoryRule,
  LedgerSummary,
  MerchantCleanupRule,
  MissedRecurringPayment,
  MonthlySpendingCategory,
  MonthlySpendingCurrencyTotal,
  MonthlySpendingMerchant,
  MonthlySpendingReport,
  NetWorthTrend,
  RecurringCalendarEvent,
  RecurringDetectionCandidate,
  RecurringDetectionDecisionResult,
  RecurringItem,
  ReportCurrencyConversionRate,
  SavingsGoalProgress,
  StoredWebhookEvent,
  SubscriptionIncreaseAlert,
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
  getNetWorthTrend(profile?: string): Promise<NetWorthTrend>;
  getAccountBalances(profile?: string): Promise<readonly AccountBalance[]>;
  listAccounts(profile?: string): Promise<readonly LedgerAccount[]>;
  listJars(profile?: string): Promise<readonly LedgerJar[]>;
  listSavingsGoalProgress(
    profile?: string,
  ): Promise<readonly SavingsGoalProgress[]>;
}

export interface LedgerCategoryQueryService {
  listCategories(profile?: string): Promise<readonly Category[]>;
  listCategoryRules(profile?: string): Promise<readonly CategoryRule[]>;
  listMerchantCleanupRules(
    profile?: string,
  ): Promise<readonly MerchantCleanupRule[]>;
  listCategorySpending(
    profile?: string,
  ): Promise<readonly LedgerCategorySpending[]>;
}

export interface LedgerBudgetQueryService {
  listBudgets(profile?: string): Promise<readonly Budget[]>;
  listBudgetPeriods(profile?: string): Promise<readonly BudgetPeriod[]>;
  listBudgetProgress(profile?: string): Promise<readonly BudgetProgress[]>;
}

export interface LedgerReportQueryService {
  getCashflowReport(profile?: string, months?: number): Promise<CashflowReport>;
  getSavingsRateReport(
    profile?: string,
    months?: number,
  ): Promise<SavingsRateReport>;
  getBalanceProjectionReport(
    profile?: string,
    days?: number,
    asOf?: Date,
  ): Promise<BalanceProjectionReport>;
  getCategoryTrendReport(
    profile?: string,
    months?: number,
  ): Promise<CategoryTrendReport>;
  getMerchantTrendReport(
    profile?: string,
    months?: number,
  ): Promise<MerchantTrendReport>;
  getMonthlySpendingReport(
    profile?: string,
    month?: string,
  ): Promise<MonthlySpendingReport>;
}

export interface LedgerRecurringItemQueryService {
  listRecurringItems(profile?: string): Promise<readonly RecurringItem[]>;
  detectRecurringTransactions(
    profile?: string,
  ): Promise<readonly RecurringDetectionCandidate[]>;
  listMissedRecurringPayments(
    profile?: string,
    asOf?: Date,
  ): Promise<readonly MissedRecurringPayment[]>;
  listSubscriptionIncreaseAlerts(
    profile?: string,
    asOf?: Date,
  ): Promise<readonly SubscriptionIncreaseAlert[]>;
  listRecurringCalendar(
    profile?: string,
    from?: Date,
    to?: Date,
  ): Promise<readonly RecurringCalendarEvent[]>;
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
  reports: LedgerReportQueryService;
  recurringItems: LedgerRecurringItemQueryService;
  syncState: LedgerSyncStateQueryService;
}

export interface LedgerQueryService
  extends
    LedgerTransactionQueryService,
    LedgerBalanceQueryService,
    LedgerCategoryQueryService,
    LedgerBudgetQueryService,
    LedgerReportQueryService,
    LedgerRecurringItemQueryService,
    LedgerSyncStateQueryService {}

export interface LedgerWriteService {
  confirmRecurringDetection(
    candidateId: string,
    profile?: string,
  ): Promise<RecurringDetectionDecisionResult>;
  ignoreRecurringDetection(
    candidateId: string,
    profile?: string,
  ): Promise<RecurringDetectionDecisionResult>;
  createMonthlyCategoryBudget(
    input: MonthlyCategoryBudgetInput,
    profile?: string,
  ): Promise<BudgetProgress>;
  deleteMonthlyCategoryBudget(
    budgetPeriodId: string,
    profile?: string,
  ): Promise<boolean>;
  closeMonthlyBudgetPeriod(
    budgetPeriodId: string,
    profile?: string,
  ): Promise<BudgetProgress | undefined>;
  reopenMonthlyBudgetPeriod(
    budgetPeriodId: string,
    profile?: string,
  ): Promise<BudgetProgress | undefined>;
  updateTransactionsBulk(
    ids: readonly string[],
    update: LedgerEntryBulkEditUpdate,
    profile?: string,
  ): Promise<readonly LedgerEntry[]>;
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

export interface MonthlyCategoryBudgetInput {
  categoryId: string;
  currencyCode: number;
  month: string;
  amountLimit: number;
  rollover?: boolean;
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
const MISSED_RECURRING_PAYMENT_PAGE_SIZE = 100;
const SUBSCRIPTION_INCREASE_LOOKBACK_DAYS = 370;
const SUBSCRIPTION_INCREASE_PAGE_SIZE = 100;
const RECURRING_DETECTION_PAGE_SIZE = 500;
const RECURRING_DETECTION_ENTRY_LIMIT = 2_000;
const RECURRING_CALENDAR_DEFAULT_DAYS = 90;
const RECURRING_CALENDAR_MAX_DAYS = 370;
const BUDGET_ACTUAL_TRANSACTION_PAGE_SIZE = 500;
const MONTHLY_SPENDING_TRANSACTION_PAGE_SIZE = 500;
const CASHFLOW_REPORT_TRANSACTION_PAGE_SIZE = 500;
const DEFAULT_CASHFLOW_REPORT_MONTHS = 6;
const MAX_CASHFLOW_REPORT_MONTHS = 24;
const DEFAULT_BALANCE_PROJECTION_DAYS = 30;
const MAX_BALANCE_PROJECTION_DAYS = 180;
const REPORT_BASE_CURRENCY_CODE = 980;
const TRANSFER_CATEGORY_ID = "transfers";
const TRANSFER_DESCRIPTION_TERMS = [
  "transfer",
  "transfers",
  "переклад",
  "переказ",
];

function findPreviousRolloverBudgetPeriod(
  budgets: readonly Budget[],
  periods: readonly BudgetPeriod[],
  categoryId: string,
  currencyCode: number,
  periodStart: string,
): { budget: Budget; period: BudgetPeriod } | undefined {
  const budgetsById = new Map<string, Budget>(
    budgets.map((budget) => [budget.id, budget]),
  );
  let bestPeriod: BudgetPeriod | undefined;

  for (const period of periods) {
    const budget = budgetsById.get(period.budgetId);

    if (budget === undefined) {
      continue;
    }

    if (!budget.rollover) {
      continue;
    }

    if (
      budget.categoryId !== categoryId ||
      budget.currencyCode !== currencyCode
    ) {
      continue;
    }

    if (period.periodStart >= periodStart) {
      continue;
    }

    if (
      bestPeriod === undefined ||
      period.periodStart > bestPeriod.periodStart ||
      (period.periodStart === bestPeriod.periodStart &&
        period.updatedAt > bestPeriod.updatedAt)
    ) {
      bestPeriod = period;
    }
  }

  if (bestPeriod === undefined) {
    return undefined;
  }

  const budget = budgetsById.get(bestPeriod.budgetId);

  if (budget === undefined) {
    return undefined;
  }

  return { budget, period: bestPeriod };
}

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

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);

  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function startOfUtcDateEpoch(value: Date): number {
  return Math.floor(startOfUtcDate(value).getTime() / 1000);
}

function endOfUtcDateEpoch(value: Date): number {
  return Math.floor(
    (addUtcDays(startOfUtcDate(value), 1).getTime() - 1) / 1000,
  );
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

function resolvePreviousRecurringDate(
  item: RecurringItem,
  asOf: Date,
): Date | undefined {
  const anchor = item.lastSeenAt ?? item.startedAt ?? item.createdAt;
  const parsedAnchor = Date.parse(anchor);

  if (!Number.isFinite(parsedAnchor)) {
    return undefined;
  }

  let previousDueAt = startOfUtcDate(new Date(parsedAnchor));
  const asOfDate = startOfUtcDate(asOf);

  if (previousDueAt >= asOfDate) {
    return undefined;
  }

  if (item.frequency === "irregular") {
    return previousDueAt;
  }

  while (true) {
    const nextDueAt = addRecurringFrequency(previousDueAt, item.frequency);

    if (
      nextDueAt.getTime() === previousDueAt.getTime() ||
      nextDueAt >= asOfDate
    ) {
      return previousDueAt;
    }

    previousDueAt = nextDueAt;
  }
}

function daysBetweenUtcDates(left: Date, right: Date): number {
  const millisecondsPerDay = 86_400_000;

  return Math.round(
    (startOfUtcDate(left).getTime() - startOfUtcDate(right).getTime()) /
      millisecondsPerDay,
  );
}

function ledgerEntryDate(entry: LedgerEntry): Date {
  return startOfUtcDate(new Date(entry.time * 1000));
}

function normalizeRecurringMerchantLabel(
  entry: LedgerEntry,
): string | undefined {
  const label = (entry.merchantName ?? entry.description).trim();

  if (!label) {
    return undefined;
  }

  return label;
}

function normalizeRecurringGroupLabel(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function recurringCandidateId(
  accountId: string,
  currencyCode: number,
  merchantName: string,
  frequency: RecurringDetectionCandidate["frequency"],
): string {
  const label = normalizeRecurringGroupLabel(merchantName)
    .replace(/[^a-z0-9а-яіїєґ-]+/giu, "-")
    .replace(/^-+|-+$/g, "");

  return `detected-${frequency}-${accountId}-${currencyCode}-${label || "merchant"}`;
}

function average(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function scoreCadence(
  gaps: readonly number[],
  expectedGapDays: number,
  toleranceDays: number,
): number {
  const averageDeviation =
    average(gaps.map((gap) => Math.abs(gap - expectedGapDays))) ?? 0;
  const rawScore = 1 - averageDeviation / Math.max(1, toleranceDays * 2);

  return roundToTwoDecimals(Math.max(0.65, Math.min(0.98, rawScore)));
}

function classifyRecurringFrequency(
  gaps: readonly number[],
): Pick<RecurringDetectionCandidate, "frequency" | "confidence"> | undefined {
  if (gaps.length === 0) {
    return undefined;
  }

  if (gaps.every((gap) => gap >= 5 && gap <= 9)) {
    return {
      frequency: "weekly",
      confidence: scoreCadence(gaps, 7, 2),
    };
  }

  if (gaps.every((gap) => gap >= 26 && gap <= 35)) {
    return {
      frequency: "monthly",
      confidence: scoreCadence(gaps, 30, 5),
    };
  }

  if (gaps.every((gap) => gap >= 355 && gap <= 375)) {
    return {
      frequency: "yearly",
      confidence: scoreCadence(gaps, 365, 15),
    };
  }

  if (gaps.length >= 2) {
    return {
      frequency: "irregular",
      confidence: 0.55,
    };
  }

  return undefined;
}

function minimumOccurrencesForFrequency(
  frequency: RecurringDetectionCandidate["frequency"],
): number {
  return frequency === "yearly" ? 2 : 3;
}

function hasStableRecurringAmount(
  amounts: readonly number[],
  frequency: RecurringDetectionCandidate["frequency"],
): boolean {
  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);
  const varianceRatio = (maxAmount - minAmount) / Math.max(1, maxAmount);
  const maxVariance = frequency === "irregular" ? 0.5 : 0.25;

  return varianceRatio <= maxVariance;
}

function buildRecurringDetectionCandidate(
  profile: string,
  entries: readonly LedgerEntry[],
): RecurringDetectionCandidate | undefined {
  const sortedEntries = [...entries].sort(
    (left, right) => left.time - right.time,
  );
  const firstEntry = sortedEntries[0];
  const latestEntry = sortedEntries.at(-1);

  if (firstEntry === undefined || latestEntry === undefined) {
    return undefined;
  }

  const gaps = sortedEntries.slice(1).map((entry, index) => {
    const previous = sortedEntries[index];

    return previous === undefined
      ? 0
      : daysBetweenUtcDates(ledgerEntryDate(entry), ledgerEntryDate(previous));
  });
  const classification = classifyRecurringFrequency(gaps);

  if (
    classification === undefined ||
    sortedEntries.length <
      minimumOccurrencesForFrequency(classification.frequency)
  ) {
    return undefined;
  }

  const amounts = sortedEntries.map((entry) => Math.abs(entry.amount));

  if (!hasStableRecurringAmount(amounts, classification.frequency)) {
    return undefined;
  }

  const merchantName = normalizeRecurringMerchantLabel(firstEntry);

  if (merchantName === undefined) {
    return undefined;
  }

  const averageGapDays = average(gaps);
  const expectedAmountMin = Math.min(...amounts);
  const expectedAmountMax = Math.max(...amounts);

  return {
    id: recurringCandidateId(
      firstEntry.accountId,
      firstEntry.currencyCode,
      merchantName,
      classification.frequency,
    ),
    profile,
    accountId: firstEntry.accountId,
    ...(firstEntry.categoryId === undefined
      ? {}
      : { categoryId: firstEntry.categoryId }),
    merchantName,
    frequency: classification.frequency,
    expectedAmountMin,
    expectedAmountMax,
    currencyCode: firstEntry.currencyCode,
    occurrences: sortedEntries.length,
    confidence: classification.confidence,
    firstSeenAt: new Date(firstEntry.time * 1000).toISOString(),
    lastSeenAt: new Date(latestEntry.time * 1000).toISOString(),
    ...(averageGapDays === undefined
      ? {}
      : { averageGapDays: roundToTwoDecimals(averageGapDays) }),
    latestLedgerEntryId: latestEntry.id,
  };
}

async function listLedgerEntriesForRecurringDetection(
  db: SqliteLedgerDb,
  profile: string,
): Promise<readonly LedgerEntry[]> {
  const entries: LedgerEntry[] = [];
  let offset = 0;

  while (entries.length < RECURRING_DETECTION_ENTRY_LIMIT) {
    const page = await db.listLedgerEntries({
      profile,
      status: "posted",
      sortBy: "time",
      sortDirection: "asc",
      limit: RECURRING_DETECTION_PAGE_SIZE,
      offset,
    });

    entries.push(...page.entries);

    if (
      page.entries.length === 0 ||
      entries.length >= page.total ||
      entries.length >= RECURRING_DETECTION_ENTRY_LIMIT
    ) {
      break;
    }

    offset += page.entries.length;
  }

  return entries;
}

async function detectRecurringTransactionsFromLedger(
  db: SqliteLedgerDb,
  profile: string,
): Promise<readonly RecurringDetectionCandidate[]> {
  const groups = new Map<string, LedgerEntry[]>();
  const [entries, decisions] = await Promise.all([
    listLedgerEntriesForRecurringDetection(db, profile),
    db.listRecurringDetectionDecisions(profile),
  ]);
  const decidedCandidateIds = new Set(
    decisions.map((decision) => decision.candidateId),
  );

  for (const entry of entries) {
    if (
      entry.amount >= 0 ||
      entry.hold === true ||
      entry.categoryId === TRANSFER_CATEGORY_ID
    ) {
      continue;
    }

    const merchantName = normalizeRecurringMerchantLabel(entry);

    if (merchantName === undefined) {
      continue;
    }

    const groupKey = [
      entry.accountId,
      entry.currencyCode,
      entry.categoryId ?? "",
      normalizeRecurringGroupLabel(merchantName),
    ].join("|");
    const group = groups.get(groupKey) ?? [];

    group.push(entry);
    groups.set(groupKey, group);
  }

  return [...groups.values()]
    .map((group) => buildRecurringDetectionCandidate(profile, group))
    .filter((candidate): candidate is RecurringDetectionCandidate => {
      return candidate !== undefined;
    })
    .filter((candidate) => !decidedCandidateIds.has(candidate.id))
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      const lastSeenDiff =
        Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt);

      if (lastSeenDiff !== 0) {
        return lastSeenDiff;
      }

      return left.merchantName.localeCompare(right.merchantName);
    });
}

function readBudgetMonth(month: string): {
  month: string;
  periodStart: string;
  periodEnd: string;
} {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());

  if (!match) {
    throw new Error("Budget month must use YYYY-MM format.");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  if (monthIndex < 0 || monthIndex > 11) {
    throw new Error("Budget month must use a valid month.");
  }

  const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  return {
    month: month.trim(),
    periodStart: localDateKey(monthStart),
    periodEnd: localDateKey(monthEnd),
  };
}

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function localMonthKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function localMonthStart(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0);
}

function readReportMonth(month: string): {
  month: string;
  periodStart: string;
  periodEnd: string;
} {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());

  if (!match) {
    throw new Error("Report month must use YYYY-MM format.");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  if (monthIndex < 0 || monthIndex > 11) {
    throw new Error("Report month must use a valid month.");
  }

  const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  return {
    month: month.trim(),
    periodStart: localDateKey(monthStart),
    periodEnd: localDateKey(monthEnd),
  };
}

function readCashflowReportMonths(months: number | undefined): number {
  if (months === undefined) {
    return DEFAULT_CASHFLOW_REPORT_MONTHS;
  }

  if (!Number.isFinite(months)) {
    throw new Error("Cashflow report months must be a finite number.");
  }

  const normalizedMonths = Math.trunc(months);

  if (normalizedMonths < 1 || normalizedMonths > MAX_CASHFLOW_REPORT_MONTHS) {
    throw new Error("Cashflow report months must be between 1 and 24.");
  }

  return normalizedMonths;
}

function readSavingsRateReportMonths(months: number | undefined): number {
  if (months === undefined) {
    return DEFAULT_CASHFLOW_REPORT_MONTHS;
  }

  if (!Number.isFinite(months)) {
    throw new Error("Savings rate report months must be a finite number.");
  }

  const normalizedMonths = Math.trunc(months);

  if (normalizedMonths < 1 || normalizedMonths > MAX_CASHFLOW_REPORT_MONTHS) {
    throw new Error("Savings rate report months must be between 1 and 24.");
  }

  return normalizedMonths;
}

function readBalanceProjectionDays(days: number | undefined): number {
  if (days === undefined) {
    return DEFAULT_BALANCE_PROJECTION_DAYS;
  }

  if (!Number.isFinite(days)) {
    throw new Error("Balance projection days must be a finite number.");
  }

  const normalizedDays = Math.trunc(days);

  if (normalizedDays < 1 || normalizedDays > MAX_BALANCE_PROJECTION_DAYS) {
    throw new Error("Balance projection days must be between 1 and 180.");
  }

  return normalizedDays;
}

function readCategoryTrendReportMonths(months: number | undefined): number {
  if (months === undefined) {
    return DEFAULT_CASHFLOW_REPORT_MONTHS;
  }

  if (!Number.isFinite(months)) {
    throw new Error("Category trend report months must be a finite number.");
  }

  const normalizedMonths = Math.trunc(months);

  if (normalizedMonths < 1 || normalizedMonths > MAX_CASHFLOW_REPORT_MONTHS) {
    throw new Error("Category trend report months must be between 1 and 24.");
  }

  return normalizedMonths;
}

function readMerchantTrendReportMonths(months: number | undefined): number {
  if (months === undefined) {
    return DEFAULT_CASHFLOW_REPORT_MONTHS;
  }

  if (!Number.isFinite(months)) {
    throw new Error("Merchant trend report months must be a finite number.");
  }

  const normalizedMonths = Math.trunc(months);

  if (normalizedMonths < 1 || normalizedMonths > MAX_CASHFLOW_REPORT_MONTHS) {
    throw new Error("Merchant trend report months must be between 1 and 24.");
  }

  return normalizedMonths;
}

function isTransferLikeEntry(entry: LedgerEntry): boolean {
  if (entry.categoryId === TRANSFER_CATEGORY_ID) {
    return true;
  }

  const normalizedDescription = entry.description
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const tokens =
    normalizedDescription.length === 0
      ? []
      : normalizedDescription.split(/\s+/u);

  return TRANSFER_DESCRIPTION_TERMS.includes(
    entry.description.toLowerCase().trim(),
  )
    ? true
    : tokens.some((token) => TRANSFER_DESCRIPTION_TERMS.includes(token));
}

function listSavingsGoalProgressFromJars(
  jars: readonly LedgerJar[],
): readonly SavingsGoalProgress[] {
  return jars
    .filter((jar) => jar.goal > 0)
    .map((jar): SavingsGoalProgress => {
      const remainingAmount = Math.max(0, jar.goal - jar.balance);
      const progressPercentage = Math.min(
        100,
        Math.max(0, Math.round((jar.balance / jar.goal) * 100)),
      );
      const status =
        jar.balance <= 0
          ? "not_started"
          : jar.balance >= jar.goal
            ? "completed"
            : "in_progress";

      return {
        id: `jar:${jar.id}`,
        source: "jar",
        sourceId: jar.id,
        title: jar.title,
        description: jar.description,
        currencyCode: jar.currencyCode,
        currentAmount: jar.balance,
        targetAmount: jar.goal,
        remainingAmount,
        progressPercentage,
        status,
        updatedAt: jar.updatedAt,
      };
    });
}

function endOfLocalDateEpoch(dateKey: string): number {
  const epoch = Date.parse(`${dateKey}T23:59:59.999`);

  return Math.floor(epoch / 1000);
}

function startOfLocalDateEpoch(dateKey: string): number {
  const epoch = Date.parse(`${dateKey}T00:00:00.000`);

  return Math.floor(epoch / 1000);
}

function averageMinorAmount(amount: number, transactionCount: number): number {
  return transactionCount > 0 ? Math.round(amount / transactionCount) : 0;
}

function sharePercentage(amount: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((amount / total) * 10_000) / 100;
}

function savingsRatePercentage(income: number, savings: number): number {
  if (income <= 0) {
    return 0;
  }

  return Math.round((savings / income) * 10_000) / 100;
}

const CONVERTIBLE_REPORT_TOTAL_FIELDS = [
  "totalIncome",
  "totalExpenses",
  "netCashflow",
  "totalSavings",
  "totalCurrentBalance",
  "totalProjectedOutflows",
  "totalProjectedBalance",
] as const;

type ConvertibleReportTotalField =
  (typeof CONVERTIBLE_REPORT_TOTAL_FIELDS)[number];

type ConvertibleReportTotalInput = {
  currencyCode: number;
} & Partial<Record<ConvertibleReportTotalField, number>>;

function conversionRateValue(
  rate: Pick<ReportCurrencyConversionRate, "rate">,
): number | undefined {
  return Number.isFinite(rate.rate) && rate.rate > 0 ? rate.rate : undefined;
}

function cachedRateValue(rate: {
  rateSell?: number;
  rateCross?: number;
  rateBuy?: number;
}): number | undefined {
  const value = rate.rateSell ?? rate.rateCross ?? rate.rateBuy;

  return value === undefined || !Number.isFinite(value) || value <= 0
    ? undefined
    : value;
}

function latestCurrencyConversionRates(
  rates: readonly {
    currencyCodeA: number;
    currencyCodeB: number;
    date: number;
    rateBuy?: number;
    rateSell?: number;
    rateCross?: number;
  }[],
): Map<number, ReportCurrencyConversionRate> {
  const latest = new Map<number, ReportCurrencyConversionRate>();

  for (const rate of rates) {
    if (rate.currencyCodeA === REPORT_BASE_CURRENCY_CODE) {
      continue;
    }

    if (rate.currencyCodeB !== REPORT_BASE_CURRENCY_CODE) {
      continue;
    }

    const value = cachedRateValue(rate);

    if (value === undefined) {
      continue;
    }

    const existing = latest.get(rate.currencyCodeA);

    if (existing !== undefined && existing.date >= rate.date) {
      continue;
    }

    latest.set(rate.currencyCodeA, {
      currencyCode: rate.currencyCodeA,
      baseCurrencyCode: REPORT_BASE_CURRENCY_CODE,
      rate: value,
      date: rate.date,
    });
  }

  return latest;
}

async function buildConvertedReportTotals(
  db: SqliteLedgerDb,
  profile: string,
  totals: readonly ConvertibleReportTotalInput[],
): Promise<ConvertedReportTotals | undefined> {
  if (
    totals.every((total) => total.currencyCode === REPORT_BASE_CURRENCY_CODE)
  ) {
    return undefined;
  }

  const cachedRates = await db.listCurrencyRates(profile);
  const ratesByCurrency = latestCurrencyConversionRates(cachedRates);
  const missingCurrencyCodes = new Set<number>();
  const usedRates = new Map<number, ReportCurrencyConversionRate>();
  const converted: Partial<Record<ConvertibleReportTotalField, number>> = {};

  for (const total of totals) {
    const conversionRate =
      total.currencyCode === REPORT_BASE_CURRENCY_CODE
        ? {
            currencyCode: REPORT_BASE_CURRENCY_CODE,
            baseCurrencyCode: REPORT_BASE_CURRENCY_CODE,
            rate: 1,
            date: 0,
          }
        : ratesByCurrency.get(total.currencyCode);

    if (conversionRate === undefined) {
      missingCurrencyCodes.add(total.currencyCode);
      continue;
    }

    const rateValue = conversionRateValue(conversionRate);

    if (rateValue === undefined) {
      missingCurrencyCodes.add(total.currencyCode);
      continue;
    }

    if (total.currencyCode !== REPORT_BASE_CURRENCY_CODE) {
      usedRates.set(total.currencyCode, conversionRate);
    }

    for (const field of CONVERTIBLE_REPORT_TOTAL_FIELDS) {
      const value = total[field];

      if (value === undefined) {
        continue;
      }

      converted[field] =
        (converted[field] ?? 0) + Math.round(value * rateValue);
    }
  }

  if (Object.keys(converted).length === 0) {
    return undefined;
  }

  return {
    baseCurrencyCode: REPORT_BASE_CURRENCY_CODE,
    ...converted,
    missingCurrencyCodes: [...missingCurrencyCodes].sort((left, right) => {
      return left - right;
    }),
    rates: [...usedRates.values()].sort((left, right) => {
      return left.currencyCode - right.currencyCode;
    }),
  };
}

async function resolveTrailingMonthReportPeriod(
  db: SqliteLedgerDb,
  profile: string,
  months: number,
): Promise<{
  from: string;
  to: string;
}> {
  const latest = await db.listLedgerEntries({
    profile,
    limit: 1,
    sortBy: "time",
    sortDirection: "desc",
  });
  const anchor = latest.entries[0];
  const anchorMonthStart = localMonthStart(
    anchor ? new Date(anchor.time * 1000) : new Date(),
  );
  const fromDate = new Date(
    anchorMonthStart.getFullYear(),
    anchorMonthStart.getMonth() - months + 1,
    1,
    0,
    0,
    0,
    0,
  );
  const toDate = new Date(
    anchorMonthStart.getFullYear(),
    anchorMonthStart.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  return {
    from: localDateKey(fromDate),
    to: localDateKey(toDate),
  };
}

function applyCashflowAmount(
  target: {
    income: number;
    expenses: number;
    net: number;
    transactionCount: number;
  },
  amount: number,
): void {
  if (amount > 0) {
    target.income += amount;
  } else if (amount < 0) {
    target.expenses += Math.abs(amount);
  }

  target.net += amount;
  target.transactionCount += 1;
}

async function buildCashflowReport(
  db: SqliteLedgerDb,
  profile: string,
  monthsInput: number | undefined,
): Promise<CashflowReport> {
  const months = readCashflowReportMonths(monthsInput);
  const period = await resolveTrailingMonthReportPeriod(db, profile, months);
  const from = startOfLocalDateEpoch(period.from);
  const to = endOfLocalDateEpoch(period.to);
  const totals = new Map<number, CashflowReportCurrencyTotal>();
  const points = new Map<string, CashflowReportPoint>();
  let offset = 0;
  let totalIncome = 0;
  let totalExpenses = 0;
  let netCashflow = 0;
  let transactionCount = 0;

  while (true) {
    const page = await db.listLedgerEntries({
      profile,
      from,
      to,
      limit: CASHFLOW_REPORT_TRANSACTION_PAGE_SIZE,
      offset,
      sortBy: "time",
      sortDirection: "asc",
    });

    if (page.entries.length === 0) {
      break;
    }

    for (const entry of page.entries) {
      const month = localMonthKey(new Date(entry.time * 1000));
      const monthPeriod = readReportMonth(month);
      const pointKey = `${month}:${entry.currencyCode}`;
      const point = points.get(pointKey) ?? {
        month,
        from: monthPeriod.periodStart,
        to: monthPeriod.periodEnd,
        currencyCode: entry.currencyCode,
        income: 0,
        expenses: 0,
        net: 0,
        transactionCount: 0,
      };
      const currencyTotal = totals.get(entry.currencyCode) ?? {
        currencyCode: entry.currencyCode,
        income: 0,
        expenses: 0,
        net: 0,
        transactionCount: 0,
      };

      if (entry.amount > 0) {
        totalIncome += entry.amount;
      } else if (entry.amount < 0) {
        totalExpenses += Math.abs(entry.amount);
      }

      netCashflow += entry.amount;
      transactionCount += 1;
      applyCashflowAmount(point, entry.amount);
      applyCashflowAmount(currencyTotal, entry.amount);
      points.set(pointKey, point);
      totals.set(entry.currencyCode, currencyTotal);
    }

    offset += page.entries.length;

    if (offset >= page.total) {
      break;
    }
  }

  const sortedTotals = [...totals.values()].sort((left, right) => {
    const leftActivity = left.income + left.expenses;
    const rightActivity = right.income + right.expenses;

    if (rightActivity !== leftActivity) {
      return rightActivity - leftActivity;
    }

    return left.currencyCode - right.currencyCode;
  });
  const sortedPoints = [...points.values()].sort((left, right) => {
    const monthDiff = left.month.localeCompare(right.month);

    if (monthDiff !== 0) {
      return monthDiff;
    }

    return left.currencyCode - right.currencyCode;
  });
  const convertedTotals = await buildConvertedReportTotals(
    db,
    profile,
    sortedTotals.map((row) => {
      return {
        currencyCode: row.currencyCode,
        totalIncome: row.income,
        totalExpenses: row.expenses,
        netCashflow: row.net,
      };
    }),
  );

  return {
    profile,
    from: period.from,
    to: period.to,
    months,
    generatedAt: new Date().toISOString(),
    totalIncome,
    totalExpenses,
    netCashflow,
    transactionCount,
    currencies: sortedTotals.map((row) => row.currencyCode),
    totals: sortedTotals,
    points: sortedPoints,
    ...(convertedTotals === undefined ? {} : { convertedTotals }),
  };
}

function applySavingsRateAmount(
  target: {
    income: number;
    expenses: number;
    savings: number;
    transactionCount: number;
  },
  amount: number,
): void {
  if (amount > 0) {
    target.income += amount;
  } else if (amount < 0) {
    target.expenses += Math.abs(amount);
  }

  target.savings += amount;
  target.transactionCount += 1;
}

async function buildSavingsRateReport(
  db: SqliteLedgerDb,
  profile: string,
  monthsInput: number | undefined,
): Promise<SavingsRateReport> {
  const months = readSavingsRateReportMonths(monthsInput);
  const period = await resolveTrailingMonthReportPeriod(db, profile, months);
  const from = startOfLocalDateEpoch(period.from);
  const to = endOfLocalDateEpoch(period.to);
  const totals = new Map<number, SavingsRateReportCurrencyTotal>();
  const points = new Map<string, SavingsRateReportPoint>();
  let offset = 0;
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalSavings = 0;
  let transactionCount = 0;

  while (true) {
    const page = await db.listLedgerEntries({
      profile,
      from,
      to,
      limit: CASHFLOW_REPORT_TRANSACTION_PAGE_SIZE,
      offset,
      sortBy: "time",
      sortDirection: "asc",
    });

    if (page.entries.length === 0) {
      break;
    }

    for (const entry of page.entries) {
      const month = localMonthKey(new Date(entry.time * 1000));
      const monthPeriod = readReportMonth(month);
      const pointKey = `${month}:${entry.currencyCode}`;
      const point = points.get(pointKey) ?? {
        month,
        from: monthPeriod.periodStart,
        to: monthPeriod.periodEnd,
        currencyCode: entry.currencyCode,
        income: 0,
        expenses: 0,
        savings: 0,
        savingsRate: 0,
        transactionCount: 0,
      };
      const currencyTotal = totals.get(entry.currencyCode) ?? {
        currencyCode: entry.currencyCode,
        income: 0,
        expenses: 0,
        savings: 0,
        savingsRate: 0,
        transactionCount: 0,
        averageMonthlySavings: 0,
      };

      if (entry.amount > 0) {
        totalIncome += entry.amount;
      } else if (entry.amount < 0) {
        totalExpenses += Math.abs(entry.amount);
      }

      totalSavings += entry.amount;
      transactionCount += 1;
      applySavingsRateAmount(point, entry.amount);
      applySavingsRateAmount(currencyTotal, entry.amount);
      points.set(pointKey, point);
      totals.set(entry.currencyCode, currencyTotal);
    }

    offset += page.entries.length;

    if (offset >= page.total) {
      break;
    }
  }

  const sortedTotals = [...totals.values()]
    .map((row): SavingsRateReportCurrencyTotal => {
      return {
        ...row,
        savingsRate: savingsRatePercentage(row.income, row.savings),
        averageMonthlySavings: averageMinorAmount(row.savings, months),
      };
    })
    .sort((left, right) => {
      const leftActivity = left.income + left.expenses;
      const rightActivity = right.income + right.expenses;

      if (rightActivity !== leftActivity) {
        return rightActivity - leftActivity;
      }

      return left.currencyCode - right.currencyCode;
    });
  const sortedPoints = [...points.values()]
    .map((row): SavingsRateReportPoint => {
      return {
        ...row,
        savingsRate: savingsRatePercentage(row.income, row.savings),
      };
    })
    .sort((left, right) => {
      const monthDiff = left.month.localeCompare(right.month);

      if (monthDiff !== 0) {
        return monthDiff;
      }

      return left.currencyCode - right.currencyCode;
    });
  const convertedTotals = await buildConvertedReportTotals(
    db,
    profile,
    sortedTotals.map((row) => {
      return {
        currencyCode: row.currencyCode,
        totalIncome: row.income,
        totalExpenses: row.expenses,
        totalSavings: row.savings,
      };
    }),
  );

  return {
    profile,
    from: period.from,
    to: period.to,
    months,
    generatedAt: new Date().toISOString(),
    totalIncome,
    totalExpenses,
    totalSavings,
    savingsRate: savingsRatePercentage(totalIncome, totalSavings),
    transactionCount,
    currencies: sortedTotals.map((row) => row.currencyCode),
    totals: sortedTotals,
    points: sortedPoints,
    ...(convertedTotals === undefined ? {} : { convertedTotals }),
  };
}

function projectedRecurringEventAmount(event: RecurringCalendarEvent): number {
  const amount = event.expectedAmountMax ?? event.expectedAmountMin ?? 0;

  return Math.max(0, amount);
}

async function buildBalanceProjectionReport(
  db: SqliteLedgerDb,
  profile: string,
  daysInput: number | undefined,
  asOf?: Date,
): Promise<BalanceProjectionReport> {
  const days = readBalanceProjectionDays(daysInput);
  const fromDate = startOfUtcDate(asOf ?? new Date());
  const toDate = addUtcDays(fromDate, days);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);
  const [balances, calendarEvents] = await Promise.all([
    db.getAccountBalances(profile),
    listRecurringCalendar(db, profile, fromDate, toDate),
  ]);
  const totals = new Map<number, BalanceProjectionCurrencyTotal>();
  const pointBuckets = new Map<
    string,
    {
      date: string;
      currencyCode: number;
      projectedOutflows: number;
      eventCount: number;
    }
  >();
  const events: BalanceProjectionEvent[] = [];

  function ensureTotal(currencyCode: number): BalanceProjectionCurrencyTotal {
    const existing = totals.get(currencyCode);

    if (existing) {
      return existing;
    }

    const created = {
      currencyCode,
      currentBalance: 0,
      projectedOutflows: 0,
      projectedBalance: 0,
      eventCount: 0,
    };

    totals.set(currencyCode, created);

    return created;
  }

  function ensurePointBucket(
    date: string,
    currencyCode: number,
  ): {
    date: string;
    currencyCode: number;
    projectedOutflows: number;
    eventCount: number;
  } {
    const key = `${date}:${currencyCode}`;
    const existing = pointBuckets.get(key);

    if (existing) {
      return existing;
    }

    const created = {
      date,
      currencyCode,
      projectedOutflows: 0,
      eventCount: 0,
    };

    pointBuckets.set(key, created);

    return created;
  }

  for (const balance of balances) {
    const total = ensureTotal(balance.currencyCode);

    total.currentBalance += balance.balance;
    total.projectedBalance = total.currentBalance;
    ensurePointBucket(from, balance.currencyCode);
  }

  for (const event of calendarEvents) {
    const projectedAmount = projectedRecurringEventAmount(event);

    if (projectedAmount <= 0) {
      continue;
    }

    const total = ensureTotal(event.currencyCode);
    const point = ensurePointBucket(event.date, event.currencyCode);

    total.projectedOutflows += projectedAmount;
    total.projectedBalance = total.currentBalance - total.projectedOutflows;
    total.eventCount += 1;
    point.projectedOutflows += projectedAmount;
    point.eventCount += 1;
    events.push({
      id: event.id,
      recurringItemId: event.recurringItemId,
      accountId: event.accountId,
      ...(event.categoryId === undefined
        ? {}
        : { categoryId: event.categoryId }),
      ...(event.merchantName === undefined
        ? {}
        : { merchantName: event.merchantName }),
      frequency: event.frequency,
      currencyCode: event.currencyCode,
      date: event.date,
      dueAt: event.dueAt,
      projectedAmount,
    });
  }

  const sortedTotals = [...totals.values()].sort((left, right) => {
    const leftActivity = Math.abs(left.currentBalance) + left.projectedOutflows;
    const rightActivity =
      Math.abs(right.currentBalance) + right.projectedOutflows;

    if (rightActivity !== leftActivity) {
      return rightActivity - leftActivity;
    }

    return left.currencyCode - right.currencyCode;
  });
  const pointsByCurrency = new Map<number, BalanceProjectionPoint[]>();

  for (const total of sortedTotals) {
    let runningBalance = total.currentBalance;
    const buckets = [...pointBuckets.values()]
      .filter((bucket) => bucket.currencyCode === total.currencyCode)
      .sort((left, right) => left.date.localeCompare(right.date));
    const points = buckets.map((bucket): BalanceProjectionPoint => {
      runningBalance -= bucket.projectedOutflows;

      return {
        date: bucket.date,
        currencyCode: bucket.currencyCode,
        startingBalance: total.currentBalance,
        projectedOutflows: bucket.projectedOutflows,
        projectedBalance: runningBalance,
        eventCount: bucket.eventCount,
      };
    });

    pointsByCurrency.set(total.currencyCode, points);
  }

  const sortedPoints = [...pointsByCurrency.values()]
    .flat()
    .sort((left, right) => {
      const dateDiff = left.date.localeCompare(right.date);

      if (dateDiff !== 0) {
        return dateDiff;
      }

      return left.currencyCode - right.currencyCode;
    });
  const sortedEvents = events.sort((left, right) => {
    const dueDiff = Date.parse(left.dueAt) - Date.parse(right.dueAt);

    if (dueDiff !== 0) {
      return dueDiff;
    }

    return (left.merchantName ?? left.recurringItemId).localeCompare(
      right.merchantName ?? right.recurringItemId,
    );
  });
  const totalCurrentBalance = sortedTotals.reduce(
    (sum, row) => sum + row.currentBalance,
    0,
  );
  const totalProjectedOutflows = sortedTotals.reduce(
    (sum, row) => sum + row.projectedOutflows,
    0,
  );
  const convertedTotals = await buildConvertedReportTotals(
    db,
    profile,
    sortedTotals.map((row) => {
      return {
        currencyCode: row.currencyCode,
        totalCurrentBalance: row.currentBalance,
        totalProjectedOutflows: row.projectedOutflows,
        totalProjectedBalance: row.projectedBalance,
      };
    }),
  );

  return {
    profile,
    from,
    to,
    days,
    generatedAt: new Date().toISOString(),
    totalCurrentBalance,
    totalProjectedOutflows,
    totalProjectedBalance: totalCurrentBalance - totalProjectedOutflows,
    currencies: sortedTotals.map((row) => row.currencyCode),
    totals: sortedTotals,
    points: sortedPoints,
    events: sortedEvents,
    ...(convertedTotals === undefined ? {} : { convertedTotals }),
  };
}

async function buildCategoryTrendReport(
  db: SqliteLedgerDb,
  profile: string,
  monthsInput: number | undefined,
): Promise<CategoryTrendReport> {
  const months = readCategoryTrendReportMonths(monthsInput);
  const period = await resolveTrailingMonthReportPeriod(db, profile, months);
  const from = startOfLocalDateEpoch(period.from);
  const to = endOfLocalDateEpoch(period.to);
  const categories = new Map<string, CategoryTrendReportCategory>();
  const points = new Map<string, CategoryTrendReportPoint>();
  let offset = 0;
  let totalExpenses = 0;
  let transactionCount = 0;

  while (true) {
    const page = await db.listLedgerEntries({
      profile,
      from,
      to,
      amountMax: -1,
      limit: CASHFLOW_REPORT_TRANSACTION_PAGE_SIZE,
      offset,
      sortBy: "time",
      sortDirection: "asc",
    });

    if (page.entries.length === 0) {
      break;
    }

    for (const entry of page.entries) {
      const amount = Math.abs(entry.amount);
      const month = localMonthKey(new Date(entry.time * 1000));
      const monthPeriod = readReportMonth(month);
      const category = monthlyReportCategory(entry);
      const categoryKey = `${category.categoryId}:${entry.currencyCode}`;
      const pointKey = `${month}:${category.categoryId}:${entry.currencyCode}`;
      const categoryTotal = categories.get(categoryKey) ?? {
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        currencyCode: entry.currencyCode,
        amount: 0,
        transactionCount: 0,
        averageMonthlyAmount: 0,
      };
      const point = points.get(pointKey) ?? {
        month,
        from: monthPeriod.periodStart,
        to: monthPeriod.periodEnd,
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        currencyCode: entry.currencyCode,
        amount: 0,
        transactionCount: 0,
      };

      totalExpenses += amount;
      transactionCount += 1;
      categoryTotal.amount += amount;
      categoryTotal.transactionCount += 1;
      point.amount += amount;
      point.transactionCount += 1;
      categories.set(categoryKey, categoryTotal);
      points.set(pointKey, point);
    }

    offset += page.entries.length;

    if (offset >= page.total) {
      break;
    }
  }

  const sortedCategories = [...categories.values()]
    .map((row): CategoryTrendReportCategory => {
      return {
        ...row,
        averageMonthlyAmount: averageMinorAmount(row.amount, months),
      };
    })
    .sort((left, right) => {
      if (right.amount !== left.amount) {
        return right.amount - left.amount;
      }

      return left.categoryName.localeCompare(right.categoryName);
    });
  const sortedPoints = [...points.values()].sort((left, right) => {
    const monthDiff = left.month.localeCompare(right.month);

    if (monthDiff !== 0) {
      return monthDiff;
    }

    if (right.amount !== left.amount) {
      return right.amount - left.amount;
    }

    return left.categoryName.localeCompare(right.categoryName);
  });
  const categoryCurrencyTotals = new Map<number, number>();

  for (const category of sortedCategories) {
    categoryCurrencyTotals.set(
      category.currencyCode,
      (categoryCurrencyTotals.get(category.currencyCode) ?? 0) +
        category.amount,
    );
  }

  const convertedTotals = await buildConvertedReportTotals(
    db,
    profile,
    [...categoryCurrencyTotals.entries()].map(([currencyCode, amount]) => {
      return {
        currencyCode,
        totalExpenses: amount,
      };
    }),
  );

  return {
    profile,
    from: period.from,
    to: period.to,
    months,
    generatedAt: new Date().toISOString(),
    totalExpenses,
    transactionCount,
    currencies: [...new Set(sortedCategories.map((row) => row.currencyCode))],
    categories: sortedCategories,
    points: sortedPoints,
    ...(convertedTotals === undefined ? {} : { convertedTotals }),
  };
}

async function buildMerchantTrendReport(
  db: SqliteLedgerDb,
  profile: string,
  monthsInput: number | undefined,
): Promise<MerchantTrendReport> {
  const months = readMerchantTrendReportMonths(monthsInput);
  const period = await resolveTrailingMonthReportPeriod(db, profile, months);
  const from = startOfLocalDateEpoch(period.from);
  const to = endOfLocalDateEpoch(period.to);
  const merchants = new Map<string, MerchantTrendReportMerchant>();
  const points = new Map<string, MerchantTrendReportPoint>();
  let offset = 0;
  let totalExpenses = 0;
  let transactionCount = 0;

  while (true) {
    const page = await db.listLedgerEntries({
      profile,
      from,
      to,
      amountMax: -1,
      limit: CASHFLOW_REPORT_TRANSACTION_PAGE_SIZE,
      offset,
      sortBy: "time",
      sortDirection: "asc",
    });

    if (page.entries.length === 0) {
      break;
    }

    for (const entry of page.entries) {
      const amount = Math.abs(entry.amount);
      const month = localMonthKey(new Date(entry.time * 1000));
      const monthPeriod = readReportMonth(month);
      const merchantName = monthlyReportMerchantName(entry);
      const normalizedMerchantName = merchantName.toLocaleLowerCase();
      const merchantKey = `${normalizedMerchantName}:${entry.currencyCode}`;
      const pointKey = `${month}:${normalizedMerchantName}:${entry.currencyCode}`;
      const merchantTotal = merchants.get(merchantKey) ?? {
        merchantName,
        currencyCode: entry.currencyCode,
        amount: 0,
        transactionCount: 0,
        averageMonthlyAmount: 0,
      };
      const point = points.get(pointKey) ?? {
        month,
        from: monthPeriod.periodStart,
        to: monthPeriod.periodEnd,
        merchantName,
        currencyCode: entry.currencyCode,
        amount: 0,
        transactionCount: 0,
      };

      totalExpenses += amount;
      transactionCount += 1;
      merchantTotal.amount += amount;
      merchantTotal.transactionCount += 1;
      point.amount += amount;
      point.transactionCount += 1;
      merchants.set(merchantKey, merchantTotal);
      points.set(pointKey, point);
    }

    offset += page.entries.length;

    if (offset >= page.total) {
      break;
    }
  }

  const sortedMerchants = [...merchants.values()]
    .map((row): MerchantTrendReportMerchant => {
      return {
        ...row,
        averageMonthlyAmount: averageMinorAmount(row.amount, months),
      };
    })
    .sort((left, right) => {
      if (right.amount !== left.amount) {
        return right.amount - left.amount;
      }

      return left.merchantName.localeCompare(right.merchantName);
    });
  const sortedPoints = [...points.values()].sort((left, right) => {
    const monthDiff = left.month.localeCompare(right.month);

    if (monthDiff !== 0) {
      return monthDiff;
    }

    if (right.amount !== left.amount) {
      return right.amount - left.amount;
    }

    return left.merchantName.localeCompare(right.merchantName);
  });
  const merchantCurrencyTotals = new Map<number, number>();

  for (const merchant of sortedMerchants) {
    merchantCurrencyTotals.set(
      merchant.currencyCode,
      (merchantCurrencyTotals.get(merchant.currencyCode) ?? 0) +
        merchant.amount,
    );
  }

  const convertedTotals = await buildConvertedReportTotals(
    db,
    profile,
    [...merchantCurrencyTotals.entries()].map(([currencyCode, amount]) => {
      return {
        currencyCode,
        totalExpenses: amount,
      };
    }),
  );

  return {
    profile,
    from: period.from,
    to: period.to,
    months,
    generatedAt: new Date().toISOString(),
    totalExpenses,
    transactionCount,
    currencies: [...new Set(sortedMerchants.map((row) => row.currencyCode))],
    merchants: sortedMerchants,
    points: sortedPoints,
    ...(convertedTotals === undefined ? {} : { convertedTotals }),
  };
}

function monthlyReportCategory(entry: LedgerEntry): {
  categoryId: string;
  categoryName: string;
} {
  const categoryId = entry.categoryId?.trim() || "uncategorized";
  const categoryName =
    entry.categoryName?.trim() ||
    (categoryId === "uncategorized" ? "Uncategorized" : categoryId);

  return { categoryId, categoryName };
}

function monthlyReportMerchantName(entry: LedgerEntry): string {
  return (
    entry.merchantName?.trim() || entry.description.trim() || "Unknown merchant"
  );
}

async function resolveMonthlySpendingPeriod(
  db: SqliteLedgerDb,
  profile: string,
  month: string | undefined,
): Promise<{
  month: string;
  periodStart: string;
  periodEnd: string;
}> {
  if (month !== undefined && month.trim() !== "") {
    return readReportMonth(month);
  }

  const latest = await db.listLedgerEntries({
    profile,
    limit: 1,
    sortBy: "time",
    sortDirection: "desc",
  });
  const anchor = latest.entries[0];

  return readReportMonth(
    localMonthKey(anchor ? new Date(anchor.time * 1000) : new Date()),
  );
}

async function buildMonthlySpendingReport(
  db: SqliteLedgerDb,
  profile: string,
  month: string | undefined,
): Promise<MonthlySpendingReport> {
  const period = await resolveMonthlySpendingPeriod(db, profile, month);
  const from = startOfLocalDateEpoch(period.periodStart);
  const to = endOfLocalDateEpoch(period.periodEnd);
  const currencyTotals = new Map<number, MonthlySpendingCurrencyTotal>();
  const categoryTotals = new Map<string, MonthlySpendingCategory>();
  const merchantTotals = new Map<string, MonthlySpendingMerchant>();
  let offset = 0;
  let totalExpenses = 0;
  let transactionCount = 0;

  while (true) {
    const page = await db.listLedgerEntries({
      profile,
      from,
      to,
      amountMax: -1,
      limit: MONTHLY_SPENDING_TRANSACTION_PAGE_SIZE,
      offset,
      sortBy: "time",
      sortDirection: "desc",
    });

    if (page.entries.length === 0) {
      break;
    }

    for (const entry of page.entries) {
      const amount = Math.abs(entry.amount);
      const currencyTotal = currencyTotals.get(entry.currencyCode) ?? {
        currencyCode: entry.currencyCode,
        amount: 0,
        transactionCount: 0,
        averageTransactionAmount: 0,
      };
      const category = monthlyReportCategory(entry);
      const categoryKey = `${category.categoryId}:${entry.currencyCode}`;
      const categoryTotal = categoryTotals.get(categoryKey) ?? {
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        currencyCode: entry.currencyCode,
        amount: 0,
        transactionCount: 0,
        sharePercentage: 0,
      };
      const merchantName = monthlyReportMerchantName(entry);
      const merchantKey = `${merchantName.toLocaleLowerCase()}:${entry.currencyCode}`;
      const merchantTotal = merchantTotals.get(merchantKey) ?? {
        merchantName,
        currencyCode: entry.currencyCode,
        amount: 0,
        transactionCount: 0,
        sharePercentage: 0,
      };

      totalExpenses += amount;
      transactionCount += 1;
      currencyTotal.amount += amount;
      currencyTotal.transactionCount += 1;
      categoryTotal.amount += amount;
      categoryTotal.transactionCount += 1;
      merchantTotal.amount += amount;
      merchantTotal.transactionCount += 1;

      currencyTotals.set(entry.currencyCode, currencyTotal);
      categoryTotals.set(categoryKey, categoryTotal);
      merchantTotals.set(merchantKey, merchantTotal);
    }

    offset += page.entries.length;

    if (offset >= page.total) {
      break;
    }
  }

  const currencyTotalRows = [...currencyTotals.values()]
    .map((row): MonthlySpendingCurrencyTotal => {
      return {
        ...row,
        averageTransactionAmount: averageMinorAmount(
          row.amount,
          row.transactionCount,
        ),
      };
    })
    .sort((left, right) => {
      if (right.amount !== left.amount) {
        return right.amount - left.amount;
      }

      return left.currencyCode - right.currencyCode;
    });
  const categories = [...categoryTotals.values()]
    .map((row): MonthlySpendingCategory => {
      return {
        ...row,
        sharePercentage: sharePercentage(
          row.amount,
          currencyTotals.get(row.currencyCode)?.amount ?? 0,
        ),
      };
    })
    .sort((left, right) => {
      if (right.amount !== left.amount) {
        return right.amount - left.amount;
      }

      return left.categoryName.localeCompare(right.categoryName);
    });
  const merchants = [...merchantTotals.values()]
    .map((row): MonthlySpendingMerchant => {
      return {
        ...row,
        sharePercentage: sharePercentage(
          row.amount,
          currencyTotals.get(row.currencyCode)?.amount ?? 0,
        ),
      };
    })
    .sort((left, right) => {
      if (right.amount !== left.amount) {
        return right.amount - left.amount;
      }

      return left.merchantName.localeCompare(right.merchantName);
    });
  const convertedTotals = await buildConvertedReportTotals(
    db,
    profile,
    currencyTotalRows.map((row) => {
      return {
        currencyCode: row.currencyCode,
        totalExpenses: row.amount,
      };
    }),
  );

  return {
    profile,
    month: period.month,
    from: period.periodStart,
    to: period.periodEnd,
    generatedAt: new Date().toISOString(),
    totalExpenses,
    transactionCount,
    averageTransactionAmount: averageMinorAmount(
      totalExpenses,
      transactionCount,
    ),
    currencies: currencyTotalRows.map((row) => row.currencyCode),
    currencyTotals: currencyTotalRows,
    categories,
    merchants,
    ...(convertedTotals === undefined ? {} : { convertedTotals }),
  };
}

async function calculateBudgetActualAmount(
  db: SqliteLedgerDb,
  profile: string,
  budget: Budget,
  period: BudgetPeriod,
): Promise<number | undefined> {
  let offset = 0;
  let countedEntries = false;
  let totalActualAmount = 0;

  while (true) {
    const page = await db.listLedgerEntries({
      profile,
      categoryId: budget.categoryId,
      from: startOfLocalDateEpoch(period.periodStart),
      to: endOfLocalDateEpoch(period.periodEnd),
      limit: BUDGET_ACTUAL_TRANSACTION_PAGE_SIZE,
      offset,
    });

    if (page.entries.length === 0) {
      break;
    }

    countedEntries = true;

    totalActualAmount += page.entries.reduce((sum, entry) => {
      if (isTransferLikeEntry(entry)) {
        return sum;
      }

      if (entry.currencyCode !== budget.currencyCode) {
        return sum;
      }

      if (budget.includeInflows) {
        return entry.amount > 0 ? sum + entry.amount : sum;
      }

      return entry.amount < 0 ? sum - entry.amount : sum;
    }, 0);

    offset += page.entries.length;

    if (offset >= page.total) {
      break;
    }
  }

  if (!countedEntries) {
    return undefined;
  }

  return Math.max(0, totalActualAmount);
}

function recurringMissedPaymentToleranceDays(
  frequency: RecurringItem["frequency"],
): number {
  switch (frequency) {
    case "daily":
    case "irregular":
      return 0;
    case "weekly":
      return 1;
    case "monthly":
      return 3;
    case "quarterly":
      return 5;
    case "yearly":
      return 7;
  }
}

function recurringPaymentAmountMatches(
  item: RecurringItem,
  entry: LedgerEntry,
): boolean {
  const amount = Math.abs(entry.amount);

  if (
    item.expectedAmountMin !== undefined &&
    item.expectedAmountMax !== undefined
  ) {
    const lower = Math.min(item.expectedAmountMin, item.expectedAmountMax);
    const upper = Math.max(item.expectedAmountMin, item.expectedAmountMax);

    return amount >= lower && amount <= upper;
  }

  if (item.expectedAmountMin !== undefined) {
    return amount >= item.expectedAmountMin;
  }

  if (item.expectedAmountMax !== undefined) {
    return amount <= item.expectedAmountMax;
  }

  return true;
}

function recurringPaymentMerchantMatches(
  item: RecurringItem,
  entry: LedgerEntry,
): boolean {
  if (item.merchantName === undefined || item.merchantName.trim() === "") {
    return true;
  }

  const entryLabel = normalizeRecurringMerchantLabel(entry);

  if (entryLabel === undefined) {
    return false;
  }

  const expected = normalizeRecurringGroupLabel(item.merchantName);
  const actual = normalizeRecurringGroupLabel(entryLabel);

  return actual === expected || actual.includes(expected);
}

function recurringPaymentIdentityMatches(
  item: RecurringItem,
  currencyCode: number,
  entry: LedgerEntry,
): boolean {
  if (
    entry.amount >= 0 ||
    entry.hold === true ||
    entry.categoryId === TRANSFER_CATEGORY_ID ||
    entry.accountId !== item.accountId ||
    entry.currencyCode !== currencyCode
  ) {
    return false;
  }

  if (item.categoryId !== undefined && entry.categoryId !== item.categoryId) {
    return false;
  }

  return recurringPaymentMerchantMatches(item, entry);
}

function recurringPaymentEntryMatches(
  item: RecurringItem,
  currencyCode: number,
  entry: LedgerEntry,
): boolean {
  return (
    recurringPaymentIdentityMatches(item, currencyCode, entry) &&
    recurringPaymentAmountMatches(item, entry)
  );
}

async function hasMatchingRecurringLedgerEntry(
  db: SqliteLedgerDb,
  profile: string,
  item: RecurringItem,
  currencyCode: number,
  from: Date,
  to: Date,
): Promise<boolean> {
  let offset = 0;

  while (true) {
    const page = await db.listLedgerEntries({
      profile,
      accountId: item.accountId,
      ...(item.categoryId === undefined ? {} : { categoryId: item.categoryId }),
      status: "posted",
      from: startOfUtcDateEpoch(from),
      to: endOfUtcDateEpoch(to),
      sortBy: "time",
      sortDirection: "asc",
      limit: MISSED_RECURRING_PAYMENT_PAGE_SIZE,
      offset,
    });

    if (
      page.entries.some((entry) =>
        recurringPaymentEntryMatches(item, currencyCode, entry),
      )
    ) {
      return true;
    }

    offset += page.entries.length;

    if (page.entries.length === 0 || offset >= page.total) {
      return false;
    }
  }
}

function buildMissedRecurringPayment(
  item: RecurringItem,
  currencyCode: number,
  expectedDueAt: Date,
  asOfDate: Date,
  matchWindowStart: Date,
  matchWindowEnd: Date,
): MissedRecurringPayment {
  const expectedDueAtIso = expectedDueAt.toISOString();

  return {
    id: `${item.id}:${expectedDueAtIso.slice(0, 10)}:missed`,
    recurringItemId: item.id,
    profile: item.profile,
    accountId: item.accountId,
    ...(item.categoryId === undefined ? {} : { categoryId: item.categoryId }),
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
    expectedDate: expectedDueAtIso.slice(0, 10),
    expectedDueAt: expectedDueAtIso,
    daysOverdue: daysBetweenUtcDates(asOfDate, expectedDueAt),
    matchWindowStart: matchWindowStart.toISOString(),
    matchWindowEnd: matchWindowEnd.toISOString(),
    ...(item.lastSeenAt === undefined ? {} : { lastSeenAt: item.lastSeenAt }),
  };
}

async function listMissedRecurringPayments(
  db: SqliteLedgerDb,
  profile: string,
  asOf = new Date(),
): Promise<readonly MissedRecurringPayment[]> {
  const [items, accounts] = await Promise.all([
    db.listRecurringItems(profile),
    db.listAccounts(profile),
  ]);
  const accountCurrencyCodes = new Map(
    accounts.map((account) => [account.id, account.currencyCode]),
  );
  const asOfDate = startOfUtcDate(asOf);
  const missedPayments: MissedRecurringPayment[] = [];

  for (const item of items) {
    if (!item.isActive) {
      continue;
    }

    const currencyCode = accountCurrencyCodes.get(item.accountId);
    const expectedDueAt = resolvePreviousRecurringDate(item, asOfDate);

    if (currencyCode === undefined || expectedDueAt === undefined) {
      continue;
    }

    const toleranceDays = recurringMissedPaymentToleranceDays(item.frequency);
    const matchWindowStart = addUtcDays(expectedDueAt, -toleranceDays);
    const matchWindowEnd = addUtcDays(expectedDueAt, toleranceDays);

    if (matchWindowEnd >= asOfDate) {
      continue;
    }

    const hasMatch = await hasMatchingRecurringLedgerEntry(
      db,
      profile,
      item,
      currencyCode,
      matchWindowStart,
      matchWindowEnd,
    );

    if (hasMatch) {
      continue;
    }

    missedPayments.push(
      buildMissedRecurringPayment(
        item,
        currencyCode,
        expectedDueAt,
        asOfDate,
        matchWindowStart,
        matchWindowEnd,
      ),
    );
  }

  return missedPayments.sort((left, right) => {
    const dueDiff =
      Date.parse(left.expectedDueAt) - Date.parse(right.expectedDueAt);

    if (dueDiff !== 0) {
      return dueDiff;
    }

    return (left.merchantName ?? left.recurringItemId).localeCompare(
      right.merchantName ?? right.recurringItemId,
    );
  });
}

async function findLatestMatchingRecurringLedgerEntry(
  db: SqliteLedgerDb,
  profile: string,
  item: RecurringItem,
  currencyCode: number,
  asOfDate: Date,
): Promise<LedgerEntry | undefined> {
  let offset = 0;

  while (true) {
    const page = await db.listLedgerEntries({
      profile,
      accountId: item.accountId,
      ...(item.categoryId === undefined ? {} : { categoryId: item.categoryId }),
      status: "posted",
      from: startOfUtcDateEpoch(
        addUtcDays(asOfDate, -SUBSCRIPTION_INCREASE_LOOKBACK_DAYS),
      ),
      to: endOfUtcDateEpoch(asOfDate),
      sortBy: "time",
      sortDirection: "desc",
      limit: SUBSCRIPTION_INCREASE_PAGE_SIZE,
      offset,
    });

    const match = page.entries.find((entry) =>
      recurringPaymentIdentityMatches(item, currencyCode, entry),
    );

    if (match !== undefined) {
      return match;
    }

    offset += page.entries.length;

    if (page.entries.length === 0 || offset >= page.total) {
      return undefined;
    }
  }
}

function buildSubscriptionIncreaseAlert(
  item: RecurringItem,
  currencyCode: number,
  entry: LedgerEntry,
  expectedAmountMax: number,
): SubscriptionIncreaseAlert | undefined {
  const actualAmount = Math.abs(entry.amount);

  if (expectedAmountMax <= 0 || actualAmount <= expectedAmountMax) {
    return undefined;
  }

  const increaseAmount = actualAmount - expectedAmountMax;

  return {
    id: `${item.id}:${entry.id}:increase`,
    recurringItemId: item.id,
    ledgerEntryId: entry.id,
    profile: item.profile,
    accountId: item.accountId,
    ...(item.categoryId === undefined ? {} : { categoryId: item.categoryId }),
    ...(item.merchantName === undefined
      ? {}
      : { merchantName: item.merchantName }),
    frequency: item.frequency,
    ...(item.expectedAmountMin === undefined
      ? {}
      : { expectedAmountMin: item.expectedAmountMin }),
    expectedAmountMax,
    actualAmount,
    increaseAmount,
    increasePercentage: roundToTwoDecimals(
      (increaseAmount / expectedAmountMax) * 100,
    ),
    currencyCode,
    occurredAt: new Date(entry.time * 1000).toISOString(),
    ...(item.lastSeenAt === undefined ? {} : { lastSeenAt: item.lastSeenAt }),
  };
}

async function listSubscriptionIncreaseAlerts(
  db: SqliteLedgerDb,
  profile: string,
  asOf = new Date(),
): Promise<readonly SubscriptionIncreaseAlert[]> {
  const [items, accounts] = await Promise.all([
    db.listRecurringItems(profile),
    db.listAccounts(profile),
  ]);
  const accountCurrencyCodes = new Map(
    accounts.map((account) => [account.id, account.currencyCode]),
  );
  const asOfDate = startOfUtcDate(asOf);
  const alerts: SubscriptionIncreaseAlert[] = [];

  for (const item of items) {
    if (!item.isActive || item.expectedAmountMax === undefined) {
      continue;
    }

    const currencyCode = accountCurrencyCodes.get(item.accountId);

    if (currencyCode === undefined) {
      continue;
    }

    const entry = await findLatestMatchingRecurringLedgerEntry(
      db,
      profile,
      item,
      currencyCode,
      asOfDate,
    );

    if (entry === undefined) {
      continue;
    }

    const alert = buildSubscriptionIncreaseAlert(
      item,
      currencyCode,
      entry,
      item.expectedAmountMax,
    );

    if (alert !== undefined) {
      alerts.push(alert);
    }
  }

  return alerts.sort((left, right) => {
    const occurredDiff =
      Date.parse(right.occurredAt) - Date.parse(left.occurredAt);

    if (occurredDiff !== 0) {
      return occurredDiff;
    }

    if (right.increaseAmount !== left.increaseAmount) {
      return right.increaseAmount - left.increaseAmount;
    }

    return (left.merchantName ?? left.recurringItemId).localeCompare(
      right.merchantName ?? right.recurringItemId,
    );
  });
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

function recurringCalendarEventId(
  recurringItemId: string,
  dueAt: Date,
): string {
  return `${recurringItemId}:${dueAt.toISOString().slice(0, 10)}`;
}

function buildRecurringCalendarEvent(
  item: RecurringItem,
  currencyCode: number,
  dueAt: Date,
  asOfDate: Date,
): RecurringCalendarEvent {
  const dueAtIso = dueAt.toISOString();
  const date = dueAtIso.slice(0, 10);

  return {
    id: recurringCalendarEventId(item.id, dueAt),
    recurringItemId: item.id,
    profile: item.profile,
    accountId: item.accountId,
    ...(item.categoryId === undefined ? {} : { categoryId: item.categoryId }),
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
    date,
    month: date.slice(0, 7),
    dueAt: dueAtIso,
    isPast: dueAt < asOfDate,
  };
}

function recurringCalendarRange(
  from?: Date,
  to?: Date,
): {
  from: Date;
  to: Date;
} {
  const start = startOfUtcDate(from ?? new Date());
  const end = startOfUtcDate(
    to ?? addUtcDays(start, RECURRING_CALENDAR_DEFAULT_DAYS),
  );
  const rangeDays = daysBetweenUtcDates(end, start);

  if (rangeDays < 0) {
    throw new Error("Recurring calendar range start must be before end.");
  }

  if (rangeDays > RECURRING_CALENDAR_MAX_DAYS) {
    throw new Error(
      `Recurring calendar range cannot exceed ${RECURRING_CALENDAR_MAX_DAYS} days.`,
    );
  }

  return { from: start, to: end };
}

function recurringCalendarDatesForItem(
  item: RecurringItem,
  from: Date,
  to: Date,
): readonly Date[] {
  const firstDueAt = resolveNextRecurringDate(item, from);

  if (firstDueAt === undefined) {
    return [];
  }

  if (item.frequency === "irregular") {
    return firstDueAt >= from && firstDueAt <= to ? [firstDueAt] : [];
  }

  const dates: Date[] = [];
  let cursor = firstDueAt;

  while (cursor <= to) {
    dates.push(cursor);

    const next = addRecurringFrequency(cursor, item.frequency);

    if (next.getTime() === cursor.getTime()) {
      break;
    }

    cursor = next;
  }

  return dates;
}

async function listRecurringCalendar(
  db: SqliteLedgerDb,
  profile: string,
  from?: Date,
  to?: Date,
): Promise<readonly RecurringCalendarEvent[]> {
  const range = recurringCalendarRange(from, to);
  const [items, accounts] = await Promise.all([
    db.listRecurringItems(profile),
    db.listAccounts(profile),
  ]);
  const accountCurrencyCodes = new Map(
    accounts.map((account) => [account.id, account.currencyCode]),
  );
  const asOfDate = startOfUtcDate(new Date());

  return items
    .filter((item) => item.isActive)
    .flatMap((item): RecurringCalendarEvent[] => {
      const currencyCode = accountCurrencyCodes.get(item.accountId);

      if (currencyCode === undefined) {
        return [];
      }

      return recurringCalendarDatesForItem(item, range.from, range.to).map(
        (dueAt) =>
          buildRecurringCalendarEvent(item, currencyCode, dueAt, asOfDate),
      );
    })
    .sort((left, right) => {
      const dueDiff = Date.parse(left.dueAt) - Date.parse(right.dueAt);

      if (dueDiff !== 0) {
        return dueDiff;
      }

      return (left.merchantName ?? left.recurringItemId).localeCompare(
        right.merchantName ?? right.recurringItemId,
      );
    });
}

async function listBudgetProgress(
  db: SqliteLedgerDb,
  profile: string,
): Promise<readonly BudgetProgress[]> {
  const [budgets, periods, categories] = await Promise.all([
    db.listBudgets(profile),
    db.listBudgetPeriods(profile),
    db.listCategories(profile),
  ]);
  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  const latestPeriodsByBudget = new Map<string, BudgetPeriod>();

  for (const period of periods) {
    const existing = latestPeriodsByBudget.get(period.budgetId);

    if (
      existing === undefined ||
      period.periodStart > existing.periodStart ||
      (period.periodStart === existing.periodStart &&
        period.updatedAt > existing.updatedAt)
    ) {
      latestPeriodsByBudget.set(period.budgetId, period);
    }
  }

  const rows = await Promise.all(
    budgets.map(async (budget): Promise<BudgetProgress | undefined> => {
      const period = latestPeriodsByBudget.get(budget.id);

      if (period === undefined) {
        return undefined;
      }

      return buildBudgetProgressRow(
        db,
        profile,
        budget,
        period,
        categoryNames.get(budget.categoryId) ?? budget.categoryId,
      );
    }),
  );

  return rows
    .filter((row): row is BudgetProgress => row !== undefined)
    .sort((left, right) => {
      const statusOrder: Record<BudgetProgress["status"], number> = {
        overspent: 0,
        near_limit: 1,
        on_track: 2,
      };
      const statusDiff = statusOrder[left.status] - statusOrder[right.status];

      if (statusDiff !== 0) {
        return statusDiff;
      }

      return right.progressPercentage - left.progressPercentage;
    });
}

async function buildBudgetProgressRow(
  db: SqliteLedgerDb,
  profile: string,
  budget: Budget,
  period: BudgetPeriod,
  categoryName: string,
): Promise<BudgetProgress> {
  const storedClosedActual =
    period.status === "closed" && period.actualAmount !== undefined
      ? period.actualAmount
      : undefined;
  const calculatedActualAmount =
    storedClosedActual !== undefined
      ? undefined
      : await calculateBudgetActualAmount(db, profile, budget, period);
  const actualAmount =
    storedClosedActual ?? calculatedActualAmount ?? period.actualAmount ?? 0;
  const amountLimit = period.plannedAmount || budget.amountLimit;
  const progressPercentage =
    amountLimit > 0 ? Math.round((actualAmount / amountLimit) * 100) : 0;
  const remainingAmount = amountLimit - actualAmount;
  const status = budget.includeInflows
    ? "on_track"
    : actualAmount > amountLimit
      ? "overspent"
      : progressPercentage >= 85
        ? "near_limit"
        : "on_track";

  return {
    id: period.id,
    budgetId: budget.id,
    profile: budget.profile,
    categoryId: budget.categoryId,
    categoryName,
    currencyCode: budget.currencyCode,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    amountLimit,
    actualAmount,
    remainingAmount,
    progressPercentage,
    status,
  };
}

export function createLedgerQueryService({
  db,
  defaultProfile,
}: CreateLedgerServicesOptions): LedgerQueryService {
  return {
    getLedgerSummary(profile) {
      return db.getLedgerSummary(coerceProfile(profile, defaultProfile));
    },
    async getNetWorthTrend(_profile) {
      return {
        enabled: false,
        reason: "Manual account and asset support is not enabled.",
        points: [],
      };
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
    async listSavingsGoalProgress(profile) {
      return listSavingsGoalProgressFromJars(
        await db.listJars(coerceProfile(profile, defaultProfile)),
      );
    },
    listCategories(profile) {
      return db.listCategories(coerceProfile(profile, defaultProfile));
    },
    listCategoryRules(profile) {
      return db.listCategoryRules(coerceProfile(profile, defaultProfile));
    },
    listMerchantCleanupRules(profile) {
      return db.listMerchantCleanupRules(
        coerceProfile(profile, defaultProfile),
      );
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
    listBudgetProgress(profile) {
      return listBudgetProgress(db, coerceProfile(profile, defaultProfile));
    },
    getCashflowReport(profile, months) {
      return buildCashflowReport(
        db,
        coerceProfile(profile, defaultProfile),
        months,
      );
    },
    getSavingsRateReport(profile, months) {
      return buildSavingsRateReport(
        db,
        coerceProfile(profile, defaultProfile),
        months,
      );
    },
    getBalanceProjectionReport(profile, days, asOf) {
      return buildBalanceProjectionReport(
        db,
        coerceProfile(profile, defaultProfile),
        days,
        asOf,
      );
    },
    getCategoryTrendReport(profile, months) {
      return buildCategoryTrendReport(
        db,
        coerceProfile(profile, defaultProfile),
        months,
      );
    },
    getMerchantTrendReport(profile, months) {
      return buildMerchantTrendReport(
        db,
        coerceProfile(profile, defaultProfile),
        months,
      );
    },
    getMonthlySpendingReport(profile, month) {
      return buildMonthlySpendingReport(
        db,
        coerceProfile(profile, defaultProfile),
        month,
      );
    },
    listRecurringItems(profile) {
      return db.listRecurringItems(coerceProfile(profile, defaultProfile));
    },
    detectRecurringTransactions(profile) {
      return detectRecurringTransactionsFromLedger(
        db,
        coerceProfile(profile, defaultProfile),
      );
    },
    listMissedRecurringPayments(profile, asOf) {
      return listMissedRecurringPayments(
        db,
        coerceProfile(profile, defaultProfile),
        asOf,
      );
    },
    listSubscriptionIncreaseAlerts(profile, asOf) {
      return listSubscriptionIncreaseAlerts(
        db,
        coerceProfile(profile, defaultProfile),
        asOf,
      );
    },
    listRecurringCalendar(profile, from, to) {
      return listRecurringCalendar(
        db,
        coerceProfile(profile, defaultProfile),
        from,
        to,
      );
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
      getNetWorthTrend: query.getNetWorthTrend,
      getAccountBalances: query.getAccountBalances,
      listAccounts: query.listAccounts,
      listJars: query.listJars,
      listSavingsGoalProgress: query.listSavingsGoalProgress,
    },
    categories: {
      listCategories: query.listCategories,
      listCategoryRules: query.listCategoryRules,
      listCategorySpending: query.listCategorySpending,
      listMerchantCleanupRules: query.listMerchantCleanupRules,
    },
    budgets: {
      listBudgets: query.listBudgets,
      listBudgetPeriods: query.listBudgetPeriods,
      listBudgetProgress: query.listBudgetProgress,
    },
    reports: {
      getCashflowReport: query.getCashflowReport,
      getSavingsRateReport: query.getSavingsRateReport,
      getBalanceProjectionReport: query.getBalanceProjectionReport,
      getCategoryTrendReport: query.getCategoryTrendReport,
      getMerchantTrendReport: query.getMerchantTrendReport,
      getMonthlySpendingReport: query.getMonthlySpendingReport,
    },
    recurringItems: {
      listRecurringItems: query.listRecurringItems,
      detectRecurringTransactions: query.detectRecurringTransactions,
      listMissedRecurringPayments: query.listMissedRecurringPayments,
      listSubscriptionIncreaseAlerts: query.listSubscriptionIncreaseAlerts,
      listRecurringCalendar: query.listRecurringCalendar,
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
  function readRecurringCandidateId(candidateId: string): string {
    const normalizedCandidateId = candidateId.trim();

    if (!normalizedCandidateId) {
      throw new Error("Recurring detection candidate ID is required.");
    }

    return normalizedCandidateId;
  }

  async function findRecurringDetectionCandidate(
    profile: string,
    candidateId: string,
  ): Promise<RecurringDetectionCandidate> {
    const candidates = await detectRecurringTransactionsFromLedger(db, profile);
    const candidate = candidates.find((item) => item.id === candidateId);

    if (candidate === undefined) {
      throw new Error("Recurring detection candidate was not found.");
    }

    return candidate;
  }

  function recurringItemFromCandidate(
    candidate: RecurringDetectionCandidate,
    timestamp: string,
  ): RecurringItem {
    return {
      id: candidate.id,
      profile: candidate.profile,
      accountId: candidate.accountId,
      ...(candidate.categoryId === undefined
        ? {}
        : { categoryId: candidate.categoryId }),
      merchantName: candidate.merchantName,
      frequency: candidate.frequency,
      expectedAmountMin: candidate.expectedAmountMin,
      expectedAmountMax: candidate.expectedAmountMax,
      isActive: true,
      startedAt: candidate.firstSeenAt,
      lastSeenAt: candidate.lastSeenAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

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
    async confirmRecurringDetection(candidateId, profile) {
      const resolvedProfile = coerceProfile(profile, defaultProfile);
      const normalizedCandidateId = readRecurringCandidateId(candidateId);
      const candidate = await findRecurringDetectionCandidate(
        resolvedProfile,
        normalizedCandidateId,
      );
      const timestamp = new Date().toISOString();
      const recurringItem = await db.upsertRecurringItem(
        resolvedProfile,
        recurringItemFromCandidate(candidate, timestamp),
      );
      const decision = await db.recordRecurringDetectionDecision(
        resolvedProfile,
        normalizedCandidateId,
        "confirmed",
        timestamp,
      );

      return {
        profile: decision.profile,
        candidateId: decision.candidateId,
        action: decision.action,
        updatedAt: decision.updatedAt,
        recurringItem,
      };
    },
    async ignoreRecurringDetection(candidateId, profile) {
      const resolvedProfile = coerceProfile(profile, defaultProfile);
      const normalizedCandidateId = readRecurringCandidateId(candidateId);
      await findRecurringDetectionCandidate(
        resolvedProfile,
        normalizedCandidateId,
      );

      const decision = await db.recordRecurringDetectionDecision(
        resolvedProfile,
        normalizedCandidateId,
        "ignored",
      );

      return {
        profile: decision.profile,
        candidateId: decision.candidateId,
        action: decision.action,
        updatedAt: decision.updatedAt,
      };
    },
    async createMonthlyCategoryBudget(input, profile) {
      const resolvedProfile = coerceProfile(profile, defaultProfile);
      const categoryId = input.categoryId.trim();
      const amountLimit = Math.trunc(input.amountLimit);
      const currencyCode = Math.trunc(input.currencyCode);
      const includeInflows = categoryId === "income";
      const rollover = includeInflows ? false : input.rollover === true;
      const { month, periodStart, periodEnd } = readBudgetMonth(input.month);

      if (!categoryId) {
        throw new Error("Budget category is required.");
      }

      if (!Number.isFinite(currencyCode) || currencyCode <= 0) {
        throw new Error("Budget currency code must be a positive number.");
      }

      if (!Number.isFinite(amountLimit) || amountLimit <= 0) {
        throw new Error("Budget amount limit must be positive.");
      }

      const categoryExists = (await db.listCategories(resolvedProfile)).some(
        (category) => category.id === categoryId,
      );

      if (!categoryExists) {
        throw new Error("Budget category was not found.");
      }

      const [allBudgets, allPeriods] = await Promise.all([
        db.listBudgets(resolvedProfile),
        db.listBudgetPeriods(resolvedProfile),
      ]);
      const previous = rollover
        ? findPreviousRolloverBudgetPeriod(
            allBudgets,
            allPeriods,
            categoryId,
            currencyCode,
            periodStart,
          )
        : undefined;
      const previousActualAmount =
        previous === undefined
          ? 0
          : previous.period.status === "closed" &&
              previous.period.actualAmount !== undefined
            ? previous.period.actualAmount
            : ((await calculateBudgetActualAmount(
                db,
                resolvedProfile,
                previous.budget,
                previous.period,
              )) ??
              previous.period.actualAmount ??
              0);
      const carryoverAmount =
        previous === undefined
          ? 0
          : Math.max(
              0,
              (previous.period.plannedAmount || previous.budget.amountLimit) -
                previousActualAmount,
            );

      const timestamp = new Date().toISOString();
      const budgetId = `monthly-${categoryId}-${currencyCode}-${month}`;
      const periodId = `${budgetId}-period`;

      await db.importLocalConfiguration(resolvedProfile, {
        budgets: [
          {
            id: budgetId,
            profile: resolvedProfile,
            categoryId,
            currencyCode,
            periodStart,
            periodEnd,
            amountLimit,
            rollover,
            includeInflows,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        budgetPeriods: [
          {
            id: periodId,
            profile: resolvedProfile,
            budgetId,
            periodStart,
            periodEnd,
            plannedAmount: amountLimit + carryoverAmount,
            status: "open",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      });

      const progress = await listBudgetProgress(db, resolvedProfile);
      const created = progress.find((row) => row.id === periodId);

      if (created === undefined) {
        throw new Error("Created budget progress row was not found.");
      }

      return created;
    },
    async deleteMonthlyCategoryBudget(budgetPeriodId, profile) {
      const resolvedProfile = coerceProfile(profile, defaultProfile);
      const normalizedPeriodId = budgetPeriodId.trim();

      if (!normalizedPeriodId) {
        throw new Error("Budget period ID is required.");
      }

      return db.deleteMonthlyCategoryBudget(
        resolvedProfile,
        normalizedPeriodId,
      );
    },
    async closeMonthlyBudgetPeriod(budgetPeriodId, profile) {
      const resolvedProfile = coerceProfile(profile, defaultProfile);
      const normalizedPeriodId = budgetPeriodId.trim();

      if (!normalizedPeriodId) {
        throw new Error("Budget period ID is required.");
      }

      const [budgets, periods] = await Promise.all([
        db.listBudgets(resolvedProfile),
        db.listBudgetPeriods(resolvedProfile),
      ]);
      const period = periods.find(
        (candidate) => candidate.id === normalizedPeriodId,
      );

      if (period === undefined) {
        return undefined;
      }

      const budget = budgets.find(
        (candidate) => candidate.id === period.budgetId,
      );

      if (budget === undefined) {
        return undefined;
      }

      const actualAmount =
        period.status === "closed" && period.actualAmount !== undefined
          ? period.actualAmount
          : ((await calculateBudgetActualAmount(
              db,
              resolvedProfile,
              budget,
              period,
            )) ??
            period.actualAmount ??
            0);

      const updated = await db.updateMonthlyBudgetPeriodStatus(
        resolvedProfile,
        normalizedPeriodId,
        "closed",
        actualAmount,
      );

      if (updated === undefined) {
        return undefined;
      }

      const categories = await db.listCategories(resolvedProfile);
      const categoryName =
        categories.find((category) => category.id === budget.categoryId)
          ?.name ?? budget.categoryId;

      return buildBudgetProgressRow(
        db,
        resolvedProfile,
        budget,
        updated,
        categoryName,
      );
    },
    async reopenMonthlyBudgetPeriod(budgetPeriodId, profile) {
      const resolvedProfile = coerceProfile(profile, defaultProfile);
      const normalizedPeriodId = budgetPeriodId.trim();

      if (!normalizedPeriodId) {
        throw new Error("Budget period ID is required.");
      }

      const [budgets, periods] = await Promise.all([
        db.listBudgets(resolvedProfile),
        db.listBudgetPeriods(resolvedProfile),
      ]);
      const period = periods.find(
        (candidate) => candidate.id === normalizedPeriodId,
      );

      if (period === undefined) {
        return undefined;
      }

      const budget = budgets.find(
        (candidate) => candidate.id === period.budgetId,
      );

      if (budget === undefined) {
        return undefined;
      }

      const updated = await db.updateMonthlyBudgetPeriodStatus(
        resolvedProfile,
        normalizedPeriodId,
        "open",
      );

      if (updated === undefined) {
        return undefined;
      }

      const categories = await db.listCategories(resolvedProfile);
      const categoryName =
        categories.find((category) => category.id === budget.categoryId)
          ?.name ?? budget.categoryId;

      return buildBudgetProgressRow(
        db,
        resolvedProfile,
        budget,
        updated,
        categoryName,
      );
    },
    updateTransactionsBulk(ids, update, profile) {
      return withProfileTransaction(profile, (tx, resolvedProfile) =>
        tx.updateLedgerEntriesBulkEdit(resolvedProfile, ids, update),
      );
    },
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
