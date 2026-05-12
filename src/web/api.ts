export interface LocalApiHealth {
  status: "ok";
  localOnly: true;
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
  rawStatementItemId: string;
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

export interface LocalAppSnapshot {
  health: LocalApiHealth;
  config: LocalApiAppConfig;
  summary: LedgerSummary;
  accounts: readonly LedgerAccount[];
  transactions: LedgerEntryPage;
  syncRuns: readonly SyncRun[];
  fixtures?: LocalApiFixtureSummary;
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

export async function loadLocalAppSnapshot(): Promise<LocalAppSnapshot> {
  const [health, config, summary, accounts, transactions, syncRuns] =
    await Promise.all([
      requestJson<LocalApiHealth>("/api/health"),
      requestJson<LocalApiAppConfig>("/api/app/config"),
      requestJson<LedgerSummary>("/api/ledger/summary"),
      requestJson<readonly LedgerAccount[]>("/api/ledger/accounts"),
      loadLedgerTransactions({ limit: 8 }),
      requestJson<readonly SyncRun[]>("/api/sync/runs"),
    ]);

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
    ...(fixtures ? { fixtures } : {}),
  };
}

export async function runFixtureSync(): Promise<void> {
  await requestJson("/api/sync/run", {
    method: "POST",
  });
}
