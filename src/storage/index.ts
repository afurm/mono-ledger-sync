import type {
  AccountBalance,
  LedgerAccount,
  LedgerEntry,
  LedgerEntryAnnotationUpdate,
  LedgerEntryPage,
  Category,
  LedgerEntryQuery,
  LedgerEntrySplitPlanUpdate,
  LedgerSummary,
  LedgerWriteStats,
  SyncCursor,
  SyncRun,
  SyncRunStatus,
  StoredWebhookEvent,
  ledgerEntrySortDirections,
  ledgerEntrySortFields,
} from "../domain/index.js";

export type {
  AccountBalance,
  LedgerAccount,
  LedgerEntry,
  LedgerEntryAnnotationUpdate,
  LedgerEntrySplitPlanUpdate,
  LedgerEntryPage,
  Category,
  LedgerEntryQuery,
  LedgerSummary,
  SyncCursor,
  SyncRun,
  SyncRunStatus,
  StoredWebhookEvent,
  LedgerWriteStats,
} from "../domain/index.js";

import type {
  MonobankAccount,
  MonobankJar,
  MonobankStatementItem,
} from "../monobank/index.js";

export type LedgerEntrySortField = (typeof ledgerEntrySortFields)[number];
export type LedgerEntrySortDirection =
  (typeof ledgerEntrySortDirections)[number];

export {
  ledgerEntrySortFields,
  ledgerEntrySortDirections,
  syncRunStatuses,
} from "../domain/index.js";
export {
  createLedgerQueryService,
  createLedgerServices,
  createLedgerWriteService,
  type LedgerQueryService,
  type LedgerServices,
  type LedgerWriteService,
} from "./services.js";

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
  listCategories(profile?: string): Promise<readonly Category[]>;
  listWebhookEvents(
    profile?: string,
    limit?: number,
  ): Promise<readonly StoredWebhookEvent[]>;
}
