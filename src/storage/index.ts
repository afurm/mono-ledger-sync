export type SyncRunStatus =
  | "queued"
  | "running"
  | "success"
  | "partial"
  | "failed";

export interface AccountBalance {
  accountId: string;
  currencyCode: number;
  balance: number;
  creditLimit?: number;
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

export interface LedgerEntryQuery {
  profile: string;
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
}

export interface LedgerEntryPage {
  entries: readonly LedgerEntry[];
  total: number;
  limit: number;
  offset: number;
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

export interface SyncCursor {
  profile: string;
  accountId: string;
  source: "fixture" | "monobank";
  statementFrom: number;
  statementTo: number;
  updatedAt: string;
}

export interface SyncRun {
  id: string;
  profile: string;
  source: "fixture" | "monobank";
  status: SyncRunStatus;
  startedAt: string;
  finishedAt?: string;
  itemsSeen: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsSkipped: number;
}

export interface LedgerWriteStats {
  inserted: number;
  updated: number;
  skipped: number;
}

export interface StoredWebhookEvent {
  id: string;
  profile: string;
  accountId: string;
  type: string;
  statementItemId?: string;
  receivedAt: string;
  processedAt?: string;
}

export interface LedgerDbTransaction {
  upsertLedgerEntries(entries: readonly LedgerEntry[]): Promise<void>;
  setSyncCursor(cursor: SyncCursor): Promise<void>;
}

export interface LedgerDb {
  migrate(): Promise<void>;
  transaction<T>(callback: (tx: LedgerDbTransaction) => Promise<T>): Promise<T>;
  getAccountBalances(profile: string): Promise<readonly AccountBalance[]>;
  getSyncCursor(
    profile: string,
    accountId: string,
  ): Promise<SyncCursor | undefined>;
  recordSyncRun(run: SyncRun): Promise<void>;
}
