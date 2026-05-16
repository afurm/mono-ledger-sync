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

export interface LocalApiAppConfig {
  profile: string;
  source: "fixture" | "monobank";
  dataDir: string;
  databasePath: string;
  localOnly: true;
}

export interface LedgerSummary {
  profile: string;
  accounts: number;
  ledgerEntries: number;
  income: number;
  expenses: number;
  net: number;
  currencies: readonly number[];
  lastSyncedAt?: string;
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
  itemsSeen: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsSkipped: number;
}

export interface WebhookEvent {
  id: string;
  profile: string;
  accountId: string;
  type: string;
  statementItemId?: string;
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

export type LocalActivityEventType =
  | "sync_run"
  | "webhook_delivery"
  | "export"
  | "rule_application"
  | "warning"
  | "error";

export type LocalActivityEventSeverity =
  | "info"
  | "success"
  | "partial"
  | "warning"
  | "error";

export interface LocalActivityEvent {
  id: string;
  type: LocalActivityEventType;
  title: string;
  details: string;
  timestamp: string;
  severity: LocalActivityEventSeverity;
  source: string;
  referenceId?: string;
}

export interface LocalAppSnapshot {
  health: LocalApiHealth;
  config: LocalApiAppConfig;
  summary: LedgerSummary;
  accounts: readonly LedgerAccount[];
  transactions: LedgerEntryPage;
  syncRuns: readonly SyncRun[];
  webhookEvents: readonly WebhookEvent[];
  activityEvents: readonly LocalActivityEvent[];
  fixtures?: LocalApiFixtureSummary;
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

function buildLocalActivityEvents(
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
  }

  for (const event of webhookEvents) {
    events.push({
      id: `webhook:${event.id}`,
      type: "webhook_delivery",
      title: `Webhook ${event.type}`,
      details: `account ${event.accountId}${event.statementItemId ? ` • statement ${event.statementItemId}` : ""}`,
      timestamp: event.receivedAt,
      severity: event.processedAt ? "success" : "warning",
      source: event.accountId,
      referenceId: event.id,
    });

    if (!event.processedAt) {
      events.push({
        id: `webhook:${event.id}:warning`,
        type: "warning",
        title: "Webhook not reconciled",
        details: `Pending pull for ${event.accountId} ${event.statementItemId ? `statement ${event.statementItemId}` : ""}`,
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

export async function loadLocalAppSnapshot(): Promise<LocalAppSnapshot> {
  const [
    health,
    config,
    summary,
    accounts,
    transactions,
    syncRuns,
    webhookEvents,
  ] = await Promise.all([
    requestJson<LocalApiHealth>("/api/health"),
    requestJson<LocalApiAppConfig>("/api/app/config"),
    requestJson<LedgerSummary>("/api/ledger/summary"),
    requestJson<readonly LedgerAccount[]>("/api/ledger/accounts"),
    loadLedgerTransactions({ limit: 8 }),
    requestJson<readonly SyncRun[]>("/api/sync/runs"),
    requestJson<readonly WebhookEvent[]>("/api/webhooks/events"),
  ]);

  const activityEvents = buildLocalActivityEvents(syncRuns, webhookEvents);

  const fixtures =
    config.source === "fixture"
      ? await requestJson<LocalApiFixtureSummary>("/api/fixtures/summary")
      : undefined;

  return {
    health,
    config,
    summary,
    accounts,
    transactions,
    syncRuns,
    webhookEvents,
    activityEvents,
    ...(fixtures ? { fixtures } : {}),
  };
}

export async function runFixtureSync(): Promise<void> {
  await requestJson("/api/sync/run", {
    method: "POST",
  });
}
