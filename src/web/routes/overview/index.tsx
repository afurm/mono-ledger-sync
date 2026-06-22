import { type FormEvent, useEffect, useState } from "react";
import {
  ChevronRightIcon,
  CopyIcon,
  DatabaseIcon,
  DownloadIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";

import {
  closeMonthlyBudgetPeriod,
  createMonthlyCategoryBudget,
  deleteMonthlyCategoryBudget,
  loadLedgerTransactions,
  reopenMonthlyBudgetPeriod,
} from "../../api";
import type { LedgerEntryPage, LocalAppSnapshot } from "../../api-types";
import {
  currencyLabel,
  formatDate,
  formatDateTime,
  formatMinorAmount,
} from "../../format";
import type { RouteId } from "../../navigation";
import {
  type LedgerEntryReviewCandidate,
  findLedgerEntryReviewCandidates,
} from "../../review";
import { statusVariant, tokenStateLabel } from "../../status";
import {
  TransactionTable,
  amountSemanticTextClassName,
} from "../../transaction-cells";
import {
  BalanceProjectionReportCard,
  CashflowReportCard,
  CategorySpendingCard,
  CategoryTrendReportCard,
  MerchantTrendReportCard,
  MonthToDateFinanceSummaryCard,
  MonthlySpendingReportCard,
  SavingsRateReportCard,
} from "../../report-cards";
import {
  MissedRecurringPaymentsCard,
  RecurringCalendarCard,
  RecurringDetectionCandidatesCard,
  SubscriptionIncreaseAlertsCard,
  UpcomingRecurringPaymentsCard,
  recurringPaymentAmountLabel,
  recurringPaymentDueLabel,
} from "../recurring";
import {
  RecentSyncRunsCard,
  RecentWebhookDeliveriesCard,
  SyncHealthChart,
} from "../sync";

const OVERVIEW_TRANSACTION_LIMIT = 8;
const AMOUNT_FILTER_PATTERN = /^-?(?:\d+|\d*\.\d{1,2})$/;

type TransactionFilterFormState = {
  search: string;
  accountId: string;
  categoryId: string;
  merchantName: string;
  status: "all" | "hold" | "posted";
  reviewState: "all" | "needs_review" | "reviewed" | "ignored";
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  page: number;
  sortBy: "time" | "merchant" | "amount" | "account" | "category" | "status";
  sortDirection: "asc" | "desc";
};

function defaultTransactionFilters(): TransactionFilterFormState {
  return {
    search: "",
    accountId: "",
    categoryId: "",
    merchantName: "",
    status: "all",
    reviewState: "all",
    dateFrom: "",
    dateTo: "",
    amountMin: "",
    amountMax: "",
    page: 1,
    sortBy: "time",
    sortDirection: "desc",
  };
}

function buildTransactionFiltersHash(filters: TransactionFilterFormState) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === "" || value === "all" || (key === "page" && value === 1)) {
      continue;
    }

    if (key === "sortBy" && value === "time") {
      continue;
    }

    if (key === "sortDirection" && value === "desc") {
      continue;
    }

    params.set(key, String(value));
  }

  const query = params.toString();
  return `#transactions${query ? `?${query}` : ""}`;
}

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateInputToEpoch(value: string, endOfDay = false): number | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  const epoch = Math.floor(date.getTime() / 1000);

  return Number.isFinite(epoch) ? epoch : undefined;
}

function amountInputToMinor(value: string): number | undefined {
  const trimmed = value.trim();

  if (!trimmed || !AMOUNT_FILTER_PATTERN.test(trimmed)) {
    return undefined;
  }

  const amount = Number(trimmed);
  const minorAmount = Math.round(amount * 100);

  return Number.isSafeInteger(minorAmount) ? minorAmount : undefined;
}

function dataFreshnessLabel(lastSyncedAt: string | undefined): string {
  return lastSyncedAt
    ? `Updated ${formatDateTime(lastSyncedAt)}`
    : "Waiting for first sync";
}

function MetricCard({
  title,
  value,
  description,
  freshness,
  drillDownHref,
  drillDownLabel,
}: {
  title: string;
  value: string;
  description: string;
  freshness: string;
  drillDownHref: string;
  drillDownLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{freshness}</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <a href={drillDownHref}>
            {drillDownLabel}
            <ChevronRightIcon data-icon="inline-end" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

function MetricLoadingGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Card aria-busy="true" key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OverviewLoadingSkeleton() {
  return (
    <div className="grid gap-4">
      <MetricLoadingGrid />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function OverviewStatusItem({
  label,
  value,
  detail,
  badge,
  badgeVariant = "secondary",
}: {
  label: string;
  value: string;
  detail: string;
  badge?: string | undefined;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-lg font-semibold">{value}</span>
        {badge && (
          <Badge className="shrink-0" variant={badgeVariant}>
            {badge}
          </Badge>
        )}
      </div>
      <p className="line-clamp-2 break-all text-sm text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}
function PrivacyOnboardingCard({
  snapshot,
  onRouteChange,
}: {
  snapshot: LocalAppSnapshot;
  onRouteChange: (routeId: RouteId) => void;
}) {
  const tokenStatus = tokenStateLabel(snapshot.config.token);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle>Privacy-first local setup</CardTitle>
        <CardDescription>
          Review where sensitive data lives before connecting a Monobank token
          or syncing statements.
        </CardDescription>
        <CardAction>
          <Badge variant="outline">No cloud account required</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-border bg-background/80 p-3">
            <DatabaseIcon className="mb-2 size-4 text-primary" />
            <p className="text-sm font-medium">Local database</p>
            <p className="break-all text-sm text-muted-foreground">
              {snapshot.config.databasePath}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background/80 p-3">
            <ShieldCheckIcon className="mb-2 size-4 text-primary" />
            <p className="text-sm font-medium">Token control</p>
            <p className="text-sm text-muted-foreground">
              {tokenStatus.description}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background/80 p-3">
            <DownloadIcon className="mb-2 size-4 text-primary" />
            <p className="text-sm font-medium">Portable records</p>
            <p className="text-sm text-muted-foreground">
              Backups and exports stay as local files you control.
            </p>
          </div>
        </div>
        <Alert>
          <ShieldCheckIcon />
          <AlertTitle>Local-first privacy model</AlertTitle>
          <AlertDescription>
            Tokens, raw Monobank payloads, ledger data, backups, and exports
            stay on this machine. There is no hosted token relay or required
            cloud account for local setup.
          </AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => onRouteChange("settings")}>
          <ShieldCheckIcon data-icon="inline-start" />
          Review privacy settings
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onRouteChange("sync")}
        >
          <RefreshCwIcon data-icon="inline-start" />
          Continue to sync
        </Button>
      </CardFooter>
    </Card>
  );
}

function budgetProgressBadgeVariant(
  status: LocalAppSnapshot["budgetProgress"][number]["status"],
) {
  switch (status) {
    case "overspent":
      return "destructive";
    case "near_limit":
      return "secondary";
    case "on_track":
      return "outline";
  }
}

function budgetProgressStatusLabel(
  status: LocalAppSnapshot["budgetProgress"][number]["status"],
): string {
  switch (status) {
    case "overspent":
      return "Overspent";
    case "near_limit":
      return "Near limit";
    case "on_track":
      return "On track";
  }
}

function currentBudgetMonth(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${now.getFullYear()}-${month}`;
}

function previousBudgetMonth(month: string): string {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const previous = new Date(Date.UTC(year, monthIndex - 1, 1));
  const yyyy = previous.getUTCFullYear();
  const mm = String(previous.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function nextBudgetMonth(periodStart: string): string {
  const parsed = new Date(`${periodStart}T00:00:00`);

  if (!Number.isFinite(parsed.getTime())) {
    return currentBudgetMonth();
  }

  const next = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 1);

  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function minorAmountToInputValue(amount: number): string {
  return (amount / 100).toFixed(2).replace(/\.?0+$/, "");
}

function BudgetProgressCard({
  snapshot,
  onRefresh,
}: {
  snapshot: LocalAppSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const rows = snapshot.budgetProgress.slice(0, 6);
  const categories = snapshot.categories.filter(
    (category) => category.id !== "uncategorized",
  );
  const defaultCategoryId = categories[0]?.id ?? "";
  const defaultCurrencyCode =
    snapshot.accounts[0]?.currencyCode ??
    snapshot.categorySpending[0]?.currencyCode ??
    980;
  const suggestedCategories = snapshot.categorySpending
    .filter((category) => isExpenseCategory(category.categoryId))
    .slice(0, 4);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [month, setMonth] = useState(currentBudgetMonth);
  const [amount, setAmount] = useState("");
  const [rollover, setRollover] = useState(false);
  const [deletingBudgetPeriodId, setDeletingBudgetPeriodId] = useState<
    string | null
  >(null);
  const [actingBudgetPeriodId, setActingBudgetPeriodId] = useState<
    string | null
  >(null);
  const [copyFromPrevState, setCopyFromPrevState] = useState<"idle" | "saving">(
    "idle",
  );
  const [applyToNMonths, setApplyToNMonths] = useState<Record<string, number>>(
    {},
  );
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "saving" }
    | { state: "deleting" }
    | { state: "error"; message: string }
    | { state: "saved"; message: string }
  >({ state: "idle" });
  const suggestedSpend = snapshot.categorySpending.find(
    (category) =>
      category.categoryId === categoryId &&
      category.currencyCode === defaultCurrencyCode,
  );
  const suggestedLimit = suggestedSpend
    ? Math.ceil((suggestedSpend.amount * 1.1) / 100) * 100
    : undefined;

  useEffect(() => {
    if (!categoryId && defaultCategoryId) {
      setCategoryId(defaultCategoryId);
    }
  }, [categoryId, defaultCategoryId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedAmount = Number(amount);

    if (!categoryId || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setStatus({
        state: "error",
        message: "Choose a category and enter a positive monthly limit.",
      });
      return;
    }

    setStatus({ state: "saving" });

    try {
      await createMonthlyCategoryBudget({
        categoryId,
        currencyCode: defaultCurrencyCode,
        month,
        amountLimit: Math.round(parsedAmount * 100),
        rollover,
      });
      setAmount("");
      setRollover(false);
      setStatus({ state: "saved", message: "Monthly budget saved." });
      await onRefresh();
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Monthly budget could not be saved.",
      });
    }
  }

  async function onDelete(budgetPeriodId: string) {
    if (deletingBudgetPeriodId !== null) {
      return;
    }

    const row = rows.find((item) => item.id === budgetPeriodId);

    if (
      row === undefined ||
      !window.confirm(
        `Delete budget for ${row.categoryName} (${row.periodStart}…${row.periodEnd})?`,
      )
    ) {
      return;
    }

    setDeletingBudgetPeriodId(budgetPeriodId);
    setStatus({ state: "deleting" });

    try {
      await deleteMonthlyCategoryBudget(row.id);
      setStatus({ state: "saved", message: "Monthly budget deleted." });
      await onRefresh();
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Monthly budget could not be deleted.",
      });
    } finally {
      setDeletingBudgetPeriodId(null);
    }
  }

  async function copyBudgetToNextMonth(
    row: LocalAppSnapshot["budgetProgress"][number],
  ) {
    if (actingBudgetPeriodId !== null) {
      return;
    }

    setActingBudgetPeriodId(row.id);
    setStatus({ state: "saving" });

    try {
      await createMonthlyCategoryBudget({
        categoryId: row.categoryId,
        currencyCode: row.currencyCode,
        month: nextBudgetMonth(row.periodStart),
        amountLimit: row.amountLimit,
        rollover: false,
      });
      setStatus({ state: "saved", message: "Budget copied to next month." });
      await onRefresh();
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Budget could not be copied.",
      });
    } finally {
      setActingBudgetPeriodId(null);
    }
  }

  async function copyBudgetToFutureMonths(
    row: LocalAppSnapshot["budgetProgress"][number],
    monthsAhead: number,
  ) {
    if (actingBudgetPeriodId !== null) {
      return;
    }
    if (monthsAhead < 1) {
      return;
    }

    setActingBudgetPeriodId(row.id);
    setStatus({ state: "saving" });

    let cursor = row.periodStart;
    try {
      for (let index = 0; index < monthsAhead; index += 1) {
        cursor = nextBudgetMonth(cursor);
        await createMonthlyCategoryBudget({
          categoryId: row.categoryId,
          currencyCode: row.currencyCode,
          month: cursor,
          amountLimit: row.amountLimit,
          rollover: false,
        });
      }
      setStatus({
        state: "saved",
        message:
          monthsAhead === 1
            ? "Budget copied to next month."
            : `Budget copied to ${monthsAhead} future months.`,
      });
      await onRefresh();
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Budget could not be copied.",
      });
    } finally {
      setActingBudgetPeriodId(null);
    }
  }

  async function copyPreviousMonthBudgetsToCurrent() {
    if (copyFromPrevState === "saving") {
      return;
    }

    const currentMonth = currentBudgetMonth();
    const previousMonth = previousBudgetMonth(currentMonth);
    const previousMonthRows = snapshot.budgetProgress.filter(
      (row) => row.periodStart === previousMonth,
    );

    if (previousMonthRows.length === 0) {
      setStatus({
        state: "error",
        message: `No budgets found in ${previousMonth} to copy.`,
      });
      return;
    }

    setCopyFromPrevState("saving");
    setStatus({ state: "saving" });

    try {
      for (const row of previousMonthRows) {
        await createMonthlyCategoryBudget({
          categoryId: row.categoryId,
          currencyCode: row.currencyCode,
          month: currentMonth,
          amountLimit: row.amountLimit,
          rollover: row.rollover === true,
        });
      }
      setStatus({
        state: "saved",
        message: `Copied ${previousMonthRows.length} budget${
          previousMonthRows.length === 1 ? "" : "s"
        } from ${previousMonth} to ${currentMonth}.`,
      });
      await onRefresh();
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Previous-month budgets could not be copied.",
      });
    } finally {
      setCopyFromPrevState("idle");
    }
  }

  async function updateBudgetPeriodStatus(
    row: LocalAppSnapshot["budgetProgress"][number],
    nextStatus: "open" | "closed",
  ) {
    if (actingBudgetPeriodId !== null) {
      return;
    }

    setActingBudgetPeriodId(row.id);
    setStatus({ state: "saving" });

    try {
      if (nextStatus === "closed") {
        await closeMonthlyBudgetPeriod(row.id);
        setStatus({ state: "saved", message: "Budget month closed." });
      } else {
        await reopenMonthlyBudgetPeriod(row.id);
        setStatus({ state: "saved", message: "Budget month reopened." });
      }

      await onRefresh();
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Budget period could not be updated.",
      });
    } finally {
      setActingBudgetPeriodId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget progress</CardTitle>
        <CardDescription>
          Current budget periods ranked by overspend risk.
        </CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={copyFromPrevState === "saving"}
            onClick={() => void copyPreviousMonthBudgetsToCurrent()}
            data-testid="budget-copy-from-prev-month"
          >
            <CopyIcon data-icon="inline-start" />
            Copy from previous month
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form
          className="grid gap-2 rounded-md border border-border p-3"
          onSubmit={(event) => void onSubmit(event)}
        >
          <div className="grid gap-1">
            <p className="text-sm font-medium">Set up a monthly spend budget</p>
            <p className="text-xs text-muted-foreground">
              Choose month, currency, category, target limit, and rollover.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger aria-label="Budget category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Input
              aria-label="Budget month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
            <Input
              aria-label="Monthly budget limit"
              inputMode="decimal"
              min="0"
              placeholder="Limit"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <Button
              type="submit"
              disabled={status.state === "saving" || categories.length === 0}
            >
              <PlusIcon />
              Add
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Rollover remaining budget from previous month
            </span>
            <Toggle
              aria-label="Enable budget rollover"
              pressed={rollover}
              onPressedChange={setRollover}
            />
          </div>
          {suggestedLimit !== undefined ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-2">
              <span className="text-xs text-muted-foreground">
                Suggested from history:{" "}
                {formatMinorAmount(suggestedLimit, defaultCurrencyCode)}
              </span>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => {
                  setAmount(minorAmountToInputValue(suggestedLimit));
                }}
              >
                Use suggested
              </Button>
            </div>
          ) : suggestedCategories.length > 0 ? (
            <div className="grid gap-2 rounded-md bg-muted/50 p-2">
              <p className="text-xs text-muted-foreground">
                Suggested categories from local history
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestedCategories.map((category) => (
                  <Button
                    key={`${category.categoryId}:${category.currencyCode}`}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCategoryId(category.categoryId);
                      setAmount(
                        minorAmountToInputValue(
                          Math.ceil((category.amount * 1.1) / 100) * 100,
                        ),
                      );
                    }}
                  >
                    {category.categoryName}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {status.state === "error" ? (
            <p className="text-xs text-destructive">{status.message}</p>
          ) : status.state === "saved" ? (
            <p className="text-xs text-muted-foreground">{status.message}</p>
          ) : null}
        </form>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active budget periods found in the current ledger.
          </p>
        ) : (
          rows.map((row) => {
            const width = Math.min(Math.max(row.progressPercentage, 2), 100);
            const href = buildTransactionFiltersHash({
              ...defaultTransactionFilters(),
              categoryId: row.categoryId,
              dateFrom: row.periodStart,
              dateTo: row.periodEnd,
            });
            const recurringDue = snapshot.upcomingRecurringPayments
              .filter((payment) => payment.categoryId === row.categoryId)
              .reduce(
                (total, payment) =>
                  total + Math.abs(recurringExpectedAmount(payment)),
                0,
              );
            const topTransactions = snapshot.transactions.entries
              .filter((entry) => entry.categoryId === row.categoryId)
              .sort(
                (left, right) => Math.abs(right.amount) - Math.abs(left.amount),
              )
              .slice(0, 3);

            return (
              <div
                className="grid gap-2 rounded-md border border-border p-3"
                key={row.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.categoryName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.periodStart} through {row.periodEnd}
                    </p>
                  </div>
                  <Badge variant={budgetProgressBadgeVariant(row.status)}>
                    {budgetProgressStatusLabel(row.status)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">
                    {formatMinorAmount(row.actualAmount, row.currencyCode)} /{" "}
                    {formatMinorAmount(row.amountLimit, row.currencyCode)}
                  </span>
                  <span className="font-medium">{row.progressPercentage}%</span>
                </div>
                <div className="grid gap-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <span>
                    Remaining{" "}
                    {formatMinorAmount(row.remainingAmount, row.currencyCode)}
                  </span>
                  <span>
                    Recurring due{" "}
                    {formatMinorAmount(recurringDue, row.currencyCode)}
                  </span>
                  <span>
                    Free-to-spend impact{" "}
                    {formatMinorAmount(
                      Math.max(0, row.remainingAmount - recurringDue),
                      row.currencyCode,
                    )}
                  </span>
                </div>
                {topTransactions.length > 0 ? (
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    {topTransactions.map((entry) => (
                      <div
                        className="flex items-center justify-between gap-3"
                        key={entry.id}
                      >
                        <span className="truncate">
                          {entry.merchantName ?? entry.description}
                        </span>
                        <span className="font-medium tabular-nums">
                          {formatMinorAmount(entry.amount, entry.currencyCode)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      row.status === "overspent"
                        ? "h-full rounded-full bg-destructive"
                        : "h-full rounded-full bg-expense"
                    }
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={href}>Transactions</a>
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    step={1}
                    value={String(applyToNMonths[row.id] ?? 1)}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const parsed = Number.parseInt(raw, 10);
                      setApplyToNMonths((current) => ({
                        ...current,
                        [row.id]:
                          Number.isFinite(parsed) && parsed >= 1
                            ? Math.min(24, parsed)
                            : 1,
                      }));
                    }}
                    className="w-16"
                    aria-label={`Months ahead to copy budget for ${row.categoryName}`}
                    data-testid={`budget-apply-to-n-months-${row.id}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={actingBudgetPeriodId === row.id}
                    onClick={() =>
                      void copyBudgetToFutureMonths(
                        row,
                        applyToNMonths[row.id] ?? 1,
                      )
                    }
                    data-testid={`budget-copy-to-month-${row.id}`}
                  >
                    Copy forward
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={actingBudgetPeriodId === row.id}
                    onClick={() =>
                      void updateBudgetPeriodStatus(
                        row,
                        row.periodStatus === "closed" ? "open" : "closed",
                      )
                    }
                  >
                    {row.periodStatus === "closed" ? "Reopen" : "Close"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={deletingBudgetPeriodId === row.id}
                    aria-label={`Delete budget for ${row.categoryName} in ${row.periodStart} through ${row.periodEnd}`}
                    onClick={() => void onDelete(row.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function NetWorthTrendCard({ snapshot }: { snapshot: LocalAppSnapshot }) {
  if (
    !snapshot.netWorthTrend.enabled ||
    snapshot.netWorthTrend.points.length === 0
  ) {
    return null;
  }

  const points = snapshot.netWorthTrend.points.slice(-8);
  const amounts = points.map((point) => point.amount);
  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);
  const latest = points[points.length - 1];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Net worth trend</CardTitle>
        <CardDescription>
          Manual accounts and assets included in local net worth history.
        </CardDescription>
        {latest ? (
          <CardAction>
            <Badge variant="outline">
              {formatMinorAmount(latest.amount, latest.currencyCode)}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="flex h-32 items-end gap-2">
          {points.map((point) => {
            const range = maxAmount - minAmount;
            const height =
              range > 0 ? 20 + ((point.amount - minAmount) / range) * 80 : 60;

            return (
              <div
                className="flex min-w-0 flex-1 flex-col items-center gap-2"
                key={`${point.date}:${point.currencyCode}`}
              >
                <div
                  className="w-full rounded-t-md bg-primary"
                  style={{ height: `${height}%` }}
                />
                <span className="truncate text-xs text-muted-foreground">
                  {point.date}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewRoute({
  snapshot,
  loading,
  onRouteChange,
  onRefresh,
}: {
  snapshot: LocalAppSnapshot | undefined;
  loading: boolean;
  onRouteChange: (routeId: RouteId) => void;
  onRefresh: () => Promise<void>;
}) {
  if (loading && !snapshot) {
    return <OverviewLoadingSkeleton />;
  }

  if (!snapshot) {
    return null;
  }

  const transactionsHref = buildTransactionFiltersHash(
    defaultTransactionFilters(),
  );
  const monthToDate = snapshot.summary.monthToDate;
  const monthFilters = {
    ...defaultTransactionFilters(),
    dateFrom: monthToDate.from === "cached" ? "" : monthToDate.from,
    dateTo: monthToDate.to === "cached" ? "" : monthToDate.to,
  };
  const incomeHref = buildTransactionFiltersHash({
    ...monthFilters,
    amountMin: "0.01",
  });
  const expensesHref = buildTransactionFiltersHash({
    ...monthFilters,
    amountMax: "-0.01",
  });
  const monthHref = buildTransactionFiltersHash(monthFilters);
  const monthDetail =
    monthToDate.from === "cached"
      ? "Cached snapshot totals"
      : `${monthToDate.from} through ${monthToDate.to}`;
  const freshness = dataFreshnessLabel(snapshot.summary.lastSyncedAt);
  const webhookHints = snapshot.webhookEvents.length;
  const databaseHealth = snapshot.health.status;
  const showPrivacyOnboarding =
    snapshot.summary.accounts === 0 && snapshot.summary.ledgerEntries === 0;

  return (
    <div className="flex flex-col gap-4">
      {showPrivacyOnboarding ? (
        <PrivacyOnboardingCard
          snapshot={snapshot}
          onRouteChange={onRouteChange}
        />
      ) : null}

      <DailyMoneyPillStrip snapshot={snapshot} />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <SafeToSpendCard snapshot={snapshot} />
        <ToReviewOverviewCard snapshot={snapshot} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <BalanceProjectionOverviewCard snapshot={snapshot} />
        <UpcomingBillsStrip snapshot={snapshot} />
        <BudgetWatchlistOverviewCard
          snapshot={snapshot}
          onRefresh={onRefresh}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Accounts"
          value={String(snapshot.summary.accounts)}
          description={`${snapshot.accounts.length} local account records`}
          freshness={freshness}
          drillDownHref="#accounts"
          drillDownLabel="View accounts"
        />
        <MetricCard
          title="Transactions"
          value={String(snapshot.summary.ledgerEntries)}
          description={`${snapshot.transactions.total} rows available to review`}
          freshness={freshness}
          drillDownHref={transactionsHref}
          drillDownLabel="Review rows"
        />
        <MetricCard
          title="MTD income"
          value={formatMinorAmount(monthToDate.income)}
          description={monthDetail}
          freshness={freshness}
          drillDownHref={incomeHref}
          drillDownLabel="Review MTD income"
        />
        <MetricCard
          title="MTD expenses"
          value={formatMinorAmount(monthToDate.expenses)}
          description={monthDetail}
          freshness={freshness}
          drillDownHref={expensesHref}
          drillDownLabel="Review MTD expenses"
        />
        <MetricCard
          title="MTD net cashflow"
          value={formatMinorAmount(monthToDate.net)}
          description={monthDetail}
          freshness={monthToDate.month}
          drillDownHref={monthHref}
          drillDownLabel="Review month"
        />
      </div>

      <MonthToDateFinanceSummaryCard
        snapshot={snapshot}
        monthDetail={monthDetail}
        monthFilters={monthFilters}
      />

      <SyncHealthChart runs={snapshot.syncRuns} />

      <NetWorthTrendCard snapshot={snapshot} />

      <Card>
        <CardHeader>
          <CardTitle>Workspace status</CardTitle>
          <CardDescription>
            Local ledger state from the current app snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <OverviewStatusItem
            label="Connected accounts"
            value={String(snapshot.summary.accounts)}
            detail={`${snapshot.accounts.length} account records loaded locally`}
            badge={snapshot.config.source}
          />
          <OverviewStatusItem
            label="Synced transactions"
            value={String(snapshot.summary.ledgerEntries)}
            detail={`${snapshot.transactions.total} rows available for review`}
            badge="ledger"
          />
          <OverviewStatusItem
            label="Last sync"
            value={formatDateTime(snapshot.summary.lastSyncedAt)}
            detail={freshness}
            badge={snapshot.syncRuns[0]?.status ?? "none"}
            badgeVariant={statusVariant(snapshot.syncRuns[0]?.status ?? "")}
          />
          <OverviewStatusItem
            label="Webhook hints"
            value={String(webhookHints)}
            detail="Stored as pull-required hints before reconciliation"
            badge={webhookHints > 0 ? "pending" : "clear"}
          />
          <OverviewStatusItem
            label="Database health"
            value={databaseHealth}
            detail={snapshot.config.databasePath}
            badge={snapshot.config.localOnly ? "local" : undefined}
            badgeVariant={statusVariant(databaseHealth)}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>
              Local ledger rows from the latest Monobank sync.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TransactionTable
              entries={snapshot.transactions.entries.slice(
                0,
                OVERVIEW_TRANSACTION_LIMIT,
              )}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <RecentWebhookDeliveriesCard
            events={snapshot.webhookEvents}
            onRouteChange={onRouteChange}
          />
          <BudgetProgressCard snapshot={snapshot} onRefresh={onRefresh} />
          <RecurringDetectionCandidatesCard
            snapshot={snapshot}
            onRefresh={onRefresh}
          />
          <MissedRecurringPaymentsCard snapshot={snapshot} />
          <SubscriptionIncreaseAlertsCard snapshot={snapshot} />
          <UpcomingRecurringPaymentsCard snapshot={snapshot} />
          <RecurringCalendarCard snapshot={snapshot} />
          <CashflowReportCard snapshot={snapshot} />
          <SavingsRateReportCard snapshot={snapshot} />
          <BalanceProjectionReportCard snapshot={snapshot} />
          <CategoryTrendReportCard snapshot={snapshot} />
          <MerchantTrendReportCard snapshot={snapshot} />
          <MonthlySpendingReportCard snapshot={snapshot} />
          <CategorySpendingCard snapshot={snapshot} />
          <RecentSyncRunsCard
            runs={snapshot.syncRuns}
            onRouteChange={onRouteChange}
          />
        </div>
      </div>
    </div>
  );
}

export function CategoriesRoute({
  snapshot,
}: {
  snapshot: LocalAppSnapshot | undefined;
}) {
  if (!snapshot) {
    return null;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <CategorySpendingCard snapshot={snapshot} />
      <CategoryTrendReportCard snapshot={snapshot} />
    </div>
  );
}

export function BudgetsRoute({
  snapshot,
  onRefresh,
}: {
  snapshot: LocalAppSnapshot | undefined;
  onRefresh: () => Promise<void>;
}) {
  if (!snapshot) {
    return null;
  }

  return <BudgetProgressCard snapshot={snapshot} onRefresh={onRefresh} />;
}

function reviewStateHash(
  reviewState: TransactionFilterFormState["reviewState"],
) {
  return buildTransactionFiltersHash({
    ...defaultTransactionFilters(),
    reviewState,
  });
}

function endOfMonthDateKey(date: Date): string {
  return dateInputValue(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function recurringExpectedAmount(payment: {
  expectedAmountMin?: number;
  expectedAmountMax?: number;
}): number {
  return payment.expectedAmountMax ?? payment.expectedAmountMin ?? 0;
}

function isExpenseCategory(categoryId: string | undefined): boolean {
  return categoryId !== "income" && categoryId !== "transfers";
}

function isExpenseRecurring(payment: {
  categoryId?: string;
  expectedAmountMin?: number;
  expectedAmountMax?: number;
}): boolean {
  const amount = recurringExpectedAmount(payment);

  return amount < 0 || isExpenseCategory(payment.categoryId);
}

function projectionSparklineSegments(
  points: readonly { projectedBalance: number }[],
): { left: string; top: string; width: string; rotate: string }[] {
  if (points.length < 2) {
    return [];
  }

  const balances = points.map((point) => point.projectedBalance);
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const range = Math.max(1, max - min);
  const normalizedPoints = points.map((point, index) => ({
    x: (index / (points.length - 1)) * 100,
    y: 100 - ((point.projectedBalance - min) / range) * 100,
  }));

  return normalizedPoints.slice(1).map((point, index) => {
    const previous = normalizedPoints[index] ?? point;
    const deltaX = point.x - previous.x;
    const deltaY = point.y - previous.y;
    const width = Math.hypot(deltaX, deltaY);
    const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;

    return {
      left: `${previous.x.toFixed(2)}%`,
      top: `${previous.y.toFixed(2)}%`,
      width: `${width.toFixed(2)}%`,
      rotate: `${angle.toFixed(2)}deg`,
    };
  });
}

function BalanceSparkline({
  points,
  label,
  className = "h-16",
}: {
  points: readonly { projectedBalance: number }[];
  label: string;
  className?: string;
}) {
  const segments = projectionSparklineSegments(points);

  return (
    <div
      aria-label={label}
      className={`${className} relative w-full overflow-hidden rounded-md border border-border bg-muted/20 p-2`}
      role="img"
    >
      {segments.length === 0 ? (
        <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          No balance points
        </span>
      ) : (
        <div className="absolute inset-x-3 inset-y-3">
          {segments.map((segment, index) => (
            <span
              className="absolute block h-0.5 rounded-full bg-foreground"
              key={`${segment.left}-${segment.top}-${index}`}
              style={{
                left: segment.left,
                top: segment.top,
                transform: `rotate(${segment.rotate})`,
                transformOrigin: "left center",
                width: segment.width,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function reviewCandidateCount(
  candidates: readonly LedgerEntryReviewCandidate[],
  kind: LedgerEntryReviewCandidate["kind"],
): number {
  return candidates.filter((candidate) => candidate.kind === kind).length;
}

function DailyMoneyPillStrip({ snapshot }: { snapshot: LocalAppSnapshot }) {
  const [todayTotals, setTodayTotals] = useState<{
    income: number;
    expenses: number;
    net: number;
    uncategorized: number;
  }>({
    income: 0,
    expenses: 0,
    net: 0,
    uncategorized: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const today = dateInputValue(new Date());
    const from = dateInputToEpoch(today);
    const to = dateInputToEpoch(today, true);

    void Promise.all([
      loadLedgerTransactions({
        status: "posted",
        limit: 500,
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
      }),
      loadLedgerTransactions({
        categoryId: "uncategorized",
        reviewState: "needs_review",
        limit: 1,
      }),
    ])
      .then(([todayPage, uncategorizedPage]) => {
        if (cancelled) {
          return;
        }

        const income = todayPage.entries.reduce(
          (total, entry) => total + (entry.amount > 0 ? entry.amount : 0),
          0,
        );
        const expenses = todayPage.entries.reduce(
          (total, entry) => total + (entry.amount < 0 ? -entry.amount : 0),
          0,
        );

        setTodayTotals({
          income,
          expenses,
          net: income - expenses,
          uncategorized: uncategorizedPage.total,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setTodayTotals({
            income: 0,
            expenses: 0,
            net: 0,
            uncategorized: 0,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [snapshot.summary.lastSyncedAt, snapshot.summary.ledgerEntries]);

  const latestRun = snapshot.syncRuns.find((run) =>
    ["success", "partial"].includes(run.status),
  );
  const changedSinceLastSync = latestRun
    ? latestRun.itemsInserted + latestRun.itemsUpdated
    : 0;

  const pills = [
    {
      label: "Today income",
      value: formatMinorAmount(todayTotals.income),
      className: "text-income-foreground",
    },
    {
      label: "Today expenses",
      value: formatMinorAmount(todayTotals.expenses),
      className: "text-expense-foreground",
    },
    {
      label: "Today net",
      value: formatMinorAmount(todayTotals.net),
      className: amountSemanticTextClassName(todayTotals.net),
    },
    {
      label: "Since last sync",
      value: String(changedSinceLastSync),
      className: "text-foreground",
    },
    {
      label: "Uncategorized",
      value: String(todayTotals.uncategorized),
      className:
        todayTotals.uncategorized > 0 ? "text-warning" : "text-foreground",
      href: buildTransactionFiltersHash({
        ...defaultTransactionFilters(),
        categoryId: "uncategorized",
        reviewState: "needs_review",
      }),
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {pills.map((pill) => {
        const content = (
          <div className="rounded-md border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{pill.label}</p>
            <p
              className={`mt-1 truncate text-sm font-semibold ${pill.className}`}
            >
              {pill.value}
            </p>
          </div>
        );

        return pill.href ? (
          <a
            className="transition-colors hover:bg-muted/50"
            href={pill.href}
            key={pill.label}
          >
            {content}
          </a>
        ) : (
          <div key={pill.label}>{content}</div>
        );
      })}
    </div>
  );
}

function SafeToSpendCard({ snapshot }: { snapshot: LocalAppSnapshot }) {
  const budgetRows = snapshot.budgetProgress.filter((budget) =>
    isExpenseCategory(budget.categoryId),
  );
  const recurringExpenses = snapshot.upcomingRecurringPayments
    .filter(isExpenseRecurring)
    .reduce(
      (total, payment) => total + Math.abs(recurringExpectedAmount(payment)),
      0,
    );
  const currencyCode = budgetRows[0]?.currencyCode ?? 980;
  const budgetRemaining = budgetRows.reduce(
    (total, budget) => total + Math.max(0, budget.remainingAmount),
    0,
  );
  const safeToSpend = Math.max(0, budgetRemaining - recurringExpenses);
  const unavailableReason =
    budgetRows.length === 0
      ? "Create monthly budgets to calculate a conservative rest-of-month number."
      : snapshot.upcomingRecurringPayments.length === 0
        ? "Confirm recurring bills to reserve committed spend before month end."
        : undefined;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle>Safe to spend</CardTitle>
        <CardDescription>
          Budget room after upcoming committed payments.
        </CardDescription>
        <CardAction>
          <Badge variant={unavailableReason ? "secondary" : "success"}>
            {unavailableReason ? "Setup needed" : "Conservative"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <p className="text-lg font-semibold tabular-nums">
            {unavailableReason
              ? "Unavailable"
              : formatMinorAmount(safeToSpend, currencyCode)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {unavailableReason ??
              `${formatMinorAmount(budgetRemaining, currencyCode)} budget room minus ${formatMinorAmount(
                recurringExpenses,
                currencyCode,
              )} reserved for upcoming recurrings.`}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <OverviewStatusItem
            label="Budget room"
            value={formatMinorAmount(budgetRemaining, currencyCode)}
            detail={`${budgetRows.length} active spend budgets`}
          />
          <OverviewStatusItem
            label="Reserved"
            value={formatMinorAmount(recurringExpenses, currencyCode)}
            detail={`${snapshot.upcomingRecurringPayments.length} upcoming streams`}
          />
          <OverviewStatusItem
            label="Month"
            value={snapshot.summary.monthToDate.month}
            detail={`${snapshot.summary.monthToDate.from} through ${snapshot.summary.monthToDate.to}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ToReviewOverviewCard({ snapshot }: { snapshot: LocalAppSnapshot }) {
  const [reviewPage, setReviewPage] = useState<LedgerEntryPage | undefined>();

  useEffect(() => {
    let cancelled = false;

    void loadLedgerTransactions({
      reviewState: "needs_review",
      limit: 500,
      sortBy: "time",
      sortDirection: "desc",
    })
      .then((page) => {
        if (!cancelled) {
          setReviewPage(page);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReviewPage(snapshot.transactions);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    snapshot.summary.lastSyncedAt,
    snapshot.summary.ledgerEntries,
    snapshot.transactions,
  ]);

  const entries = reviewPage?.entries ?? snapshot.transactions.entries;
  const candidates = findLedgerEntryReviewCandidates(entries);
  const uncategorizedCount = entries.filter(
    (entry) => !entry.categoryId || entry.categoryId === "uncategorized",
  ).length;
  const largeExpenseCount = entries.filter(
    (entry) => entry.amount <= -100_000,
  ).length;
  const duplicateCount = reviewCandidateCount(candidates, "duplicate");
  const transferCount = reviewCandidateCount(candidates, "transfer");
  const latestRun = snapshot.syncRuns.find((run) =>
    ["success", "partial"].includes(run.status),
  );
  const changedSinceLastSync = latestRun
    ? latestRun.itemsInserted + latestRun.itemsUpdated
    : 0;

  const counts = [
    { label: "Needs review", value: reviewPage?.total ?? entries.length },
    { label: "Uncategorized", value: uncategorizedCount },
    { label: "Large expenses", value: largeExpenseCount },
    { label: "Duplicates", value: duplicateCount },
    { label: "Transfers", value: transferCount },
    {
      label: "Recurring candidates",
      value: snapshot.recurringDetectionCandidates.length,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>To review</CardTitle>
        <CardDescription>
          {changedSinceLastSync} rows changed in the latest sync.
        </CardDescription>
        <CardAction>
          <Button asChild size="sm">
            <a href={reviewStateHash("needs_review")}>
              Review all
              <ChevronRightIcon data-icon="inline-end" />
            </a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {counts.map((item) => (
            <a
              className="rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
              href={
                item.label === "Uncategorized"
                  ? buildTransactionFiltersHash({
                      ...defaultTransactionFilters(),
                      categoryId: "uncategorized",
                      reviewState: "needs_review",
                    })
                  : item.label === "Large expenses"
                    ? buildTransactionFiltersHash({
                        ...defaultTransactionFilters(),
                        amountMax: "-1000.00",
                        reviewState: "needs_review",
                      })
                    : reviewStateHash("needs_review")
              }
              key={item.label}
            >
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-lg font-semibold">{item.value}</p>
            </a>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Use selected-row bulk actions in Transactions to mark reviewed,
          ignore, or move rows back to review.
        </p>
      </CardContent>
    </Card>
  );
}

function BalanceProjectionOverviewCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const report = snapshot.balanceProjectionReport;
  const totals = report.totals.slice(0, 3);
  const events = report.events
    .slice()
    .sort(
      (left, right) =>
        Math.abs(right.projectedAmount) - Math.abs(left.projectedAmount),
    )
    .slice(0, 3);
  const sparklinePoints = report.points.slice(0, 30);

  return (
    <Card>
      <CardHeader>
        <CardTitle>30-day balance projection</CardTitle>
        <CardDescription>
          {report.from} through {report.to}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
          <div className="grid gap-2">
            {totals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Confirm recurring schedules to project month-end balances.
              </p>
            ) : (
              totals.map((total) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                  key={total.currencyCode}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {currencyLabel(total.currencyCode)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Today{" "}
                      {formatMinorAmount(
                        total.currentBalance,
                        total.currencyCode,
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {formatMinorAmount(
                        total.projectedBalance,
                        total.currencyCode,
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Projected</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <BalanceSparkline
            className="h-24"
            label="Projected balance sparkline"
            points={sparklinePoints}
          />
        </div>
        {events.length > 0 ? (
          <div className="grid gap-2">
            {events.map((event) => (
              <div
                className="flex items-center justify-between gap-3 text-sm"
                key={event.id}
              >
                <span className="truncate text-muted-foreground">
                  {event.merchantName ?? event.recurringItemId} · {event.date}
                </span>
                <span className="font-medium tabular-nums">
                  {formatMinorAmount(event.projectedAmount, event.currencyCode)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UpcomingBillsStrip({ snapshot }: { snapshot: LocalAppSnapshot }) {
  const rows = snapshot.upcomingRecurringPayments.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming bills</CardTitle>
        <CardDescription>Next expected recurring payments.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Confirm recurring suggestions or add manual streams to see upcoming
            bills.
          </p>
        ) : (
          <div className="grid gap-2">
            {rows.map((payment) => (
              <a
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                href={buildTransactionFiltersHash({
                  ...defaultTransactionFilters(),
                  accountId: payment.accountId,
                  ...(payment.categoryId
                    ? { categoryId: payment.categoryId }
                    : {}),
                  ...(payment.merchantName
                    ? { merchantName: payment.merchantName }
                    : {}),
                })}
                key={payment.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {payment.merchantName ?? payment.recurringItemId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(Date.parse(payment.nextDueAt) / 1000)} ·{" "}
                    {payment.frequency}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {recurringPaymentAmountLabel(payment)}
                  </p>
                  <Badge
                    variant={payment.isOverdue ? "destructive" : "secondary"}
                  >
                    {payment.isOverdue
                      ? "Missed"
                      : recurringPaymentDueLabel(payment)}
                  </Badge>
                </div>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BudgetWatchlistOverviewCard({
  snapshot,
  onRefresh,
}: {
  snapshot: LocalAppSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const rows = snapshot.budgetProgress
    .filter((budget) => isExpenseCategory(budget.categoryId))
    .slice()
    .sort((left, right) => right.progressPercentage - left.progressPercentage)
    .slice(0, 3);
  const suggestedCategories = snapshot.categorySpending
    .filter((category) => isExpenseCategory(category.categoryId))
    .slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget watchlist</CardTitle>
        <CardDescription>
          Spend categories closest to their limit.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              No active spend budgets yet. Start with categories already visible
              in local history.
            </p>
            <div className="grid gap-2">
              {suggestedCategories.map((category) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                  key={`${category.categoryId}:${category.currencyCode}`}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {category.categoryName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Suggested from {category.transactionCount} transactions
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatMinorAmount(category.amount, category.currencyCode)}
                  </p>
                </div>
              ))}
            </div>
            <Button asChild variant="outline">
              <a href="#budgets">
                Set up budgets
                <ChevronRightIcon data-icon="inline-end" />
              </a>
            </Button>
          </div>
        ) : (
          rows.map((row) => {
            const recurringDue = snapshot.upcomingRecurringPayments
              .filter((payment) => payment.categoryId === row.categoryId)
              .reduce(
                (total, payment) =>
                  total + Math.abs(recurringExpectedAmount(payment)),
                0,
              );
            const href = buildTransactionFiltersHash({
              ...defaultTransactionFilters(),
              categoryId: row.categoryId,
              dateFrom: row.periodStart,
              dateTo: row.periodEnd,
              amountMax: "-0.01",
            });

            return (
              <a
                className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                href={href}
                key={row.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.categoryName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatMinorAmount(row.remainingAmount, row.currencyCode)}{" "}
                      remaining ·{" "}
                      {formatMinorAmount(recurringDue, row.currencyCode)} still
                      due
                    </p>
                  </div>
                  <Badge variant={budgetProgressBadgeVariant(row.status)}>
                    {budgetProgressStatusLabel(row.status)}
                  </Badge>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      row.status === "overspent"
                        ? "h-full rounded-full bg-destructive"
                        : "h-full rounded-full bg-expense"
                    }
                    style={{
                      width: `${Math.min(Math.max(row.progressPercentage, 2), 100)}%`,
                    }}
                  />
                </div>
              </a>
            );
          })
        )}
        {rows.length > 0 ? (
          <Button
            className="w-fit"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              void onRefresh();
            }}
          >
            <RefreshCwIcon data-icon="inline-start" />
            Refresh budgets
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ReportsRoute({
  snapshot,
}: {
  snapshot: LocalAppSnapshot | undefined;
}) {
  if (!snapshot) {
    return null;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <MonthlySpendingReportCard snapshot={snapshot} />
      <CashflowReportCard snapshot={snapshot} />
      <SavingsRateReportCard snapshot={snapshot} />
      <BalanceProjectionReportCard snapshot={snapshot} />
      <CategoryTrendReportCard snapshot={snapshot} />
      <MerchantTrendReportCard snapshot={snapshot} />
    </div>
  );
}
