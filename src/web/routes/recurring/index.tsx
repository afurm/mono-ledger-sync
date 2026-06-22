import { type FormEvent, useEffect, useState } from "react";
import {
  AlertCircleIcon,
  CalendarDaysIcon,
  CheckCheckIcon,
  ChevronRightIcon,
  EyeIcon,
  FileClockIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import {
  confirmRecurringDetection,
  createManualRecurringItem,
  ignoreRecurringDetection,
} from "../../api";
import type {
  LocalAppSnapshot,
  ManualRecurringItemInput,
} from "../../api-types";
import {
  currencyLabel,
  formatDate,
  formatDateTime,
  formatMinorAmount,
} from "../../format";

const AMOUNT_FILTER_PATTERN = /^-?(?:\d+|\d*\.\d{1,2})$/;

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
  return "#transactions" + (query ? "?" + query : "");
}

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return year + "-" + month + "-" + day;
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

function TransactionDetailField({
  label,
  value,
  valueClassName = "text-foreground",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={"break-words text-sm " + valueClassName}>{value}</dd>
    </div>
  );
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
export function recurringPaymentAmountLabel(payment: {
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

function missedRecurringPaymentLabel(
  payment: LocalAppSnapshot["missedRecurringPayments"][number],
): string {
  return `${payment.daysOverdue}d missed`;
}

function subscriptionIncreaseBadgeLabel(
  alert: LocalAppSnapshot["subscriptionIncreaseAlerts"][number],
): string {
  return `+${formatMinorAmount(alert.increaseAmount, alert.currencyCode)}`;
}

export function SubscriptionIncreaseAlertsCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const rows = snapshot.subscriptionIncreaseAlerts.slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription increase alerts</CardTitle>
        <CardDescription>
          Latest charges above expected recurring ranges.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No subscription increases found in the current ledger.
          </p>
        ) : (
          rows.map((alert) => {
            const href = buildTransactionFiltersHash({
              ...defaultTransactionFilters(),
              accountId: alert.accountId,
              ...(alert.categoryId === undefined
                ? {}
                : { categoryId: alert.categoryId }),
              ...(alert.merchantName === undefined
                ? {}
                : { merchantName: alert.merchantName }),
            });

            return (
              <a
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                href={href}
                key={alert.id}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <AlertCircleIcon className="size-4 shrink-0 text-destructive" />
                    <p className="truncate text-sm font-medium">
                      {alert.merchantName ?? alert.recurringItemId}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(Date.parse(alert.occurredAt) / 1000)} · +
                    {alert.increasePercentage}%
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {formatMinorAmount(alert.actualAmount, alert.currencyCode)}
                  </p>
                  <Badge variant="destructive">
                    {subscriptionIncreaseBadgeLabel(alert)}
                  </Badge>
                </div>
              </a>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function RecurringDetectionCandidatesCard({
  snapshot,
  onRefresh,
}: {
  snapshot: LocalAppSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const rows = snapshot.recurringDetectionCandidates.slice(0, 6);
  const [decisionState, setDecisionState] = useState<{
    candidateId: string;
    action: "confirm" | "ignore";
  } | null>(null);
  const [message, setMessage] = useState<
    | { state: "idle" }
    | { state: "saved"; text: string }
    | { state: "error"; text: string }
  >({ state: "idle" });

  async function onDecision(
    candidate: LocalAppSnapshot["recurringDetectionCandidates"][number],
    action: "confirm" | "ignore",
  ) {
    if (decisionState !== null) {
      return;
    }

    setDecisionState({ candidateId: candidate.id, action });
    setMessage({ state: "idle" });

    try {
      if (action === "confirm") {
        await confirmRecurringDetection(candidate.id);
        setMessage({ state: "saved", text: "Recurring schedule confirmed." });
      } else {
        await ignoreRecurringDetection(candidate.id);
        setMessage({ state: "saved", text: "Recurring suggestion ignored." });
      }

      await onRefresh();
    } catch (error) {
      setMessage({
        state: "error",
        text:
          error instanceof Error
            ? error.message
            : "Recurring suggestion could not be updated.",
      });
    } finally {
      setDecisionState(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring suggestions</CardTitle>
        <CardDescription>
          Detected recurring charges awaiting a decision.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recurring suggestions found in the current ledger.
          </p>
        ) : (
          rows.map((candidate) => {
            const isConfirming =
              decisionState?.candidateId === candidate.id &&
              decisionState.action === "confirm";
            const isIgnoring =
              decisionState?.candidateId === candidate.id &&
              decisionState.action === "ignore";

            return (
              <div
                className="grid gap-3 rounded-md border border-border p-3"
                key={candidate.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileClockIcon className="size-4 shrink-0 text-primary" />
                      <p className="truncate text-sm font-medium">
                        {candidate.merchantName}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {candidate.occurrences} occurrences ·{" "}
                      {candidate.frequency} ·{" "}
                      {Math.round(candidate.confidence * 100)}% confidence
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">
                    {recurringPaymentAmountLabel(candidate)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    type="button"
                    disabled={decisionState !== null}
                    onClick={() => void onDecision(candidate, "confirm")}
                  >
                    <CheckCheckIcon />
                    {isConfirming ? "Confirming" : "Confirm"}
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    disabled={decisionState !== null}
                    onClick={() => void onDecision(candidate, "ignore")}
                  >
                    <XIcon />
                    {isIgnoring ? "Ignoring" : "Ignore"}
                  </Button>
                </div>
              </div>
            );
          })
        )}
        {message.state === "error" ? (
          <p className="text-sm text-destructive">{message.text}</p>
        ) : message.state === "saved" ? (
          <p className="text-sm text-muted-foreground">{message.text}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function MissedRecurringPaymentsCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const rows = snapshot.missedRecurringPayments.slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Missed recurring payments</CardTitle>
        <CardDescription>
          Expected charges not found in local posted transactions.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No missed recurring payments found in the current ledger.
          </p>
        ) : (
          rows.map((payment) => {
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
                  <div className="flex min-w-0 items-center gap-2">
                    <AlertCircleIcon className="size-4 shrink-0 text-destructive" />
                    <p className="truncate text-sm font-medium">
                      {payment.merchantName ?? payment.recurringItemId}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(Date.parse(payment.expectedDueAt) / 1000)} ·{" "}
                    {payment.frequency}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {recurringPaymentAmountLabel(payment)}
                  </p>
                  <Badge variant="destructive">
                    {missedRecurringPaymentLabel(payment)}
                  </Badge>
                </div>
              </a>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function recurringPaymentDueLabel(
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

export function UpcomingRecurringPaymentsCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const rows = snapshot.upcomingRecurringPayments.slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming recurring payments</CardTitle>
        <CardDescription>
          Active recurring charges projected from local schedule data.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active recurring payments found in the current ledger.
          </p>
        ) : (
          rows.map((payment) => {
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
                  <div className="flex min-w-0 items-center gap-2">
                    <FileClockIcon className="size-4 shrink-0 text-primary" />
                    <p className="truncate text-sm font-medium">
                      {payment.merchantName ?? payment.recurringItemId}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
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
                    {recurringPaymentDueLabel(payment)}
                  </Badge>
                </div>
              </a>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function recurringCalendarAmountLabel(
  event: LocalAppSnapshot["recurringCalendar"][number],
): string {
  if (
    event.expectedAmountMin !== undefined &&
    event.expectedAmountMax !== undefined &&
    event.expectedAmountMin !== event.expectedAmountMax
  ) {
    return `${formatMinorAmount(
      event.expectedAmountMin,
      event.currencyCode,
    )} - ${formatMinorAmount(event.expectedAmountMax, event.currencyCode)}`;
  }

  const amount = event.expectedAmountMax ?? event.expectedAmountMin;

  return amount === undefined
    ? currencyLabel(event.currencyCode)
    : formatMinorAmount(amount, event.currencyCode);
}

export function RecurringCalendarCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const rows = snapshot.recurringCalendar.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring calendar</CardTitle>
        <CardDescription>
          Projected schedule for confirmed local recurring payments.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recurring calendar events found for the current range.
          </p>
        ) : (
          rows.map((event) => {
            const href = buildTransactionFiltersHash({
              ...defaultTransactionFilters(),
              accountId: event.accountId,
              ...(event.categoryId === undefined
                ? {}
                : { categoryId: event.categoryId }),
              ...(event.merchantName === undefined
                ? {}
                : { merchantName: event.merchantName }),
            });

            return (
              <a
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                href={href}
                key={event.id}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <CalendarDaysIcon className="size-4 shrink-0 text-primary" />
                    <p className="truncate text-sm font-medium">
                      {event.merchantName ?? event.recurringItemId}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(Date.parse(event.dueAt) / 1000)} ·{" "}
                    {event.frequency}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {recurringCalendarAmountLabel(event)}
                  </p>
                  <Badge variant={event.isPast ? "destructive" : "secondary"}>
                    {event.month}
                  </Badge>
                </div>
              </a>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function RecurringRoute({
  snapshot,
  onRefresh,
}: {
  snapshot: LocalAppSnapshot | undefined;
  onRefresh: () => Promise<void>;
}) {
  if (!snapshot) {
    return null;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="xl:col-span-2">
        <RecurringDashboardSummaryCard snapshot={snapshot} />
      </div>
      <ManualRecurringStreamCard snapshot={snapshot} onRefresh={onRefresh} />
      <RecurringStreamsDetailCard snapshot={snapshot} />
      <RecurringDetectionCandidatesCard
        snapshot={snapshot}
        onRefresh={onRefresh}
      />
      <MissedRecurringPaymentsCard snapshot={snapshot} />
      <SubscriptionIncreaseAlertsCard snapshot={snapshot} />
      <UpcomingRecurringPaymentsCard snapshot={snapshot} />
      <div className="xl:col-span-2">
        <RecurringCalendarCard snapshot={snapshot} />
      </div>
    </div>
  );
}

function RecurringDashboardSummaryCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const streamIds = new Set(
    [
      ...snapshot.upcomingRecurringPayments.map(
        (payment) => payment.recurringItemId,
      ),
      ...snapshot.recurringCalendar.map((event) => event.recurringItemId),
    ].filter(Boolean),
  );
  const monthlyCommittedSpend = snapshot.upcomingRecurringPayments
    .filter(isExpenseRecurring)
    .reduce(
      (total, payment) => total + Math.abs(recurringExpectedAmount(payment)),
      0,
    );
  const expectedIncome = snapshot.upcomingRecurringPayments
    .filter((payment) => recurringExpectedAmount(payment) > 0)
    .reduce((total, payment) => total + recurringExpectedAmount(payment), 0);
  const nextPayment = snapshot.upcomingRecurringPayments[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring dashboard</CardTitle>
        <CardDescription>
          Active streams, committed spend, expected income, and upcoming risk.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <OverviewStatusItem
          label="Active streams"
          value={String(streamIds.size)}
          detail={`${snapshot.recurringDetectionCandidates.length} suggestions pending`}
        />
        <OverviewStatusItem
          label="Monthly committed"
          value={formatMinorAmount(monthlyCommittedSpend)}
          detail="Upcoming recurring expenses"
        />
        <OverviewStatusItem
          label="Expected income"
          value={formatMinorAmount(expectedIncome)}
          detail="Positive recurring streams"
        />
        <OverviewStatusItem
          label="Overdue/missed"
          value={String(snapshot.missedRecurringPayments.length)}
          detail="No matching posted transaction"
          badgeVariant={
            snapshot.missedRecurringPayments.length > 0
              ? "destructive"
              : "outline"
          }
        />
        <OverviewStatusItem
          label="Price increases"
          value={String(snapshot.subscriptionIncreaseAlerts.length)}
          detail="Above expected amount range"
        />
        <OverviewStatusItem
          label="Next payment"
          value={
            nextPayment
              ? formatDate(Date.parse(nextPayment.nextDueAt) / 1000)
              : "None"
          }
          detail={nextPayment?.merchantName ?? "No scheduled payment"}
        />
      </CardContent>
    </Card>
  );
}

function ManualRecurringStreamCard({
  snapshot,
  onRefresh,
}: {
  snapshot: LocalAppSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const [accountId, setAccountId] = useState(snapshot.accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [frequency, setFrequency] =
    useState<ManualRecurringItemInput["frequency"]>("monthly");
  const [amount, setAmount] = useState("");
  const [startedAt, setStartedAt] = useState(dateInputValue(new Date()));
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "saving" }
    | { state: "saved"; message: string }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const parsedAmount = amountInputToMinor(amount);

  useEffect(() => {
    if (!accountId && snapshot.accounts[0]) {
      setAccountId(snapshot.accounts[0].id);
    }
  }, [accountId, snapshot.accounts]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!accountId || (!merchantName.trim() && !categoryId)) {
      setStatus({
        state: "error",
        message: "Choose an account and enter a merchant or category.",
      });
      return;
    }

    if (amount.trim() && parsedAmount === undefined) {
      setStatus({
        state: "error",
        message: "Expected amount must use up to 2 decimals.",
      });
      return;
    }

    setStatus({ state: "saving" });

    try {
      await createManualRecurringItem({
        accountId,
        ...(categoryId ? { categoryId } : {}),
        ...(merchantName.trim() ? { merchantName: merchantName.trim() } : {}),
        frequency,
        ...(parsedAmount === undefined
          ? {}
          : {
              expectedAmountMin: parsedAmount,
              expectedAmountMax: parsedAmount,
            }),
        ...(startedAt ? { startedAt } : {}),
      });
      setMerchantName("");
      setAmount("");
      setStatus({ state: "saved", message: "Recurring stream saved." });
      await onRefresh();
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Recurring stream could not be saved.",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual recurring stream</CardTitle>
        <CardDescription>
          Add rent, salary, transfers, reimbursements, or seasonal
          subscriptions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={(event) => void onSubmit(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Account
              </span>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger aria-label="Recurring account">
                  <SelectValue placeholder="Account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {snapshot.accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Label>
            <Label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Category
              </span>
              <Select
                value={categoryId || "none"}
                onValueChange={(value) =>
                  setCategoryId(value === "none" ? "" : value)
                }
              >
                <SelectTrigger aria-label="Recurring category">
                  <SelectValue placeholder="Optional category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">No category</SelectItem>
                    {snapshot.categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Merchant or stream name
              </span>
              <Input
                placeholder="Rent, salary, streaming"
                value={merchantName}
                onChange={(event) => {
                  setMerchantName(event.target.value);
                  setStatus({ state: "idle" });
                }}
              />
            </Label>
            <Label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Frequency
              </span>
              <Select
                value={frequency}
                onValueChange={(value) => {
                  if (
                    value === "daily" ||
                    value === "weekly" ||
                    value === "monthly" ||
                    value === "quarterly" ||
                    value === "yearly" ||
                    value === "irregular"
                  ) {
                    setFrequency(value);
                  }
                }}
              >
                <SelectTrigger aria-label="Recurring frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="irregular">Irregular</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Expected amount
              </span>
              <Input
                inputMode="decimal"
                placeholder="-500.00 or 5000.00"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setStatus({ state: "idle" });
                }}
              />
            </Label>
            <Label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Starts
              </span>
              <Input
                type="date"
                value={startedAt}
                onChange={(event) => setStartedAt(event.target.value)}
              />
            </Label>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={
                  status.state === "saving" || snapshot.accounts.length === 0
                }
              >
                <PlusIcon data-icon="inline-start" />
                {status.state === "saving" ? "Saving" : "Add stream"}
              </Button>
            </div>
          </div>
          {status.state === "error" ? (
            <p className="text-xs text-destructive">{status.message}</p>
          ) : status.state === "saved" ? (
            <p className="text-xs text-muted-foreground">{status.message}</p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

interface RecurringStreamSummary {
  recurringItemId: string;
  accountId: string;
  categoryId?: string;
  merchantName?: string;
  frequency: LocalAppSnapshot["recurringCalendar"][number]["frequency"];
  currencyCode: number;
  expectedAmountMin?: number;
  expectedAmountMax?: number;
  nextDueAt?: string;
}

function recurringStreamKey(stream: RecurringStreamSummary): string {
  return [
    stream.recurringItemId,
    stream.accountId,
    stream.categoryId ?? "",
    stream.merchantName ?? "",
  ].join(":");
}

function recurringStreamsFromSnapshot(
  snapshot: LocalAppSnapshot,
): readonly RecurringStreamSummary[] {
  const streams = new Map<string, RecurringStreamSummary>();

  for (const payment of snapshot.upcomingRecurringPayments) {
    const stream = {
      recurringItemId: payment.recurringItemId,
      accountId: payment.accountId,
      ...(payment.categoryId ? { categoryId: payment.categoryId } : {}),
      ...(payment.merchantName ? { merchantName: payment.merchantName } : {}),
      frequency: payment.frequency,
      currencyCode: payment.currencyCode,
      ...(payment.expectedAmountMin === undefined
        ? {}
        : { expectedAmountMin: payment.expectedAmountMin }),
      ...(payment.expectedAmountMax === undefined
        ? {}
        : { expectedAmountMax: payment.expectedAmountMax }),
      nextDueAt: payment.nextDueAt,
    } satisfies RecurringStreamSummary;

    streams.set(recurringStreamKey(stream), stream);
  }

  for (const event of snapshot.recurringCalendar) {
    const stream = {
      recurringItemId: event.recurringItemId,
      accountId: event.accountId,
      ...(event.categoryId ? { categoryId: event.categoryId } : {}),
      ...(event.merchantName ? { merchantName: event.merchantName } : {}),
      frequency: event.frequency,
      currencyCode: event.currencyCode,
      ...(event.expectedAmountMin === undefined
        ? {}
        : { expectedAmountMin: event.expectedAmountMin }),
      ...(event.expectedAmountMax === undefined
        ? {}
        : { expectedAmountMax: event.expectedAmountMax }),
      nextDueAt: event.dueAt,
    } satisfies RecurringStreamSummary;
    const key = recurringStreamKey(stream);

    if (!streams.has(key)) {
      streams.set(key, stream);
    }
  }

  return [...streams.values()].sort((left, right) =>
    (left.nextDueAt ?? "").localeCompare(right.nextDueAt ?? ""),
  );
}

function RecurringStreamsDetailCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const streams = recurringStreamsFromSnapshot(snapshot).slice(0, 8);
  const [selectedStream, setSelectedStream] = useState<
    RecurringStreamSummary | undefined
  >();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring streams</CardTitle>
        <CardDescription>
          Open a stream to review schedule and history.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {streams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No confirmed or manual recurring streams found yet.
          </p>
        ) : (
          streams.map((stream) => (
            <div
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              key={recurringStreamKey(stream)}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {stream.merchantName ?? stream.recurringItemId}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stream.frequency} · {recurringPaymentAmountLabel(stream)}
                </p>
              </div>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => setSelectedStream(stream)}
              >
                <EyeIcon data-icon="inline-start" />
                Details
              </Button>
            </div>
          ))
        )}
        <RecurringDetailDrawer
          snapshot={snapshot}
          stream={selectedStream}
          open={selectedStream !== undefined}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedStream(undefined);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

function RecurringDetailDrawer({
  snapshot,
  stream,
  open,
  onOpenChange,
}: {
  snapshot: LocalAppSnapshot;
  stream: RecurringStreamSummary | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const matchingCalendar = stream
    ? snapshot.recurringCalendar.filter(
        (event) => event.recurringItemId === stream.recurringItemId,
      )
    : [];
  const matchingMissed = stream
    ? snapshot.missedRecurringPayments.filter(
        (payment) => payment.recurringItemId === stream.recurringItemId,
      )
    : [];
  const transactionsHref = stream
    ? buildTransactionFiltersHash({
        ...defaultTransactionFilters(),
        accountId: stream.accountId,
        ...(stream.categoryId ? { categoryId: stream.categoryId } : {}),
        ...(stream.merchantName ? { merchantName: stream.merchantName } : {}),
      })
    : "#transactions";
  const matchingTransactions = stream
    ? snapshot.transactions.entries
        .filter(
          (entry) =>
            entry.accountId === stream.accountId &&
            (stream.categoryId === undefined ||
              entry.categoryId === stream.categoryId) &&
            (stream.merchantName === undefined ||
              entry.merchantName === stream.merchantName),
        )
        .slice(0, 5)
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle>{stream?.merchantName ?? "Recurring stream"}</SheetTitle>
          <SheetDescription>
            {stream
              ? `${stream.frequency} · ${recurringPaymentAmountLabel(stream)}`
              : "Recurring stream detail"}
          </SheetDescription>
        </SheetHeader>
        {stream ? (
          <div className="grid gap-5 px-4 pb-4">
            <section className="grid gap-3">
              <h3 className="text-sm font-medium">Schedule</h3>
              <dl className="grid gap-3">
                <TransactionDetailField
                  label="Cadence"
                  value={stream.frequency}
                />
                <TransactionDetailField
                  label="Expected amount"
                  value={recurringPaymentAmountLabel(stream)}
                />
                <TransactionDetailField
                  label="Account"
                  value={stream.accountId}
                />
                <TransactionDetailField
                  label="Category"
                  value={stream.categoryId ?? "Not assigned"}
                />
                <TransactionDetailField
                  label="Next due"
                  value={
                    stream.nextDueAt
                      ? formatDateTime(stream.nextDueAt)
                      : "Not projected"
                  }
                />
              </dl>
            </section>
            <Separator />
            <section className="grid gap-3">
              <h3 className="text-sm font-medium">Next dates</h3>
              {matchingCalendar.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No future dates projected.
                </p>
              ) : (
                matchingCalendar.slice(0, 8).map((event) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                    key={event.id}
                  >
                    <span className="text-sm">{event.date}</span>
                    <Badge variant={event.isPast ? "secondary" : "outline"}>
                      {event.isPast ? "Past" : "Upcoming"}
                    </Badge>
                  </div>
                ))
              )}
            </section>
            <Separator />
            <section className="grid gap-3">
              <h3 className="text-sm font-medium">Missed dates</h3>
              {matchingMissed.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No missed dates detected.
                </p>
              ) : (
                matchingMissed.slice(0, 6).map((payment) => (
                  <div
                    className="rounded-md border border-border p-3"
                    key={payment.id}
                  >
                    <p className="text-sm font-medium">
                      {formatDateTime(payment.expectedDueAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {payment.daysOverdue} days overdue
                    </p>
                  </div>
                ))
              )}
            </section>
            <Separator />
            <section className="grid gap-3">
              <h3 className="text-sm font-medium">Recent history</h3>
              {matchingTransactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No linked transactions are loaded in the current page.
                </p>
              ) : (
                matchingTransactions.map((entry) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                    key={entry.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {entry.merchantName ?? entry.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(entry.time)}
                      </p>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {formatMinorAmount(entry.amount, entry.currencyCode)}
                    </span>
                  </div>
                ))
              )}
            </section>
            <Separator />
            <Button asChild>
              <a href={transactionsHref}>
                Matching transactions
                <ChevronRightIcon data-icon="inline-end" />
              </a>
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
