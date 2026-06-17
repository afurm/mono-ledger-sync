import { useEffect, useState } from "react";
import {
  ChevronRightIcon,
  FileClockIcon,
  RefreshCwIcon,
  TagsIcon,
  WalletCardsIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import {
  loadBalanceProjectionReport,
  loadCategoryTrendReport,
  loadCashflowReport,
  loadMerchantTrendReport,
  loadMonthlySpendingReport,
  loadSavingsRateReport,
} from "./api";
import type { LocalAppSnapshot } from "./api-types";
import { currencyLabel, formatDate, formatMinorAmount } from "./format";
import { amountSemanticTextClassName } from "./transaction-cells";

type TransactionFilterFormState = {
  search?: string;
  accountId?: string;
  categoryId?: string;
  merchantName?: string;
  status?: "all" | "hold" | "posted";
  reviewState?: "all" | "needs_review" | "reviewed" | "ignored";
  dateFrom?: string;
  dateTo?: string;
  amountMin?: string;
  amountMax?: string;
  page?: number;
  sortBy?: string;
  sortDirection?: string;
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

function recurringPaymentAmountLabel(payment: {
  expectedAmountMin?: number;
  expectedAmountMax?: number;
  currencyCode: number;
}): string {
  if (
    payment.expectedAmountMin !== undefined &&
    payment.expectedAmountMax !== undefined &&
    payment.expectedAmountMin !== payment.expectedAmountMax
  ) {
    return `${formatMinorAmount(
      payment.expectedAmountMin,
      payment.currencyCode,
    )} - ${formatMinorAmount(payment.expectedAmountMax, payment.currencyCode)}`;
  }

  const amount = payment.expectedAmountMax ?? payment.expectedAmountMin;

  return amount === undefined
    ? currencyLabel(payment.currencyCode)
    : formatMinorAmount(amount, payment.currencyCode);
}

function recurringPaymentDueLabel(
  payment: LocalAppSnapshot["upcomingRecurringPayments"][number],
): string {
  if (payment.daysUntilDue < 0) {
    return `${Math.abs(payment.daysUntilDue)}d overdue`;
  }

  if (payment.daysUntilDue === 0) {
    return "Due today";
  }

  return `Due in ${payment.daysUntilDue}d`;
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

function formatPercentage(value: number): string {
  return `${value.toFixed(2).replace(/\.?0+$/, "")}%`;
}

type ConvertedReportTotalField =
  | "totalIncome"
  | "totalExpenses"
  | "netCashflow"
  | "totalSavings"
  | "totalCurrentBalance"
  | "totalProjectedOutflows"
  | "totalProjectedBalance";

function convertedReportTotalLabel(
  convertedTotals:
    | ({
        baseCurrencyCode: number;
        missingCurrencyCodes: readonly number[];
      } & Partial<Record<ConvertedReportTotalField, number>>)
    | undefined,
  field: ConvertedReportTotalField,
): string | undefined {
  if (
    convertedTotals === undefined ||
    convertedTotals.missingCurrencyCodes.length > 0
  ) {
    return undefined;
  }

  const value = convertedTotals[field];

  return value === undefined
    ? undefined
    : formatMinorAmount(value, convertedTotals.baseCurrencyCode);
}

export function CategorySpendingCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const rows = snapshot.categorySpending.slice(0, 6);
  const maxAmount = Math.max(...rows.map((row) => row.amount), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by category</CardTitle>
        <CardDescription>
          Expense categories from the local ledger snapshot.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No expense categories found in the current ledger.
          </p>
        ) : (
          rows.map((row) => {
            const width =
              maxAmount > 0 ? Math.max(4, (row.amount / maxAmount) * 100) : 0;
            const href = buildTransactionFiltersHash({
              ...defaultTransactionFilters(),
              categoryId: row.categoryId,
              amountMax: "-0.01",
            });

            return (
              <a
                className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                href={href}
                key={`${row.categoryId}:${row.currencyCode}`}
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.categoryName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.transactionCount} transactions
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">
                      {formatMinorAmount(row.amount, row.currencyCode)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {currencyLabel(row.currencyCode)}
                    </p>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-expense"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </a>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function MonthToDateFinanceSummaryCard({
  snapshot,
  monthDetail,
  monthFilters,
}: {
  snapshot: LocalAppSnapshot;
  monthDetail: string;
  monthFilters: TransactionFilterFormState;
}) {
  const monthToDate = snapshot.summary.monthToDate;
  const monthHref = buildTransactionFiltersHash(monthFilters);
  const categoryRows = snapshot.monthlySpendingReport.categories.slice(0, 3);
  const budgetRows = snapshot.budgetProgress.slice(0, 3);
  const recurringRows = snapshot.upcomingRecurringPayments.slice(0, 3);
  const categoryDateFrom =
    monthFilters.dateFrom || snapshot.monthlySpendingReport.from;
  const categoryDateTo =
    monthFilters.dateTo || snapshot.monthlySpendingReport.to;
  const maxCategoryAmount = Math.max(
    ...categoryRows.map((row) => row.amount),
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Month-to-date finance</CardTitle>
        <CardDescription>{monthDetail}</CardDescription>
        <CardAction>
          <Button asChild size="sm" variant="outline">
            <a href={monthHref}>
              Review month cashflow
              <ChevronRightIcon data-icon="inline-end" />
            </a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Income</p>
            <p className="mt-1 truncate text-sm font-semibold tabular-nums text-income-foreground">
              {formatMinorAmount(monthToDate.income)}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Expenses</p>
            <p className="mt-1 truncate text-sm font-semibold tabular-nums text-expense-foreground">
              {formatMinorAmount(monthToDate.expenses)}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Net cashflow</p>
            <p
              className={`mt-1 truncate text-sm font-semibold tabular-nums ${amountSemanticTextClassName(monthToDate.net)}`}
            >
              {formatMinorAmount(monthToDate.net)}
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="grid gap-3 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <TagsIcon className="size-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">Top categories</h3>
                <p className="text-xs text-muted-foreground">
                  Month-to-date posted expenses.
                </p>
              </div>
            </div>
            {categoryRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No posted expenses found for this month.
              </p>
            ) : (
              categoryRows.map((row) => {
                const width =
                  maxCategoryAmount > 0
                    ? Math.max(4, (row.amount / maxCategoryAmount) * 100)
                    : 0;
                const href = buildTransactionFiltersHash({
                  ...defaultTransactionFilters(),
                  dateFrom: categoryDateFrom,
                  dateTo: categoryDateTo,
                  categoryId: row.categoryId,
                  amountMax: "-0.01",
                });

                return (
                  <a
                    className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                    href={href}
                    key={`${row.categoryId}:${row.currencyCode}`}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {row.categoryName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.transactionCount} rows · {row.sharePercentage}%
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatMinorAmount(row.amount, row.currencyCode)}
                      </p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-expense"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </a>
                );
              })
            )}
          </section>

          <section className="grid gap-3 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <WalletCardsIcon className="size-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">Budget watchlist</h3>
                <p className="text-xs text-muted-foreground">
                  Current periods ranked by local risk.
                </p>
              </div>
            </div>
            {budgetRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active budget periods found.
              </p>
            ) : (
              budgetRows.map((row) => {
                const width = Math.min(
                  Math.max(row.progressPercentage, 2),
                  100,
                );
                const href = buildTransactionFiltersHash({
                  ...defaultTransactionFilters(),
                  categoryId: row.categoryId,
                  dateFrom: row.periodStart,
                  dateTo: row.periodEnd,
                });

                return (
                  <a
                    className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                    href={href}
                    key={row.id}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {row.categoryName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatMinorAmount(
                            row.actualAmount,
                            row.currencyCode,
                          )}{" "}
                          /{" "}
                          {formatMinorAmount(row.amountLimit, row.currencyCode)}
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
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </a>
                );
              })
            )}
          </section>

          <section className="grid gap-3 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <FileClockIcon className="size-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">
                  Next recurring payments
                </h3>
                <p className="text-xs text-muted-foreground">
                  Active local schedules due soon.
                </p>
              </div>
            </div>
            {recurringRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming recurring payments found.
              </p>
            ) : (
              recurringRows.map((payment) => {
                const href = buildTransactionFiltersHash({
                  ...defaultTransactionFilters(),
                  accountId: payment.accountId,
                  ...(payment.categoryId === undefined
                    ? {}
                    : { categoryId: payment.categoryId }),
                  ...(payment.merchantName === undefined
                    ? {}
                    : { merchantName: payment.merchantName }),
                });

                return (
                  <a
                    className="flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                    href={href}
                    key={payment.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {payment.merchantName ?? payment.recurringItemId}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(Date.parse(payment.nextDueAt) / 1000)} ·{" "}
                        {payment.frequency}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {recurringPaymentAmountLabel(payment)}
                      </p>
                      <Badge
                        variant={
                          payment.isOverdue ? "destructive" : "secondary"
                        }
                      >
                        {recurringPaymentDueLabel(payment)}
                      </Badge>
                    </div>
                  </a>
                );
              })
            )}
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

export function MonthlySpendingReportCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const [selectedMonth, setSelectedMonth] = useState(
    snapshot.monthlySpendingReport.month,
  );
  const [report, setReport] = useState<
    LocalAppSnapshot["monthlySpendingReport"]
  >(snapshot.monthlySpendingReport);
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const rows = report.categories.slice(0, 6);
  const maxAmount = Math.max(...rows.map((row) => row.amount), 0);
  const singleCurrencyTotal =
    report.currencyTotals.length === 1 ? report.currencyTotals[0] : undefined;
  const convertedTotalLabel = convertedReportTotalLabel(
    report.convertedTotals,
    "totalExpenses",
  );
  const totalLabel =
    singleCurrencyTotal === undefined
      ? report.currencyTotals.length === 0
        ? "0"
        : (convertedTotalLabel ?? `${report.currencyTotals.length} currencies`)
      : formatMinorAmount(
          singleCurrencyTotal.amount,
          singleCurrencyTotal.currencyCode,
        );
  const averageLabel =
    singleCurrencyTotal === undefined
      ? report.transactionCount === 0
        ? "0"
        : "Mixed"
      : formatMinorAmount(
          singleCurrencyTotal.averageTransactionAmount,
          singleCurrencyTotal.currencyCode,
        );

  useEffect(() => {
    setSelectedMonth(snapshot.monthlySpendingReport.month);
    setReport(snapshot.monthlySpendingReport);
    setStatus({ state: "idle" });
  }, [snapshot.monthlySpendingReport]);

  async function refreshReport() {
    setStatus({ state: "loading" });

    try {
      setReport(await loadMonthlySpendingReport({ month: selectedMonth }));
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Monthly spending report could not be loaded.",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly spending report</CardTitle>
        <CardDescription>
          {report.from} through {report.to}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{report.month}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void refreshReport();
          }}
        >
          <Input
            aria-label="Report month"
            className="h-9 w-[150px]"
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
          />
          <Button disabled={status.state === "loading"} size="sm" type="submit">
            <RefreshCwIcon />
            {status.state === "loading" ? "Loading" : "Load"}
          </Button>
        </form>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Spent</p>
            <p className="mt-1 truncate text-sm font-semibold">{totalLabel}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="mt-1 text-sm font-semibold">
              {report.transactionCount}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Average</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {averageLabel}
            </p>
          </div>
        </div>

        {report.currencyTotals.length > 1 ? (
          <div className="grid gap-2">
            {report.currencyTotals.map((total) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                key={total.currencyCode}
              >
                <div>
                  <p className="text-sm font-medium">
                    {currencyLabel(total.currencyCode)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {total.transactionCount} transactions
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  {formatMinorAmount(total.amount, total.currencyCode)}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No expense transactions found for this month.
          </p>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => {
              const width =
                maxAmount > 0 ? Math.max(4, (row.amount / maxAmount) * 100) : 0;
              const href = buildTransactionFiltersHash({
                ...defaultTransactionFilters(),
                dateFrom: report.from,
                dateTo: report.to,
                categoryId: row.categoryId,
                amountMax: "-0.01",
              });

              return (
                <a
                  className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                  href={href}
                  key={`${row.categoryId}:${row.currencyCode}`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.categoryName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.transactionCount} transactions ·{" "}
                        {row.sharePercentage.toFixed(1).replace(/\.0$/, "")}%
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">
                        {formatMinorAmount(row.amount, row.currencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {currencyLabel(row.currencyCode)}
                      </p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-expense"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {status.state === "error" ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CashflowReportCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const [months, setMonths] = useState(String(snapshot.cashflowReport.months));
  const [report, setReport] = useState<LocalAppSnapshot["cashflowReport"]>(
    snapshot.cashflowReport,
  );
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const rows = report.points.slice(-8);
  const maxActivity = Math.max(
    ...rows.map((row) => row.income + row.expenses),
    0,
  );
  const singleCurrencyTotal =
    report.totals.length === 1 ? report.totals[0] : undefined;
  const convertedIncomeLabel = convertedReportTotalLabel(
    report.convertedTotals,
    "totalIncome",
  );
  const convertedExpenseLabel = convertedReportTotalLabel(
    report.convertedTotals,
    "totalExpenses",
  );
  const convertedNetLabel = convertedReportTotalLabel(
    report.convertedTotals,
    "netCashflow",
  );
  const incomeLabel =
    singleCurrencyTotal === undefined
      ? report.totals.length === 0
        ? "0"
        : (convertedIncomeLabel ?? `${report.totals.length} currencies`)
      : formatMinorAmount(
          singleCurrencyTotal.income,
          singleCurrencyTotal.currencyCode,
        );
  const expenseLabel =
    singleCurrencyTotal === undefined
      ? report.totals.length === 0
        ? "0"
        : (convertedExpenseLabel ?? `${report.totals.length} currencies`)
      : formatMinorAmount(
          singleCurrencyTotal.expenses,
          singleCurrencyTotal.currencyCode,
        );
  const netLabel =
    singleCurrencyTotal === undefined
      ? report.totals.length === 0
        ? "0"
        : (convertedNetLabel ?? "Mixed")
      : formatMinorAmount(
          singleCurrencyTotal.net,
          singleCurrencyTotal.currencyCode,
        );

  useEffect(() => {
    setMonths(String(snapshot.cashflowReport.months));
    setReport(snapshot.cashflowReport);
    setStatus({ state: "idle" });
  }, [snapshot.cashflowReport]);

  async function refreshReport() {
    const parsedMonths = Number(months);

    setStatus({ state: "loading" });

    try {
      setReport(await loadCashflowReport({ months: parsedMonths }));
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Cashflow report could not be loaded.",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cashflow report</CardTitle>
        <CardDescription>
          {report.from} through {report.to}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{report.months} months</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void refreshReport();
          }}
        >
          <Input
            aria-label="Cashflow months"
            className="h-9 w-[110px]"
            max={24}
            min={1}
            type="number"
            value={months}
            onChange={(event) => setMonths(event.target.value)}
          />
          <Button disabled={status.state === "loading"} size="sm" type="submit">
            <RefreshCwIcon />
            {status.state === "loading" ? "Loading" : "Load"}
          </Button>
        </form>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Income</p>
            <p className="mt-1 truncate text-sm font-semibold">{incomeLabel}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Expenses</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {expenseLabel}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Net</p>
            <p className="mt-1 truncate text-sm font-semibold">{netLabel}</p>
          </div>
        </div>

        {report.totals.length > 1 ? (
          <div className="grid gap-2">
            {report.totals.map((total) => (
              <div
                className="grid gap-2 rounded-md border border-border p-3"
                key={total.currencyCode}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {currencyLabel(total.currencyCode)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {total.transactionCount} transactions
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatMinorAmount(total.net, total.currencyCode)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span className="text-income-foreground">
                    +{formatMinorAmount(total.income, total.currencyCode)}
                  </span>
                  <span className="text-right text-expense-foreground">
                    -{formatMinorAmount(total.expenses, total.currencyCode)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cashflow activity found for this window.
          </p>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => {
              const activity = row.income + row.expenses;
              const incomeWidth =
                maxActivity > 0
                  ? Math.max(4, (row.income / maxActivity) * 100)
                  : 0;
              const expenseWidth =
                maxActivity > 0
                  ? Math.max(4, (row.expenses / maxActivity) * 100)
                  : 0;
              const href = buildTransactionFiltersHash({
                ...defaultTransactionFilters(),
                dateFrom: row.from,
                dateTo: row.to,
              });

              return (
                <a
                  className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                  href={href}
                  key={`${row.month}:${row.currencyCode}`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.month} · {currencyLabel(row.currencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.transactionCount} transactions
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">
                        {formatMinorAmount(row.net, row.currencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activity === 0
                          ? "No movement"
                          : `${formatMinorAmount(row.income, row.currencyCode)} in`}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-income"
                        style={{ width: `${incomeWidth}%` }}
                      />
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-expense"
                        style={{ width: `${expenseWidth}%` }}
                      />
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {status.state === "error" ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SavingsRateReportCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const [months, setMonths] = useState(
    String(snapshot.savingsRateReport.months),
  );
  const [report, setReport] = useState<LocalAppSnapshot["savingsRateReport"]>(
    snapshot.savingsRateReport,
  );
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const rows = report.points.slice(-8);
  const maxActivity = Math.max(
    ...rows.map((row) => row.income + row.expenses),
    0,
  );
  const singleCurrencyTotal =
    report.totals.length === 1 ? report.totals[0] : undefined;
  const convertedSavingsLabel = convertedReportTotalLabel(
    report.convertedTotals,
    "totalSavings",
  );
  const savingsLabel =
    singleCurrencyTotal === undefined
      ? report.totals.length === 0
        ? "0"
        : (convertedSavingsLabel ?? "Mixed")
      : formatMinorAmount(
          singleCurrencyTotal.savings,
          singleCurrencyTotal.currencyCode,
        );
  const rateLabel =
    singleCurrencyTotal === undefined
      ? report.totals.length === 0
        ? "0%"
        : "Mixed"
      : formatPercentage(singleCurrencyTotal.savingsRate);
  const averageLabel =
    singleCurrencyTotal === undefined
      ? report.totals.length === 0
        ? "0"
        : "Mixed"
      : formatMinorAmount(
          singleCurrencyTotal.averageMonthlySavings,
          singleCurrencyTotal.currencyCode,
        );

  useEffect(() => {
    setMonths(String(snapshot.savingsRateReport.months));
    setReport(snapshot.savingsRateReport);
    setStatus({ state: "idle" });
  }, [snapshot.savingsRateReport]);

  async function refreshReport() {
    const parsedMonths = Number(months);

    setStatus({ state: "loading" });

    try {
      setReport(await loadSavingsRateReport({ months: parsedMonths }));
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Savings rate report could not be loaded.",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Savings rate report</CardTitle>
        <CardDescription>
          {report.from} through {report.to}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{report.months} months</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void refreshReport();
          }}
        >
          <Input
            aria-label="Savings rate months"
            className="h-9 w-[110px]"
            max={24}
            min={1}
            type="number"
            value={months}
            onChange={(event) => setMonths(event.target.value)}
          />
          <Button disabled={status.state === "loading"} size="sm" type="submit">
            <RefreshCwIcon />
            {status.state === "loading" ? "Loading" : "Load"}
          </Button>
        </form>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Saved</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {savingsLabel}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Rate</p>
            <p className="mt-1 truncate text-sm font-semibold">{rateLabel}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Monthly avg</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {averageLabel}
            </p>
          </div>
        </div>

        {report.totals.length > 1 ? (
          <div className="grid gap-2">
            {report.totals.map((total) => (
              <div
                className="grid gap-2 rounded-md border border-border p-3"
                key={total.currencyCode}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {currencyLabel(total.currencyCode)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPercentage(total.savingsRate)} saved
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatMinorAmount(total.savings, total.currencyCode)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span className="text-income-foreground">
                    +{formatMinorAmount(total.income, total.currencyCode)}
                  </span>
                  <span className="text-right text-expense-foreground">
                    -{formatMinorAmount(total.expenses, total.currencyCode)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No savings rate activity found for this window.
          </p>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => {
              const activity = row.income + row.expenses;
              const incomeWidth =
                maxActivity > 0
                  ? Math.max(4, (row.income / maxActivity) * 100)
                  : 0;
              const expenseWidth =
                maxActivity > 0
                  ? Math.max(4, (row.expenses / maxActivity) * 100)
                  : 0;
              const href = buildTransactionFiltersHash({
                ...defaultTransactionFilters(),
                dateFrom: row.from,
                dateTo: row.to,
              });

              return (
                <a
                  className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                  href={href}
                  key={`${row.month}:${row.currencyCode}`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.month} · {currencyLabel(row.currencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.transactionCount} transactions ·{" "}
                        {formatPercentage(row.savingsRate)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">
                        {formatMinorAmount(row.savings, row.currencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activity === 0
                          ? "No movement"
                          : `${formatMinorAmount(row.income, row.currencyCode)} in`}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-income"
                        style={{ width: `${incomeWidth}%` }}
                      />
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-expense"
                        style={{ width: `${expenseWidth}%` }}
                      />
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {status.state === "error" ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function BalanceProjectionReportCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const [days, setDays] = useState(
    String(snapshot.balanceProjectionReport.days),
  );
  const [report, setReport] = useState<
    LocalAppSnapshot["balanceProjectionReport"]
  >(snapshot.balanceProjectionReport);
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const rows = report.points.slice(0, 8);
  const eventRows = report.events.slice(0, 5);
  const maxOutflow = Math.max(...rows.map((row) => row.projectedOutflows), 0);
  const singleCurrencyTotal =
    report.totals.length === 1 ? report.totals[0] : undefined;
  const convertedProjectedLabel = convertedReportTotalLabel(
    report.convertedTotals,
    "totalProjectedBalance",
  );
  const convertedOutflowsLabel = convertedReportTotalLabel(
    report.convertedTotals,
    "totalProjectedOutflows",
  );
  const projectedLabel =
    singleCurrencyTotal === undefined
      ? report.totals.length === 0
        ? "0"
        : (convertedProjectedLabel ?? "Mixed")
      : formatMinorAmount(
          singleCurrencyTotal.projectedBalance,
          singleCurrencyTotal.currencyCode,
        );
  const outflowsLabel =
    singleCurrencyTotal === undefined
      ? report.totals.length === 0
        ? "0"
        : (convertedOutflowsLabel ?? `${report.totals.length} currencies`)
      : formatMinorAmount(
          singleCurrencyTotal.projectedOutflows,
          singleCurrencyTotal.currencyCode,
        );

  useEffect(() => {
    setDays(String(snapshot.balanceProjectionReport.days));
    setReport(snapshot.balanceProjectionReport);
    setStatus({ state: "idle" });
  }, [snapshot.balanceProjectionReport]);

  async function refreshReport() {
    const parsedDays = Number(days);

    setStatus({ state: "loading" });

    try {
      setReport(await loadBalanceProjectionReport({ days: parsedDays }));
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Balance projection report could not be loaded.",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Balance projection</CardTitle>
        <CardDescription>
          {report.from} through {report.to}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{report.days} days</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void refreshReport();
          }}
        >
          <Input
            aria-label="Balance projection days"
            className="h-9 w-[110px]"
            max={180}
            min={1}
            type="number"
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
          <Button disabled={status.state === "loading"} size="sm" type="submit">
            <RefreshCwIcon />
            {status.state === "loading" ? "Loading" : "Load"}
          </Button>
        </form>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Projected</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {projectedLabel}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Outflows</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {outflowsLabel}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Events</p>
            <p className="mt-1 text-sm font-semibold">{report.events.length}</p>
          </div>
        </div>

        {report.totals.length > 1 ? (
          <div className="grid gap-2">
            {report.totals.map((total) => (
              <div
                className="grid gap-2 rounded-md border border-border p-3"
                key={total.currencyCode}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {currencyLabel(total.currencyCode)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {total.eventCount} projected events
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatMinorAmount(
                      total.projectedBalance,
                      total.currencyCode,
                    )}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>
                    {formatMinorAmount(
                      total.currentBalance,
                      total.currencyCode,
                    )}{" "}
                    current
                  </span>
                  <span className="text-right">
                    -
                    {formatMinorAmount(
                      total.projectedOutflows,
                      total.currencyCode,
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No balances available for projection.
          </p>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => {
              const width =
                maxOutflow > 0
                  ? Math.max(4, (row.projectedOutflows / maxOutflow) * 100)
                  : 0;

              return (
                <div
                  className="grid gap-2 rounded-md border border-border p-3"
                  key={`${row.date}:${row.currencyCode}`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.date} · {currencyLabel(row.currencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.eventCount} events ·{" "}
                        {formatMinorAmount(
                          row.projectedOutflows,
                          row.currencyCode,
                        )}{" "}
                        out
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">
                        {formatMinorAmount(
                          row.projectedBalance,
                          row.currencyCode,
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">projected</p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-expense"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {eventRows.length > 0 ? (
          <div className="grid gap-2">
            {eventRows.map((event) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                key={event.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {event.merchantName ?? event.recurringItemId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {event.date} · {event.frequency}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold">
                  {formatMinorAmount(event.projectedAmount, event.currencyCode)}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {status.state === "error" ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CategoryTrendReportCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const [months, setMonths] = useState(
    String(snapshot.categoryTrendReport.months),
  );
  const [report, setReport] = useState<LocalAppSnapshot["categoryTrendReport"]>(
    snapshot.categoryTrendReport,
  );
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const rows = report.categories.slice(0, 6);
  const maxAmount = Math.max(...rows.map((row) => row.amount), 0);
  const singleCurrencyCode =
    report.currencies.length === 1 ? report.currencies[0] : undefined;
  const convertedTotalLabel = convertedReportTotalLabel(
    report.convertedTotals,
    "totalExpenses",
  );
  const totalLabel =
    singleCurrencyCode === undefined
      ? report.currencies.length === 0
        ? "0"
        : (convertedTotalLabel ?? `${report.currencies.length} currencies`)
      : formatMinorAmount(report.totalExpenses, singleCurrencyCode);
  const averageLabel =
    singleCurrencyCode === undefined
      ? report.transactionCount === 0
        ? "0"
        : "Mixed"
      : formatMinorAmount(
          Math.round(report.totalExpenses / Math.max(1, report.months)),
          singleCurrencyCode,
        );

  useEffect(() => {
    setMonths(String(snapshot.categoryTrendReport.months));
    setReport(snapshot.categoryTrendReport);
    setStatus({ state: "idle" });
  }, [snapshot.categoryTrendReport]);

  async function refreshReport() {
    const parsedMonths = Number(months);

    setStatus({ state: "loading" });

    try {
      setReport(await loadCategoryTrendReport({ months: parsedMonths }));
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Category trend report could not be loaded.",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category trend report</CardTitle>
        <CardDescription>
          {report.from} through {report.to}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{report.months} months</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void refreshReport();
          }}
        >
          <Input
            aria-label="Category trend months"
            className="h-9 w-[110px]"
            max={24}
            min={1}
            type="number"
            value={months}
            onChange={(event) => setMonths(event.target.value)}
          />
          <Button disabled={status.state === "loading"} size="sm" type="submit">
            <RefreshCwIcon />
            {status.state === "loading" ? "Loading" : "Load"}
          </Button>
        </form>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Spent</p>
            <p className="mt-1 truncate text-sm font-semibold">{totalLabel}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Categories</p>
            <p className="mt-1 text-sm font-semibold">
              {report.categories.length}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Monthly avg</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {averageLabel}
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No category spending found for this window.
          </p>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => {
              const width =
                maxAmount > 0 ? Math.max(4, (row.amount / maxAmount) * 100) : 0;
              const href = buildTransactionFiltersHash({
                ...defaultTransactionFilters(),
                dateFrom: report.from,
                dateTo: report.to,
                categoryId: row.categoryId,
                amountMax: "-0.01",
              });

              return (
                <a
                  className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                  href={href}
                  key={`${row.categoryId}:${row.currencyCode}`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.categoryName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.transactionCount} transactions · avg{" "}
                        {formatMinorAmount(
                          row.averageMonthlyAmount,
                          row.currencyCode,
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">
                        {formatMinorAmount(row.amount, row.currencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {currencyLabel(row.currencyCode)}
                      </p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-expense"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {status.state === "error" ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function MerchantTrendReportCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const [months, setMonths] = useState(
    String(snapshot.merchantTrendReport.months),
  );
  const [report, setReport] = useState<LocalAppSnapshot["merchantTrendReport"]>(
    snapshot.merchantTrendReport,
  );
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const rows = report.merchants.slice(0, 6);
  const maxAmount = Math.max(...rows.map((row) => row.amount), 0);
  const singleCurrencyCode =
    report.currencies.length === 1 ? report.currencies[0] : undefined;
  const convertedTotalLabel = convertedReportTotalLabel(
    report.convertedTotals,
    "totalExpenses",
  );
  const totalLabel =
    singleCurrencyCode === undefined
      ? report.currencies.length === 0
        ? "0"
        : (convertedTotalLabel ?? `${report.currencies.length} currencies`)
      : formatMinorAmount(report.totalExpenses, singleCurrencyCode);
  const averageLabel =
    singleCurrencyCode === undefined
      ? report.transactionCount === 0
        ? "0"
        : "Mixed"
      : formatMinorAmount(
          Math.round(report.totalExpenses / Math.max(1, report.months)),
          singleCurrencyCode,
        );

  useEffect(() => {
    setMonths(String(snapshot.merchantTrendReport.months));
    setReport(snapshot.merchantTrendReport);
    setStatus({ state: "idle" });
  }, [snapshot.merchantTrendReport]);

  async function refreshReport() {
    const parsedMonths = Number(months);

    setStatus({ state: "loading" });

    try {
      setReport(await loadMerchantTrendReport({ months: parsedMonths }));
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Merchant trend report could not be loaded.",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Merchant trend report</CardTitle>
        <CardDescription>
          {report.from} through {report.to}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{report.months} months</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void refreshReport();
          }}
        >
          <Input
            aria-label="Merchant trend months"
            className="h-9 w-[110px]"
            max={24}
            min={1}
            type="number"
            value={months}
            onChange={(event) => setMonths(event.target.value)}
          />
          <Button disabled={status.state === "loading"} size="sm" type="submit">
            <RefreshCwIcon />
            {status.state === "loading" ? "Loading" : "Load"}
          </Button>
        </form>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Spent</p>
            <p className="mt-1 truncate text-sm font-semibold">{totalLabel}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Merchants</p>
            <p className="mt-1 text-sm font-semibold">
              {report.merchants.length}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Monthly avg</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {averageLabel}
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No merchant spending found for this window.
          </p>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => {
              const width =
                maxAmount > 0 ? Math.max(4, (row.amount / maxAmount) * 100) : 0;
              const href = buildTransactionFiltersHash({
                ...defaultTransactionFilters(),
                dateFrom: report.from,
                dateTo: report.to,
                merchantName: row.merchantName,
                amountMax: "-0.01",
              });

              return (
                <a
                  className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                  href={href}
                  key={`${row.merchantName}:${row.currencyCode}`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.merchantName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.transactionCount} transactions · avg{" "}
                        {formatMinorAmount(
                          row.averageMonthlyAmount,
                          row.currencyCode,
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">
                        {formatMinorAmount(row.amount, row.currencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {currencyLabel(row.currencyCode)}
                      </p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-expense"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {status.state === "error" ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
