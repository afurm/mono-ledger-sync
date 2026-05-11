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

export interface LedgerEntry {
  id: string;
  accountId: string;
  time: number;
  description: string;
  amount: number;
  currencyCode: number;
  categoryId?: string;
  rawStatementItemId: string;
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
