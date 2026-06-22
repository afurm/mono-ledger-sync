import { useState } from "react";
import {
  AlertCircleIcon,
  CopyIcon,
  DatabaseIcon,
  DownloadIcon,
  FileClockIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldCheckIcon,
  WifiOffIcon,
} from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { compactLocalDatabase, createLocalBackup } from "../../api";
import type { LocalAppSnapshot, SyncRun, WebhookEvent } from "../../api-types";
import { useCopyToClipboard } from "../../clipboard";
import { formatDateTime } from "../../format";
import type { RouteId } from "../../navigation";
import {
  type SyncRunSummaryStats,
  summarizeSyncRuns,
} from "../../sync-summary";
import { statusVariant } from "../../status";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const STALE_SYNC_THRESHOLD_MS = DAY_MS;
const SYNC_HEALTH_DAYS = 30;

interface LedgerFreshnessWarning {
  title: string;
  description: string;
}

interface SyncHealthBucket {
  key: string;
  label: string;
  success: number;
  partial: number;
  failed: number;
  skipped: number;
}

interface SyncHealthSummary {
  buckets: SyncHealthBucket[];
  totals: {
    success: number;
    partial: number;
    failed: number;
    skipped: number;
  };
  maxBucketTotal: number;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function syncHealthBucketLabel(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function getSyncHealthSummary(
  runs: readonly SyncRun[],
  now = Date.now(),
): SyncHealthSummary {
  const today = new Date(now);
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const buckets: SyncHealthBucket[] = Array.from(
    { length: SYNC_HEALTH_DAYS },
    (_, index) => {
      const date = new Date(
        todayStart.getTime() - (SYNC_HEALTH_DAYS - index - 1) * DAY_MS,
      );

      return {
        key: localDayKey(date),
        label: syncHealthBucketLabel(date),
        success: 0,
        partial: 0,
        failed: 0,
        skipped: 0,
      };
    },
  );
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const run of runs) {
    const startedAt = new Date(run.startedAt);

    if (Number.isNaN(startedAt.getTime())) {
      continue;
    }

    const bucket = bucketMap.get(localDayKey(startedAt));

    if (!bucket) {
      continue;
    }

    if (run.status === "success") {
      bucket.success += 1;
    } else if (run.status === "partial") {
      bucket.partial += 1;
    } else if (run.status === "failed") {
      bucket.failed += 1;
    }

    bucket.skipped += run.itemsSkipped;
  }

  const totals = buckets.reduce(
    (currentTotals, bucket) => ({
      success: currentTotals.success + bucket.success,
      partial: currentTotals.partial + bucket.partial,
      failed: currentTotals.failed + bucket.failed,
      skipped: currentTotals.skipped + bucket.skipped,
    }),
    { success: 0, partial: 0, failed: 0, skipped: 0 },
  );
  const maxBucketTotal = Math.max(
    1,
    ...buckets.map(
      (bucket) =>
        bucket.success + bucket.partial + bucket.failed + bucket.skipped,
    ),
  );

  return { buckets, totals, maxBucketTotal };
}

function formatSyncAge(ageMs: number): string {
  const safeAgeMs = Math.max(0, ageMs);

  if (safeAgeMs < HOUR_MS) {
    return "less than 1 hour ago";
  }

  if (safeAgeMs < DAY_MS) {
    const hours = Math.floor(safeAgeMs / HOUR_MS);

    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  const days = Math.floor(safeAgeMs / DAY_MS);

  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function getLedgerFreshnessWarning(
  snapshot: LocalAppSnapshot | undefined,
  now = Date.now(),
): LedgerFreshnessWarning | undefined {
  if (!snapshot) {
    return undefined;
  }

  const lastSyncedAt = snapshot.summary.lastSyncedAt;

  if (!lastSyncedAt) {
    return {
      title: "No completed sync yet",
      description: `${snapshot.config.profile} has no successful sync timestamp. Run sync before reviewing reports or exporting local files.`,
    };
  }

  const lastSyncedTime = Date.parse(lastSyncedAt);

  if (!Number.isFinite(lastSyncedTime)) {
    return {
      title: "Sync timestamp needs attention",
      description: `The local ledger has an unreadable sync timestamp for ${snapshot.config.profile}. Run sync to refresh the local status.`,
    };
  }

  const oldestCursorUpdatedAt = snapshot.summary.oldestSyncCursorUpdatedAt;

  if (oldestCursorUpdatedAt) {
    const oldestCursorTime = Date.parse(oldestCursorUpdatedAt);

    if (!Number.isFinite(oldestCursorTime)) {
      return {
        title: "Sync cursor needs attention",
        description: `The local ledger has an unreadable cursor timestamp for ${snapshot.config.profile}. Run sync to refresh local statement progress.`,
      };
    }

    const cursorAgeMs = now - oldestCursorTime;

    if (cursorAgeMs > STALE_SYNC_THRESHOLD_MS) {
      return {
        title: "Statement cursor may be stale",
        description: `${snapshot.config.profile} has a statement cursor last updated ${formatSyncAge(
          cursorAgeMs,
        )}. Run sync before reviewing reports or exporting local files.`,
      };
    }
  }

  const ageMs = now - lastSyncedTime;

  if (ageMs <= STALE_SYNC_THRESHOLD_MS) {
    return undefined;
  }

  return {
    title: "Local data may be stale",
    description: `${snapshot.config.profile} last synced ${formatSyncAge(
      ageMs,
    )}. Run sync before reviewing reports or exporting local files.`,
  };
}

function formatSyncRunDuration(run: SyncRun): string {
  if (!run.finishedAt) {
    return run.status === "running" ? "Running" : "Not finished";
  }

  const startedAt = Date.parse(run.startedAt);
  const finishedAt = Date.parse(run.finishedAt);

  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(finishedAt) ||
    finishedAt < startedAt
  ) {
    return "Unknown";
  }

  const totalSeconds = Math.round((finishedAt - startedAt) / 1000);

  if (totalSeconds < 1) {
    return "<1 sec";
  }

  if (totalSeconds < 60) {
    return `${totalSeconds} sec`;
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

function SyncRunStats({ run }: { run: SyncRun }) {
  const stats = [
    { label: "Seen", value: run.itemsSeen },
    { label: "API Calls", value: run.apiCalls },
    { label: "Windows", value: run.windowsFetched },
    { label: "Inserted", value: run.itemsInserted },
    { label: "Updated", value: run.itemsUpdated },
    { label: "Skipped", value: run.itemsSkipped },
    { label: "Rate-limited", value: run.rateLimited },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => (
        <div className="rounded-lg border bg-muted/30 p-2" key={stat.label}>
          <p className="text-xs text-muted-foreground">{stat.label}</p>
          <p className="text-sm font-semibold">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

function SyncRunSummaryStatsPanel({
  summary,
}: {
  summary: SyncRunSummaryStats;
}) {
  const stats = [
    { label: "Runs", value: summary.runs },
    { label: "API calls", value: summary.apiCalls },
    { label: "Windows fetched", value: summary.windowsFetched },
    { label: "Items seen", value: summary.itemsSeen },
    { label: "Inserted", value: summary.itemsInserted },
    { label: "Updated", value: summary.itemsUpdated },
    { label: "Skipped", value: summary.itemsSkipped },
    { label: "Rate-limited", value: summary.rateLimited },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          className="rounded-md border bg-muted/30 px-3 py-2"
          key={stat.label}
        >
          <p className="text-xs text-muted-foreground">{stat.label}</p>
          <p className="text-base font-semibold tabular-nums">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

function SyncHealthMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function SyncHealthSegment({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className: string;
}) {
  if (value === 0) {
    return null;
  }

  return (
    <div
      className={className}
      style={{ height: `${Math.max(6, (value / max) * 100)}%` }}
    />
  );
}

export function SyncHealthChart({ runs }: { runs: readonly SyncRun[] }) {
  const summary = getSyncHealthSummary(runs);
  const totalActivity =
    summary.totals.success +
    summary.totals.partial +
    summary.totals.failed +
    summary.totals.skipped;
  const chartMax = Math.max(5, Math.ceil(summary.maxBucketTotal * 1.25));
  const firstBucketLabel = summary.buckets[0]?.label ?? "";
  const middleBucketLabel =
    summary.buckets[Math.floor(summary.buckets.length / 2)]?.label ?? "";
  const lastBucketLabel =
    summary.buckets[summary.buckets.length - 1]?.label ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>30-day sync health</CardTitle>
        <CardDescription>
          Successful, partial, failed, and skipped activity from local sync
          runs.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <SyncHealthMetric
            label="Successful"
            value={summary.totals.success}
            detail="Completed sync runs"
          />
          <SyncHealthMetric
            label="Partial"
            value={summary.totals.partial}
            detail="Runs with partial completion"
          />
          <SyncHealthMetric
            label="Failed"
            value={summary.totals.failed}
            detail="Runs that need attention"
          />
          <SyncHealthMetric
            label="Skipped"
            value={summary.totals.skipped}
            detail="Statement items skipped"
          />
        </div>

        {totalActivity === 0 ? (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>No sync activity in the last 30 days</AlertTitle>
            <AlertDescription>
              Run sync from the top bar to start building local health history.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-3">
            <div
              aria-label="Last 30 days sync health"
              className="rounded-lg border bg-muted/20 p-3"
              role="img"
            >
              <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Daily activity</span>
                <span>Peak day: {summary.maxBucketTotal}</span>
              </div>
              <div
                className="grid h-24 items-end gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${summary.buckets.length}, minmax(0, 1fr))`,
                }}
              >
                {summary.buckets.map((bucket, index) => {
                  const bucketTotal =
                    bucket.success +
                    bucket.partial +
                    bucket.failed +
                    bucket.skipped;

                  return (
                    <div
                      aria-label={`${bucket.label}: ${bucket.success} successful, ${bucket.partial} partial, ${bucket.failed} failed, ${bucket.skipped} skipped`}
                      className="flex h-full min-w-0 flex-col items-center justify-end"
                      key={bucket.key}
                      title={`${bucket.label}: ${bucketTotal} total`}
                    >
                      <div className="flex h-full w-full max-w-4 flex-col justify-end overflow-hidden rounded-sm bg-background shadow-inner sm:max-w-5">
                        {bucketTotal === 0 ? (
                          <div className="h-1 rounded-sm bg-muted" />
                        ) : (
                          <>
                            <SyncHealthSegment
                              value={bucket.skipped}
                              max={chartMax}
                              className="bg-status-neutral"
                            />
                            <SyncHealthSegment
                              value={bucket.failed}
                              max={chartMax}
                              className="bg-destructive"
                            />
                            <SyncHealthSegment
                              value={bucket.partial}
                              max={chartMax}
                              className="bg-warning"
                            />
                            <SyncHealthSegment
                              value={bucket.success}
                              max={chartMax}
                              className="bg-success"
                            />
                          </>
                        )}
                      </div>
                      <span className="sr-only">
                        {index + 1} of {summary.buckets.length}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{firstBucketLabel}</span>
                <span>{middleBucketLabel}</span>
                <span>{lastBucketLabel}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-success" />
                Successful
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-warning" />
                Partial
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-destructive" />
                Failed
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-status-neutral" />
                Skipped
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function webhookDeliveryKey(event: WebhookEvent): string {
  return `${event.accountId}:${event.statementItemId ?? event.id}`;
}

function webhookDeliveryStatus(event: WebhookEvent): string {
  switch (event.status) {
    case "processed":
      return "reconciled";
    case "pending":
      return "pending reconcile";
    case "duplicate":
      return "duplicate";
    case "ignored":
      return "ignored";
    case "failed":
      return "failed";
  }
}

function webhookEventLabel(event: WebhookEvent): string {
  return event.type === "StatementItem" ? "Statement item" : event.type;
}

function webhookDeliveryDestination(event: WebhookEvent): string {
  return event.statementItemId ? "Statement pull queue" : "Local webhook inbox";
}

function webhookDeliveryAttemptCounts(
  events: readonly WebhookEvent[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const event of events) {
    const key = webhookDeliveryKey(event);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

export function RecentWebhookDeliveriesCard({
  events,
  onRouteChange,
  limit = 3,
}: {
  events: readonly WebhookEvent[];
  onRouteChange: (routeId: RouteId) => void;
  limit?: number;
}) {
  const visibleEvents = events.slice(0, limit);
  const attemptCounts = webhookDeliveryAttemptCounts(events);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest webhook deliveries</CardTitle>
        <CardDescription>
          Local delivery hints waiting for statement pull reconciliation.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => onRouteChange("sync")}
          >
            <FileClockIcon data-icon="inline-start" />
            Webhooks
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {visibleEvents.length === 0 ? (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>No webhook deliveries recorded</AlertTitle>
            <AlertDescription>
              Monobank webhook events will appear here as local pull-required
              hints.
            </AlertDescription>
          </Alert>
        ) : (
          visibleEvents.map((event) => {
            const attempts = attemptCounts.get(webhookDeliveryKey(event)) ?? 1;

            return (
              <div
                className="flex flex-col gap-3 rounded-lg border p-3"
                key={event.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {webhookEventLabel(event)}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {event.statementItemId ?? event.id}
                    </p>
                  </div>
                  <Badge
                    variant={
                      event.status === "failed"
                        ? "destructive"
                        : event.status === "processed"
                          ? "default"
                          : event.status === "duplicate"
                            ? "outline"
                            : "secondary"
                    }
                  >
                    {webhookDeliveryStatus(event)}
                  </Badge>
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Source account</p>
                    <p className="truncate font-medium">{event.accountId}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Local destination</p>
                    <p className="font-medium">
                      {webhookDeliveryDestination(event)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Attempts</p>
                    <p className="font-medium">{attempts}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Received</p>
                    <p className="font-medium">
                      {formatDateTime(event.receivedAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function RecentSyncRunsCard({
  runs,
  onRouteChange,
  limit = 3,
}: {
  runs: readonly SyncRun[];
  onRouteChange: (routeId: RouteId) => void;
  limit?: number;
}) {
  const visibleRuns = runs.slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent sync jobs</CardTitle>
        <CardDescription>
          Latest local sync activity with transaction counts and duration.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => onRouteChange("logs")}
          >
            <FileClockIcon data-icon="inline-start" />
            Logs
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {visibleRuns.length === 0 ? (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>No sync runs recorded</AlertTitle>
            <AlertDescription>
              Save a Monobank token, then run sync from the top bar to create
              the first local run.
            </AlertDescription>
          </Alert>
        ) : (
          visibleRuns.map((run) => (
            <div
              className="flex flex-col gap-3 rounded-lg border p-3"
              key={run.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{run.id}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(run.startedAt)} /{" "}
                    {formatSyncRunDuration(run)}
                  </p>
                </div>
                <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
              </div>
              <SyncRunStats run={run} />
              {run.errorMessage ? (
                <p className="text-xs text-muted-foreground">
                  {run.errorMessage}
                </p>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SyncRunsTable({ runs }: { runs: readonly SyncRun[] }) {
  if (runs.length === 0) {
    return (
      <Alert>
        <AlertCircleIcon />
        <AlertTitle>No sync runs recorded</AlertTitle>
        <AlertDescription>
          Save a Monobank token, then run sync from the top bar to create the
          first local run.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Run</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Transactions</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.slice(0, 10).map((run) => (
            <TableRow key={run.id}>
              <TableCell>
                <div className="max-w-52">
                  <p className="truncate font-mono text-xs">{run.id}</p>
                  <p className="text-xs text-muted-foreground">{run.profile}</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDateTime(run.startedAt)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <div className="grid gap-1">
                  <span>{formatSyncRunDuration(run)}</span>
                  {run.errorMessage ? (
                    <span className="max-w-64 text-xs text-muted-foreground">
                      {run.errorMessage}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{run.itemsSeen} seen</Badge>
                  <Badge variant="outline">{run.itemsInserted} inserted</Badge>
                  <Badge variant="outline">{run.itemsUpdated} updated</Badge>
                  <Badge variant="outline">{run.itemsSkipped} skipped</Badge>
                  <Badge variant="outline">{run.apiCalls} API calls</Badge>
                  <Badge variant="outline">{run.windowsFetched} windows</Badge>
                  {run.rateLimited > 0 ? (
                    <Badge variant="destructive">
                      {run.rateLimited} rate-limited
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{run.source}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function WebhookSettingsPanel({
  config,
}: {
  config: LocalAppSnapshot["config"] | undefined;
}) {
  const webhook = config?.webhook;
  const settings = [
    {
      label: "Profile",
      value: config?.profile ?? "Waiting for local API",
      mono: false,
    },
    {
      label: "Local API host",
      value: config?.access?.host ?? webhook?.host ?? "Unknown",
      mono: true,
    },
    {
      label: "Access",
      value:
        config?.access?.authentication === "passcode"
          ? "Passcode protected"
          : "Local browser only",
      mono: false,
    },
    {
      label: "Port",
      value: webhook ? String(webhook.port) : "Unknown",
      mono: true,
    },
    {
      label: "Path",
      value: webhook?.path ?? "Unknown",
      mono: true,
    },
    {
      label: "Enabled",
      value: webhook?.enabled ? "Enabled" : "Disabled",
      mono: false,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhook settings</CardTitle>
        <CardDescription>
          Local endpoint configuration used by the Monobank personal API.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Alert variant="warning">
          <AlertCircleIcon />
          <AlertTitle>Personal webhook payloads are hints</AlertTitle>
          <AlertDescription>
            Until Monobank documents a verifiable personal webhook signature,
            treat every payload as advisory and reconcile it through statement
            pulls before relying on ledger changes.
          </AlertDescription>
        </Alert>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {settings.map((setting) => (
            <div
              className="rounded-md border border-border bg-muted/30 px-3 py-2"
              key={setting.label}
            >
              <p className="text-xs text-muted-foreground">{setting.label}</p>
              {setting.label === "Enabled" ? (
                <Badge variant={webhook?.enabled ? "default" : "secondary"}>
                  {setting.value}
                </Badge>
              ) : (
                <p
                  className={
                    setting.mono
                      ? "break-all font-mono text-sm font-medium"
                      : "break-all text-sm font-medium"
                  }
                >
                  {setting.value}
                </p>
              )}
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Webhook endpoint</p>
          <p className="break-all font-mono text-sm font-medium">
            {webhook?.url ?? "Waiting for local API"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function StaleDataBanner({
  snapshot,
  syncing,
  onRunSync,
  onRouteChange,
}: {
  snapshot: LocalAppSnapshot | undefined;
  syncing: boolean;
  onRunSync: () => void;
  onRouteChange: (routeId: RouteId) => void;
}) {
  const warning = getLedgerFreshnessWarning(snapshot);

  if (!warning) {
    return null;
  }

  const needsMonobankToken =
    snapshot?.config.source === "monobank" &&
    snapshot.config.token.hasToken === false;
  const title = needsMonobankToken
    ? "Monobank token needed to refresh"
    : warning.title;
  const description = needsMonobankToken
    ? `${warning.description} Save a Monobank token before running sync again.`
    : warning.description;

  return (
    <Alert variant="warning">
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      <AlertAction className="static col-start-2 mt-2 flex flex-wrap gap-2">
        {needsMonobankToken ? (
          <Button
            size="sm"
            type="button"
            onClick={() => onRouteChange("settings")}
          >
            <KeyRoundIcon data-icon="inline-start" />
            Open token settings
          </Button>
        ) : (
          <Button
            size="sm"
            type="button"
            disabled={syncing}
            onClick={onRunSync}
          >
            <RefreshCwIcon data-icon="inline-start" />
            {syncing ? "Syncing" : "Run Sync"}
          </Button>
        )}
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => onRouteChange("sync")}
        >
          Sync controls
        </Button>
      </AlertAction>
    </Alert>
  );
}

export function OfflineBrowsingBanner({
  error,
  snapshot,
  loading,
  onRefresh,
}: {
  error: string | undefined;
  snapshot: LocalAppSnapshot | undefined;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (!error || !snapshot) {
    return null;
  }

  return (
    <Alert variant="info">
      <WifiOffIcon />
      <AlertTitle>Browsing last local snapshot</AlertTitle>
      <AlertDescription>
        The local API did not respond: {error}. Existing ledger data for{" "}
        {snapshot.config.profile} is still visible from the last successful load
        {snapshot.offline
          ? ` at ${formatDateTime(snapshot.offline.cachedAt)}`
          : ""}
        .
      </AlertDescription>
      <AlertAction className="static col-start-2 mt-2 flex flex-wrap gap-2">
        <Button size="sm" type="button" disabled={loading} onClick={onRefresh}>
          <RefreshCwIcon data-icon="inline-start" />
          {loading ? "Refreshing" : "Retry API"}
        </Button>
      </AlertAction>
    </Alert>
  );
}

export function LocalOnlyIndicator({
  snapshot,
  loading,
}: {
  snapshot: LocalAppSnapshot | undefined;
  loading: boolean;
}) {
  const access = snapshot?.config.access;
  const label = snapshot
    ? (access?.localOnly ?? snapshot.config.localOnly)
      ? "Local only"
      : access?.authentication === "passcode"
        ? "Passcode protected"
        : "External connection"
    : loading
      ? "Checking local"
      : "Local unavailable";
  const detail = snapshot
    ? `${snapshot.health.status} API on ${
        access?.host ?? snapshot.config.webhook.host
      } / ${snapshot.config.source} source / ${
        access?.authentication === "passcode" ? "passcode" : "no"
      } access gate`
    : "Waiting for the local Fastify API";
  const variant =
    (access?.localOnly ?? snapshot?.config.localOnly)
      ? "secondary"
      : access?.authentication === "passcode"
        ? "outline"
        : snapshot
          ? "destructive"
          : "outline";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className="hidden md:inline-flex" variant={variant}>
          <ShieldCheckIcon data-icon="inline-start" />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}

export function SyncRoute({
  snapshot,
  onRouteChange,
  onRefresh,
}: {
  snapshot: LocalAppSnapshot | undefined;
  onRouteChange: (routeId: RouteId) => void;
  onRefresh: () => Promise<void>;
}) {
  const syncRuns = snapshot?.syncRuns ?? [];
  const summaryStats = summarizeSyncRuns(syncRuns);
  const [storageActionState, setStorageActionState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved"; message: string }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function backupFromSyncRoute(): Promise<void> {
    setStorageActionState({ status: "saving" });

    try {
      const backup = await createLocalBackup();
      setStorageActionState({
        status: "saved",
        message: `Backup created at ${backup.backupPath}.`,
      });
      await onRefresh();
    } catch (error) {
      setStorageActionState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Database backup failed.",
      });
    }
  }

  async function compactFromSyncRoute(): Promise<void> {
    setStorageActionState({ status: "saving" });

    try {
      await compactLocalDatabase();
      setStorageActionState({
        status: "saved",
        message: "Database compacted.",
      });
      await onRefresh();
    } catch (error) {
      setStorageActionState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Database compact failed.",
      });
    }
  }

  return (
    <Tabs defaultValue="runs">
      <TabsList>
        <TabsTrigger value="runs">Runs</TabsTrigger>
        <TabsTrigger value="storage">Storage</TabsTrigger>
        <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
      </TabsList>
      <TabsContent value="runs">
        <Card>
          <CardHeader>
            <CardTitle>Recent sync runs</CardTitle>
            <CardDescription>
              Local execution history from the SQLite sync_runs table.
            </CardDescription>
            <CardAction>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => onRouteChange("logs")}
              >
                <FileClockIcon data-icon="inline-start" />
                Logs
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SyncRunSummaryStatsPanel summary={summaryStats} />
            <SyncRunsTable runs={syncRuns} />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="storage">
        <SyncStorageTab
          snapshot={snapshot}
          storageActionState={storageActionState}
          onBackup={backupFromSyncRoute}
          onCompact={compactFromSyncRoute}
          onRouteChange={onRouteChange}
        />
      </TabsContent>
      <TabsContent value="webhooks">
        <div className="grid gap-4">
          <Alert>
            <ShieldCheckIcon />
            <AlertTitle>Webhook events are sync hints</AlertTitle>
            <AlertDescription>
              Personal webhook payloads stay local and require reconciliation
              before becoming ledger truth. Until Monobank publishes a
              verifiable webhook signature, webhook payloads are treated as
              advisory hints and must pass local reconciliation to affect the
              ledger.
            </AlertDescription>
          </Alert>

          <WebhookSettingsPanel config={snapshot?.config} />
        </div>
      </TabsContent>
    </Tabs>
  );
}

type StorageActionState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; message: string }
  | { status: "error"; message: string };

function SyncStorageTab({
  snapshot,
  storageActionState,
  onBackup,
  onCompact,
  onRouteChange,
}: {
  snapshot: LocalAppSnapshot | undefined;
  storageActionState: StorageActionState;
  onBackup: () => Promise<void>;
  onCompact: () => Promise<void>;
  onRouteChange: (routeId: RouteId) => void;
}) {
  const storage = snapshot?.storage;
  const databasePathCopy = useCopyToClipboard();
  const dataDirCopy = useCopyToClipboard();
  const storageActionsDisabled = storageActionState.status === "saving";

  return (
    <Card data-testid="sync-storage-tab">
      <CardHeader>
        <CardTitle>Local storage</CardTitle>
        <CardDescription>
          Profile-scoped SQLite location, backups, and maintenance.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">
            {formatBytes(storage?.databaseBytes ?? 0)}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Database path</p>
            <p
              className="break-all font-medium"
              data-testid="storage-database-path"
            >
              {storage?.databasePath ?? "Waiting for local API"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Data directory</p>
            <p
              className="break-all font-medium"
              data-testid="storage-data-directory"
            >
              {storage?.dataDir ?? "Waiting for local API"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Database modified</p>
            <p className="font-medium" data-testid="storage-database-modified">
              {storage?.databaseModifiedAt
                ? formatDateTime(storage.databaseModifiedAt)
                : "Not available"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Last backup</p>
            <p className="break-all font-medium">
              {storage?.latestBackupPath ?? "No backup yet"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Last compact</p>
            <p className="font-medium">
              {storage?.lastCompactAt
                ? formatDateTime(storage.lastCompactAt)
                : "Not compacted"}
            </p>
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-muted-foreground">Recent backups</p>
          {(storage?.backups ?? []).length === 0 ? (
            <p className="rounded-md border border-border p-3 text-muted-foreground">
              No backups created yet.
            </p>
          ) : (
            <div className="grid gap-2">
              {(storage?.backups ?? []).slice(0, 3).map((backup) => (
                <div
                  className="grid gap-1 rounded-md border border-border p-3"
                  key={backup.path}
                >
                  <p className="break-all font-medium">{backup.path}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(backup.modifiedAt)} ·{" "}
                    {formatBytes(backup.bytes)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={storageActionsDisabled}
            onClick={() => void onBackup()}
          >
            <DownloadIcon data-icon="inline-start" />
            Backup now
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={storageActionsDisabled}
            onClick={() => void onCompact()}
          >
            <DatabaseIcon data-icon="inline-start" />
            Compact database
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              databasePathCopy.state.status === "copied" ||
              storage?.databasePath === undefined
            }
            onClick={() => {
              if (storage?.databasePath !== undefined) {
                void databasePathCopy.copy(storage.databasePath);
              }
            }}
            data-testid="storage-copy-database-path"
          >
            <CopyIcon data-icon="inline-start" />
            {databasePathCopy.state.status === "copied"
              ? "Copied database path"
              : "Copy database path"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              dataDirCopy.state.status === "copied" ||
              storage?.dataDir === undefined
            }
            onClick={() => {
              if (storage?.dataDir !== undefined) {
                void dataDirCopy.copy(storage.dataDir);
              }
            }}
            data-testid="storage-copy-data-directory"
          >
            <CopyIcon data-icon="inline-start" />
            {dataDirCopy.state.status === "copied"
              ? "Copied data directory"
              : "Copy data directory"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onRouteChange("settings")}
          >
            <SettingsIcon data-icon="inline-start" />
            Restore or delete
          </Button>
        </div>
        {databasePathCopy.state.status === "error" ? (
          <p className="text-xs text-destructive" role="status">
            {databasePathCopy.state.message ??
              "Could not copy the database path."}
          </p>
        ) : null}
        {dataDirCopy.state.status === "error" ? (
          <p className="text-xs text-destructive" role="status">
            {dataDirCopy.state.message ?? "Could not copy the data directory."}
          </p>
        ) : null}
        <details
          className="rounded-md border border-border p-3"
          data-testid="storage-details"
        >
          <summary className="cursor-pointer text-sm font-medium">
            Storage details (integrity, migrations, row counts)
          </summary>
          <div className="mt-2 grid gap-2 text-xs">
            <p data-testid="storage-integrity">
              <span className="text-muted-foreground">Integrity check:</span>{" "}
              <code>{storage?.integrityCheck ?? "ok"}</code>
            </p>
            <p>
              <span className="text-muted-foreground">Page count:</span>{" "}
              {storage?.pageCount ?? 0} ·{" "}
              <span className="text-muted-foreground">Page size:</span>{" "}
              {storage?.pageSize ?? 0} bytes
            </p>
            <p>
              <span className="text-muted-foreground">Migrations:</span>{" "}
              {storage?.migrations.length ?? 0} applied
            </p>
            <ul
              className="ml-4 list-disc text-muted-foreground"
              data-testid="storage-migrations"
            >
              {(storage?.migrations ?? []).map((migration) => (
                <li key={migration}>
                  <code>{migration}</code>
                </li>
              ))}
            </ul>
            <p data-testid="storage-row-counts">
              <span className="text-muted-foreground">Row counts:</span>{" "}
              accounts {storage?.accounts ?? 0} · ledger entries{" "}
              {storage?.ledgerEntries ?? 0} · sync runs {storage?.syncRuns ?? 0}{" "}
              · webhook events {storage?.webhookEvents ?? 0}
            </p>
          </div>
        </details>
        {storageActionState.status === "saved" && (
          <p className="text-xs text-muted-foreground">
            {storageActionState.message}
          </p>
        )}
        {storageActionState.status === "error" && (
          <p className="text-xs text-destructive">
            {storageActionState.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
