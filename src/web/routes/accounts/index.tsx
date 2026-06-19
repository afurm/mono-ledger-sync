import { type ReactNode, useEffect, useState } from "react";
import { AlertCircleIcon, ChevronRightIcon } from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

import { loadLedgerTransactions } from "../../api";
import type {
  LedgerAccount,
  LedgerEntry,
  LedgerEntryPage,
  LedgerJar,
  LocalAppSnapshot,
} from "../../api-types";
import {
  currencyLabel,
  formatDateTime,
  formatMinorAmount,
  formatRelativeAge,
} from "../../format";
import { statusVariant } from "../../status";
import type { RouteId } from "../../navigation";

type TransactionFilterFormState = {
  accountId?: string;
  page?: number;
  sortBy?: string;
  sortDirection?: string;
};

function defaultTransactionFilters(): TransactionFilterFormState {
  return {
    accountId: "",
    page: 1,
    sortBy: "time",
    sortDirection: "desc",
  };
}

function buildTransactionFiltersHash(filters: TransactionFilterFormState) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === "" || (key === "page" && value === 1)) {
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

function dataFreshnessLabel(lastSyncedAt: string | undefined): string {
  return lastSyncedAt
    ? `Updated ${formatDateTime(lastSyncedAt)}`
    : "Waiting for first sync";
}

function latestSyncRunSummary(
  run: LocalAppSnapshot["syncRuns"][number] | undefined,
): string {
  if (!run) {
    return "No sync run recorded";
  }

  const finished = run.finishedAt
    ? `finished ${formatDateTime(run.finishedAt)}`
    : "not finished";

  return `${run.status}, ${finished}; ${run.itemsSeen} seen, ${run.itemsInserted} inserted, ${run.itemsUpdated} updated`;
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
function AccountDetailRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className="min-w-0 truncate text-right font-medium"
        {...(testId !== undefined ? { "data-testid": testId } : {})}
      >
        {value}
      </span>
    </div>
  );
}

function AccountBalanceSparkline({
  entries,
}: {
  entries: readonly LedgerEntry[];
}) {
  const points = entries
    .filter((entry) => entry.balance !== undefined)
    .map((entry) => ({ projectedBalance: entry.balance ?? 0 }));
  return <BalanceSparkline label="Account balance history" points={points} />;
}

function AccountCard({
  account,
  snapshot,
  onRouteChange,
}: {
  account: LedgerAccount;
  snapshot: LocalAppSnapshot;
  onRouteChange: (routeId: RouteId) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [transactionPage, setTransactionPage] = useState<
    LedgerEntryPage | undefined
  >();
  const maskedIdentifiers =
    account.maskedPan && account.maskedPan.length > 0
      ? account.maskedPan.join(" · ")
      : "No masked identifiers";
  const accountTransactions = transactionPage?.entries ?? [];
  const accountWebhookEvents = (snapshot.webhookEvents ?? []).filter(
    (event) => event.accountId === account.id,
  );
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  const failedWebhooks24h = accountWebhookEvents.filter((event) => {
    if (event.status !== "failed") {
      return false;
    }
    const received = Date.parse(event.receivedAt);
    return !Number.isNaN(received) && received >= twentyFourHoursAgo;
  }).length;
  const oldestTransaction = accountTransactions.at(0);
  const newestTransaction = accountTransactions.at(-1);
  const cursorAgeLabel = formatRelativeAge(
    newestTransaction ? newestTransaction.time : undefined,
  );

  useEffect(() => {
    let cancelled = false;

    void loadLedgerTransactions({
      accountId: account.id,
      limit: 200,
      sortBy: "time",
      sortDirection: "asc",
    })
      .then((page) => {
        if (!cancelled) {
          setTransactionPage(page);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTransactionPage(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    account.id,
    snapshot.summary.lastSyncedAt,
    snapshot.summary.ledgerEntries,
  ]);

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{account.id}</CardDescription>
        <CardTitle>
          {formatMinorAmount(account.balance, account.currencyCode)}
        </CardTitle>
        <CardAction>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">
              {currencyLabel(account.currencyCode)}
            </Badge>
            <Badge
              variant={
                account.includedInReports === false ? "secondary" : "default"
              }
            >
              {account.includedInReports === false ? "Excluded" : "Reports"}
            </Badge>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <AccountBalanceSparkline entries={accountTransactions} />
        <AccountDetailRow label="Type" value={account.type} />
        <AccountDetailRow
          label="Credit limit"
          value={formatMinorAmount(account.creditLimit, account.currencyCode)}
        />
        <Separator />
        <div className="grid gap-1">
          <span className="text-muted-foreground">Masked identifiers</span>
          <p className="break-all font-medium">{maskedIdentifiers}</p>
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Updated {formatDateTime(account.updatedAt)}</span>
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setDetailOpen(true)}
        >
          Details
        </Button>
      </CardFooter>
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="pr-12">
            <SheetTitle>{account.id}</SheetTitle>
            <SheetDescription>
              {currencyLabel(account.currencyCode)} {account.type}
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-5 px-4 pb-4">
            <AccountBalanceSparkline entries={accountTransactions} />
            <section className="grid gap-3 text-sm">
              <AccountDetailRow label="Masked id" value={maskedIdentifiers} />
              <AccountDetailRow
                label="Currency"
                value={currencyLabel(account.currencyCode)}
              />
              <AccountDetailRow label="Type" value={account.type} />
              <AccountDetailRow
                label="Credit limit"
                value={formatMinorAmount(
                  account.creditLimit,
                  account.currencyCode,
                )}
              />
              <AccountDetailRow
                label="Latest balance"
                value={formatMinorAmount(account.balance, account.currencyCode)}
              />
              <AccountDetailRow
                label="Last sync cursor"
                value={formatDateTime(
                  snapshot.summary.oldestSyncCursorUpdatedAt,
                )}
              />
              <AccountDetailRow
                label="Transactions"
                value={String(transactionPage?.total ?? 0)}
              />
              <AccountDetailRow
                label="Oldest"
                value={
                  oldestTransaction
                    ? formatDateTime(oldestTransaction.time)
                    : "Not available"
                }
              />
              <AccountDetailRow
                label="Newest"
                value={
                  newestTransaction
                    ? formatDateTime(newestTransaction.time)
                    : "Not available"
                }
              />
              <AccountDetailRow
                label="Reports"
                value={
                  account.includedInReports === false
                    ? "Excluded from reports"
                    : "Included in reports"
                }
              />
            </section>
            <Separator />
            <section
              className="grid gap-3 text-sm"
              data-testid="account-sync-health"
            >
              <h3 className="text-sm font-semibold">Sync health</h3>
              <AccountDetailRow
                label="Last successful window"
                value={
                  newestTransaction
                    ? formatDateTime(newestTransaction.time)
                    : "Not available"
                }
                testId="account-sync-health-last-successful-window"
              />
              <AccountDetailRow
                label="Failed webhooks (24h)"
                value={String(failedWebhooks24h)}
                testId="account-sync-health-failed-webhooks-24h"
              />
              <AccountDetailRow
                label="Cursor age"
                value={cursorAgeLabel}
                testId="account-sync-health-cursor-age"
              />
              <AccountDetailRow
                label="Next allowed pull"
                value={
                  <span className="text-muted-foreground">
                    Not in rate-limit cooldown.{" "}
                    <Button
                      type="button"
                      size="sm"
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => onRouteChange("sync")}
                    >
                      Open Sync
                    </Button>
                  </span>
                }
                testId="account-sync-health-next-allowed-pull"
              />
            </section>
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a
                  href={buildTransactionFiltersHash({
                    ...defaultTransactionFilters(),
                    accountId: account.id,
                  })}
                >
                  Transactions
                  <ChevronRightIcon data-icon="inline-end" />
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href="#reports">Reports</a>
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function JarCard({ jar }: { jar: LedgerJar }) {
  const progress =
    jar.goal > 0
      ? Math.min(100, Math.max(0, (jar.balance / jar.goal) * 100))
      : 0;

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{jar.id}</CardDescription>
        <CardTitle>{jar.title}</CardTitle>
        <CardAction>
          <Badge variant="outline">{currencyLabel(jar.currencyCode)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <AccountDetailRow
          label="Balance"
          value={formatMinorAmount(jar.balance, jar.currencyCode)}
        />
        <AccountDetailRow
          label="Goal"
          value={formatMinorAmount(jar.goal, jar.currencyCode)}
        />
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{jar.description}</p>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        Updated {formatDateTime(jar.updatedAt)}
      </CardFooter>
    </Card>
  );
}

export function AccountsRoute({
  snapshot,
  onRouteChange,
}: {
  snapshot: LocalAppSnapshot | undefined;
  onRouteChange: (routeId: RouteId) => void;
}) {
  if (!snapshot) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton className="h-44 w-full" key={index} />
          ))}
        </CardContent>
      </Card>
    );
  }

  const latestRun = snapshot.syncRuns[0];
  const jarCount = snapshot.jars.length;
  const currencies = snapshot.summary.currencies.map(currencyLabel).join(", ");
  const syncHealth =
    latestRun === undefined
      ? "No sync run recorded"
      : `${latestRun.status}: ${latestSyncRunSummary(latestRun)}`;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            Local Monobank accounts synced into the profile-scoped ledger.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">{snapshot.config.source}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <OverviewStatusItem
            label="Local accounts"
            value={String(snapshot.accounts.length)}
            detail={`${snapshot.summary.accounts} accounts in ledger summary`}
          />
          <OverviewStatusItem
            label="Local jars"
            value={String(jarCount)}
            detail="Local jars loaded from the profile ledger"
          />
          <OverviewStatusItem
            label="Currencies"
            value={currencies || "None"}
            detail="Currency set present in local ledger rows"
          />
          <OverviewStatusItem
            label="Latest sync"
            value={formatDateTime(snapshot.summary.lastSyncedAt)}
            detail={dataFreshnessLabel(snapshot.summary.lastSyncedAt)}
            badge={latestRun?.status ?? "none"}
            badgeVariant={statusVariant(latestRun?.status ?? "")}
          />
          <OverviewStatusItem
            label="Sync health"
            value={latestRun?.status ?? "none"}
            detail={syncHealth}
            badge={snapshot.config.source}
          />
        </CardContent>
      </Card>

      {snapshot.accounts.length === 0 ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>No accounts synced</AlertTitle>
          <AlertDescription>
            Save a Monobank token, then run sync from the top bar to populate
            local account cards.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {snapshot.accounts.map((account) => (
            <AccountCard
              account={account}
              key={account.id}
              snapshot={snapshot}
              onRouteChange={onRouteChange}
            />
          ))}
        </div>
      )}

      {snapshot.jars.length === 0 ? null : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {snapshot.jars.map((jar) => (
            <JarCard jar={jar} key={jar.id} />
          ))}
        </div>
      )}
    </div>
  );
}
