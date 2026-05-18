import type {
  AccountBalance,
  Budget,
  BudgetProgress,
  BudgetPeriod,
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
  NetWorthTrend,
  RecurringItem,
  SavingsGoalProgress,
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
const BUDGET_ACTUAL_TRANSACTION_PAGE_SIZE = 500;
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
