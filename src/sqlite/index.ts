import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import type BetterSqlite3 from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  MonobankAccount,
  MonobankCurrencyRate,
  MonobankJar,
  MonobankPersonalWebhookEvent,
  MonobankStatementItem,
} from "../monobank/index.js";
import type {
  AccountBalance,
  LedgerAccount,
  Category,
  LedgerDb,
  LedgerDbTransaction,
  LedgerEntry,
  LedgerEntryAnnotationUpdate,
  LedgerEntrySplitPlanUpdate,
  LedgerEntryPage,
  LedgerEntryQuery,
  LedgerEntrySortField,
  LedgerSummary,
  LedgerWriteStats,
  StoredWebhookEvent,
  SyncCursor,
  SyncRun,
} from "../storage/index.js";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as typeof BetterSqlite3;

export const sqliteStorageEngine = "sqlite";

const ledgerEntrySortColumns: Record<LedgerEntrySortField, string> = {
  time: "time",
  merchant: "LOWER(COALESCE(merchant_name, description, ''))",
  amount: "amount",
  account: "account_id",
  category: "LOWER(COALESCE(category_name, category_id, ''))",
  status: "hold",
};

export interface SqliteLedgerDbOptions {
  filePath: string;
  profile: string;
  readonly?: boolean;
}

export interface SqliteMigration {
  id: string;
  description: string;
  sql: string;
}

export interface SqliteDatabaseInfo {
  filePath: string;
  profile: string;
  migrations: readonly string[];
  integrityCheck: string;
  pageCount: number;
  pageSize: number;
  bytes: number;
  accounts: number;
  ledgerEntries: number;
  syncRuns: number;
  webhookEvents: number;
}

export interface SqliteLedgerDb extends LedgerDb {
  readonly filePath: string;
  readonly profile: string;
  upsertAccounts(
    accounts: readonly MonobankAccount[],
  ): Promise<LedgerWriteStats>;
  upsertJars(jars: readonly MonobankJar[]): Promise<LedgerWriteStats>;
  upsertCurrencyRates(
    rates: readonly MonobankCurrencyRate[],
  ): Promise<LedgerWriteStats>;
  upsertStatementItems(
    accountId: string,
    items: readonly MonobankStatementItem[],
    entries: readonly LedgerEntry[],
  ): Promise<LedgerWriteStats>;
  listAccounts(profile?: string): Promise<readonly LedgerAccount[]>;
  listLedgerEntries(query: LedgerEntryQuery): Promise<LedgerEntryPage>;
  updateLedgerEntryAnnotation(
    profile: string,
    id: string,
    update: LedgerEntryAnnotationUpdate,
  ): Promise<LedgerEntry | undefined>;
  updateLedgerEntrySplitPlan(
    profile: string,
    id: string,
    update: LedgerEntrySplitPlanUpdate,
  ): Promise<LedgerEntry | undefined>;
  getLedgerSummary(profile?: string): Promise<LedgerSummary>;
  listCategories(profile?: string): Promise<readonly Category[]>;
  listSyncRuns(profile?: string, limit?: number): Promise<readonly SyncRun[]>;
  listWebhookEvents(
    profile?: string,
    limit?: number,
  ): Promise<readonly StoredWebhookEvent[]>;
  recordWebhookEvent(
    event: MonobankPersonalWebhookEvent,
    receivedAt?: string,
    deliveryMetadata?: Readonly<Record<string, string>>,
  ): Promise<StoredWebhookEvent>;
  getDatabaseInfo(profile?: string): Promise<SqliteDatabaseInfo>;
  compact(): Promise<void>;
  close(): Promise<void>;
}

interface SqliteAccountRow {
  id: string;
  type: string;
  currency_code: number;
  balance: number;
  credit_limit: number;
  masked_pan_json: string | null;
  updated_at: string;
}

interface SqliteLedgerEntryRow {
  id: string;
  account_id: string;
  time: number;
  description: string;
  amount: number;
  operation_amount: number | null;
  currency_code: number;
  category_id: string | null;
  category_name: string | null;
  merchant_name: string | null;
  raw_statement_item_id: string;
  hold: number;
  balance: number | null;
  note: string | null;
  tags_json: string | null;
  split_plan_json: string | null;
  created_at: string;
  updated_at: string;
}

interface SqliteRawStatementItemRow {
  payload_json: string;
}

interface SqliteSyncCursorRow {
  profile: string;
  account_id: string;
  source: "fixture" | "monobank";
  statement_from: number;
  statement_to: number;
  updated_at: string;
}

interface SqliteSyncRunRow {
  id: string;
  profile: string;
  source: "fixture" | "monobank";
  status: SyncRun["status"];
  started_at: string;
  finished_at: string | null;
  api_calls: number;
  windows_fetched: number;
  items_seen: number;
  items_inserted: number;
  items_updated: number;
  items_skipped: number;
  rate_limited: number;
}

interface SqliteWebhookEventRow {
  id: string;
  profile: string;
  account_id: string;
  type: string;
  statement_item_id: string | null;
  received_at: string;
  processed_at: string | null;
  payload_hash?: string;
  delivery_fingerprint?: string;
}

interface SqliteSummaryRow {
  accounts: number;
  ledger_entries: number;
  income: number | null;
  expenses: number | null;
  net: number | null;
  currencies_json: string;
  last_synced_at: string | null;
}

interface SqliteCategoryRow {
  id: string;
  profile: string;
  name: string;
  color: string | null;
  description: string;
  is_system: number;
  created_at: string;
  updated_at: string;
}

const migrations: readonly SqliteMigration[] = [
  {
    id: "0001_local_ledger",
    description: "Create local ledger tables",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profiles (
        name TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        profile TEXT NOT NULL,
        id TEXT NOT NULL,
        type TEXT NOT NULL,
        currency_code INTEGER NOT NULL,
        balance INTEGER NOT NULL,
        credit_limit INTEGER NOT NULL,
        masked_pan_json TEXT,
        raw_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, id),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE TABLE IF NOT EXISTS jars (
        profile TEXT NOT NULL,
        id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        currency_code INTEGER NOT NULL,
        balance INTEGER NOT NULL,
        goal INTEGER NOT NULL,
        raw_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, id),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE TABLE IF NOT EXISTS currency_rates (
        profile TEXT NOT NULL,
        currency_code_a INTEGER NOT NULL,
        currency_code_b INTEGER NOT NULL,
        date INTEGER NOT NULL,
        rate_buy REAL,
        rate_sell REAL,
        rate_cross REAL,
        raw_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, currency_code_a, currency_code_b, date),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE TABLE IF NOT EXISTS raw_statement_items (
        profile TEXT NOT NULL,
        account_id TEXT NOT NULL,
        statement_item_id TEXT NOT NULL,
        time INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, account_id, statement_item_id),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE TABLE IF NOT EXISTS ledger_entries (
        profile TEXT NOT NULL,
        id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        time INTEGER NOT NULL,
        description TEXT NOT NULL,
        amount INTEGER NOT NULL,
        operation_amount INTEGER,
        currency_code INTEGER NOT NULL,
        category_id TEXT,
        category_name TEXT,
        merchant_name TEXT,
        raw_statement_item_id TEXT NOT NULL,
        hold INTEGER NOT NULL,
        balance INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, id),
        UNIQUE (profile, account_id, raw_statement_item_id),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE TABLE IF NOT EXISTS sync_cursors (
        profile TEXT NOT NULL,
        account_id TEXT NOT NULL,
        source TEXT NOT NULL,
        statement_from INTEGER NOT NULL,
        statement_to INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, account_id, source),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE TABLE IF NOT EXISTS sync_runs (
        id TEXT PRIMARY KEY,
        profile TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        items_seen INTEGER NOT NULL,
        items_inserted INTEGER NOT NULL,
        items_updated INTEGER NOT NULL,
        items_skipped INTEGER NOT NULL,
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE TABLE IF NOT EXISTS webhook_events (
        id TEXT PRIMARY KEY,
        profile TEXT NOT NULL,
        account_id TEXT NOT NULL,
        type TEXT NOT NULL,
        statement_item_id TEXT,
        received_at TEXT NOT NULL,
        processed_at TEXT,
        payload_json TEXT NOT NULL,
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE INDEX IF NOT EXISTS idx_ledger_entries_profile_time
        ON ledger_entries(profile, time DESC);
      CREATE INDEX IF NOT EXISTS idx_ledger_entries_profile_account
        ON ledger_entries(profile, account_id, time DESC);
      CREATE INDEX IF NOT EXISTS idx_sync_runs_profile_started
        ON sync_runs(profile, started_at DESC);
    `,
  },
  {
    id: "0002_ledger_entry_annotations",
    description: "Add local transaction notes and tags",
    sql: `
      ALTER TABLE ledger_entries ADD COLUMN note TEXT;
      ALTER TABLE ledger_entries ADD COLUMN tags_json TEXT;
    `,
  },
  {
    id: "0003_transaction_split_plan",
    description: "Add local transaction split plans",
    sql: `
      ALTER TABLE ledger_entries ADD COLUMN split_plan_json TEXT;
    `,
  },
  {
    id: "0004_sync_run_stats_columns",
    description: "Add API summary counters to sync_runs",
    sql: `
      ALTER TABLE sync_runs ADD COLUMN api_calls INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sync_runs ADD COLUMN windows_fetched INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sync_runs ADD COLUMN rate_limited INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    id: "0005_webhook_delivery_dedup",
    description: "Add webhook dedupe metadata",
    sql: `
      ALTER TABLE webhook_events ADD COLUMN payload_hash TEXT NOT NULL DEFAULT '';
      ALTER TABLE webhook_events ADD COLUMN delivery_fingerprint TEXT NOT NULL DEFAULT '';

      UPDATE webhook_events
        SET payload_hash = id
        WHERE payload_hash IS NULL OR payload_hash = '';

      UPDATE webhook_events
        SET delivery_fingerprint = ''
        WHERE delivery_fingerprint IS NULL OR delivery_fingerprint = '';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_dedup
        ON webhook_events(profile, payload_hash, delivery_fingerprint);
    `,
  },
  {
    id: "0006_categories",
    description: "Add categories storage",
    sql: `
      CREATE TABLE IF NOT EXISTS categories (
        profile TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        description TEXT NOT NULL,
        is_system INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, id),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE INDEX IF NOT EXISTS idx_categories_profile
        ON categories(profile, id);
    `,
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function emptyWriteStats(): LedgerWriteStats {
  return {
    inserted: 0,
    updated: 0,
    skipped: 0,
  };
}

function addWriteStats(
  left: LedgerWriteStats,
  right: LedgerWriteStats,
): LedgerWriteStats {
  return {
    inserted: left.inserted + right.inserted,
    updated: left.updated + right.updated,
    skipped: left.skipped + right.skipped,
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function webhookPayloadHash(event: MonobankPersonalWebhookEvent): string {
  return createHash("sha256").update(stableStringify(event)).digest("hex");
}

function webhookDeliveryFingerprint(
  deliveryMetadata?: Readonly<Record<string, string>>,
): string {
  if (!deliveryMetadata) {
    return "";
  }

  return createHash("sha256")
    .update(
      stableStringify(
        Object.entries(deliveryMetadata)
          .filter(([, value]) => value.trim().length > 0)
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    )
    .digest("hex");
}

function webhookEventId(
  event: MonobankPersonalWebhookEvent,
  payloadHash: string,
  deliveryFingerprint: string,
): string {
  return createHash("sha256")
    .update(
      stableStringify({
        account: event.data.account,
        statementItemId: event.data.statementItem.id ?? "missing-id",
        payloadHash,
        deliveryFingerprint,
      }),
    )
    .digest("hex");
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 100;
  }

  return Math.max(1, Math.min(Math.trunc(limit), 500));
}

function normalizeOffset(offset: number | undefined): number {
  if (offset === undefined) {
    return 0;
  }

  return Math.max(0, Math.trunc(offset));
}

function parseMaskedPan(value: string | null): readonly string[] | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    return undefined;
  }

  return parsed.filter((item): item is string => typeof item === "string");
}

function parseTags(value: string | null): readonly string[] | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    return undefined;
  }

  const tags = parsed.filter((item): item is string => {
    return typeof item === "string" && item.trim() !== "";
  });

  return tags.length > 0 ? tags : undefined;
}

function parseSplitPlan(
  value: string | null,
): readonly { category: string; amount: number }[] | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    return undefined;
  }

  const lines = parsed
    .map((entry): { category: string; amount: number } | undefined => {
      if (typeof entry !== "object" || entry === null) {
        return undefined;
      }

      const record = entry as Record<string, unknown>;
      const category =
        typeof record.category === "string" ? record.category.trim() : "";
      const amount = Number(record.amount);

      if (!category || !Number.isInteger(amount)) {
        return undefined;
      }

      return { category, amount };
    })
    .filter((entry): entry is { category: string; amount: number } => {
      return entry !== undefined;
    });

  return lines.length > 0 ? lines : undefined;
}

function normalizeLedgerEntrySplitPlan(update: LedgerEntrySplitPlanUpdate): {
  splitPlanJson: string | null | undefined;
} {
  if (update.lines === undefined) {
    return {
      splitPlanJson: undefined,
    };
  }

  const lines = update.lines
    .map((entry) => ({
      category: entry.category.trim(),
      amount: Number(entry.amount),
    }))
    .filter((entry) => entry.category && Number.isInteger(entry.amount));

  return {
    splitPlanJson: lines.length === 0 ? null : JSON.stringify(lines),
  };
}

function normalizeLedgerEntryAnnotation(update: LedgerEntryAnnotationUpdate): {
  note: string | null | undefined;
  tagsJson: string | null | undefined;
} {
  const note = update.note === undefined ? undefined : update.note.trim();
  const tags =
    update.tags === undefined
      ? undefined
      : [...new Set(update.tags.map((tag) => tag.trim()).filter(Boolean))];

  return {
    note: note === undefined ? undefined : note === "" ? null : note,
    tagsJson:
      tags === undefined
        ? undefined
        : tags.length === 0
          ? null
          : JSON.stringify(tags),
  };
}

function mapAccountRow(row: SqliteAccountRow): LedgerAccount {
  const account: LedgerAccount = {
    id: row.id,
    type: row.type,
    currencyCode: row.currency_code,
    balance: row.balance,
    creditLimit: row.credit_limit,
    updatedAt: row.updated_at,
  };
  const maskedPan = parseMaskedPan(row.masked_pan_json);

  if (maskedPan) {
    account.maskedPan = maskedPan;
  }

  return account;
}

function mapCategoryRow(row: SqliteCategoryRow): Category {
  const category: Category = {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };

  if (row.color !== null) {
    category.color = row.color;
  }

  if (row.description !== "") {
    category.description = row.description;
  }

  if (row.is_system === 1) {
    category.isSystem = true;
  }

  if (row.updated_at !== row.created_at) {
    category.updatedAt = row.updated_at;
  }

  return category;
}

function mapLedgerEntryRow(row: SqliteLedgerEntryRow): LedgerEntry {
  const entry: LedgerEntry = {
    id: row.id,
    accountId: row.account_id,
    time: row.time,
    description: row.description,
    amount: row.amount,
    currencyCode: row.currency_code,
    rawStatementItemId: row.raw_statement_item_id,
    hold: row.hold === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.operation_amount !== null) {
    entry.operationAmount = row.operation_amount;
  }

  if (row.category_id !== null) {
    entry.categoryId = row.category_id;
  }

  if (row.category_name !== null) {
    entry.categoryName = row.category_name;
  }

  if (row.merchant_name !== null) {
    entry.merchantName = row.merchant_name;
  }

  if (row.balance !== null) {
    entry.balance = row.balance;
  }

  if (row.note !== null) {
    entry.note = row.note;
  }

  const tags = parseTags(row.tags_json);

  if (tags) {
    entry.tags = tags;
  }

  const splitPlan = parseSplitPlan(row.split_plan_json);

  if (splitPlan) {
    entry.splitPlan = splitPlan;
  }

  return entry;
}

function mapSyncCursorRow(row: SqliteSyncCursorRow): SyncCursor {
  return {
    profile: row.profile,
    accountId: row.account_id,
    source: row.source,
    statementFrom: row.statement_from,
    statementTo: row.statement_to,
    updatedAt: row.updated_at,
  };
}

function mapSyncRunRow(row: SqliteSyncRunRow): SyncRun {
  const run: SyncRun = {
    id: row.id,
    profile: row.profile,
    source: row.source,
    status: row.status,
    startedAt: row.started_at,
    apiCalls: row.api_calls,
    windowsFetched: row.windows_fetched,
    itemsSeen: row.items_seen,
    itemsInserted: row.items_inserted,
    itemsUpdated: row.items_updated,
    itemsSkipped: row.items_skipped,
    rateLimited: row.rate_limited,
  };

  if (row.finished_at !== null) {
    run.finishedAt = row.finished_at;
  }

  return run;
}

function mapWebhookEventRow(row: SqliteWebhookEventRow): StoredWebhookEvent {
  const event: StoredWebhookEvent = {
    id: row.id,
    profile: row.profile,
    accountId: row.account_id,
    type: row.type,
    receivedAt: row.received_at,
  };

  if (row.statement_item_id !== null) {
    event.statementItemId = row.statement_item_id;
  }

  if (row.processed_at !== null) {
    event.processedAt = row.processed_at;
  }

  return event;
}

function ensureParentDirectory(filePath: string): void {
  if (filePath === ":memory:") {
    return;
  }

  mkdirSync(dirname(filePath), { recursive: true });
}

function buildLedgerEntryWhereClause(query: LedgerEntryQuery): {
  sql: string;
  params: Record<string, string | number>;
} {
  const clauses = ["profile = @profile"];
  const params: Record<string, string | number> = {
    profile: query.profile,
  };

  if (query.accountId) {
    clauses.push("account_id = @accountId");
    params.accountId = query.accountId;
  }

  if (query.categoryId) {
    clauses.push("category_id = @categoryId");
    params.categoryId = query.categoryId;
  }

  if (query.merchantName?.trim()) {
    clauses.push("merchant_name LIKE @merchantName");
    params.merchantName = `%${query.merchantName.trim()}%`;
  }

  if (query.status === "hold") {
    clauses.push("hold = 1");
  }

  if (query.status === "posted") {
    clauses.push("hold = 0");
  }

  if (query.amountMin !== undefined) {
    clauses.push("amount >= @amountMin");
    params.amountMin = query.amountMin;
  }

  if (query.amountMax !== undefined) {
    clauses.push("amount <= @amountMax");
    params.amountMax = query.amountMax;
  }

  if (query.from !== undefined) {
    clauses.push("time >= @from");
    params.from = query.from;
  }

  if (query.to !== undefined) {
    clauses.push("time <= @to");
    params.to = query.to;
  }

  if (query.search?.trim()) {
    clauses.push(
      "(description LIKE @search OR merchant_name LIKE @search OR category_name LIKE @search OR note LIKE @search OR tags_json LIKE @search)",
    );
    params.search = `%${query.search.trim()}%`;
  }

  return {
    sql: clauses.join(" AND "),
    params,
  };
}

function buildLedgerEntryOrderByClause(query: LedgerEntryQuery): string {
  const sortBy = query.sortBy ?? "time";
  const sortDirection = query.sortDirection === "asc" ? "ASC" : "DESC";
  const sortColumn = ledgerEntrySortColumns[sortBy];

  if (sortBy === "time") {
    return `${sortColumn} ${sortDirection}, id ${sortDirection}`;
  }

  return `${sortColumn} ${sortDirection}, time DESC, id DESC`;
}

class BetterSqliteLedgerDb implements SqliteLedgerDb {
  readonly filePath: string;
  readonly profile: string;
  readonly #database: BetterSqliteDatabase;

  constructor(options: SqliteLedgerDbOptions) {
    this.filePath = options.filePath;
    this.profile = options.profile.trim() || "default";
    ensureParentDirectory(this.filePath);
    this.#database = new Database(this.filePath, {
      readonly: options.readonly ?? false,
    });
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("journal_mode = WAL");
  }

  async migrate(): Promise<void> {
    this.#database.exec("BEGIN");

    try {
      this.#database.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
      `);

      const hasMigration = this.#database.prepare(
        "SELECT 1 FROM schema_migrations WHERE id = ?",
      );
      const recordMigration = this.#database.prepare(
        "INSERT INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)",
      );

      for (const migration of migrations) {
        if (hasMigration.get(migration.id)) {
          continue;
        }

        this.#database.exec(migration.sql);
        recordMigration.run(migration.id, migration.description, nowIso());
      }

      this.ensureProfile();
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async transaction<T>(
    callback: (tx: LedgerDbTransaction) => Promise<T>,
  ): Promise<T> {
    this.#database.exec("BEGIN");

    const tx: LedgerDbTransaction = {
      upsertLedgerEntries: async (entries) => {
        for (const entry of entries) {
          this.upsertLedgerEntry(entry);
        }
      },
      setSyncCursor: async (cursor) => {
        this.setSyncCursorSync(cursor);
      },
    };

    try {
      const result = await callback(tx);
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async getAccountBalances(
    profile = this.profile,
  ): Promise<readonly AccountBalance[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT id AS accountId, currency_code AS currencyCode, balance, credit_limit AS creditLimit
          FROM accounts
          WHERE profile = ?
          ORDER BY id
        `,
      )
      .all(profile) as AccountBalance[];

    return rows;
  }

  async getSyncCursor(
    profile: string,
    accountId: string,
  ): Promise<SyncCursor | undefined> {
    const row = this.#database
      .prepare(
        `
          SELECT profile, account_id, source, statement_from, statement_to, updated_at
          FROM sync_cursors
          WHERE profile = ? AND account_id = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .get(profile, accountId) as SqliteSyncCursorRow | undefined;

    return row ? mapSyncCursorRow(row) : undefined;
  }

  async recordSyncRun(run: SyncRun): Promise<void> {
    this.#database
      .prepare(
        `
          INSERT INTO sync_runs (
            id, profile, source, status, started_at, finished_at,
            api_calls, windows_fetched, items_seen, items_inserted, items_updated, items_skipped, rate_limited
          )
          VALUES (
            @id, @profile, @source, @status, @startedAt, @finishedAt,
            @apiCalls, @windowsFetched, @itemsSeen, @itemsInserted, @itemsUpdated, @itemsSkipped, @rateLimited
          )
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            finished_at = excluded.finished_at,
            api_calls = excluded.api_calls,
            windows_fetched = excluded.windows_fetched,
            items_seen = excluded.items_seen,
            items_inserted = excluded.items_inserted,
            items_updated = excluded.items_updated,
            items_skipped = excluded.items_skipped,
            rate_limited = excluded.rate_limited
        `,
      )
      .run({
        id: run.id,
        profile: run.profile,
        source: run.source,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt ?? null,
        apiCalls: run.apiCalls,
        windowsFetched: run.windowsFetched,
        itemsSeen: run.itemsSeen,
        itemsInserted: run.itemsInserted,
        itemsUpdated: run.itemsUpdated,
        itemsSkipped: run.itemsSkipped,
        rateLimited: run.rateLimited,
      });
  }

  async upsertAccounts(
    accounts: readonly MonobankAccount[],
  ): Promise<LedgerWriteStats> {
    const stats = emptyWriteStats();
    const exists = this.#database.prepare(
      "SELECT 1 FROM accounts WHERE profile = ? AND id = ?",
    );
    const upsert = this.#database.prepare(`
      INSERT INTO accounts (
        profile, id, type, currency_code, balance, credit_limit,
        masked_pan_json, raw_json, updated_at
      )
      VALUES (
        @profile, @id, @type, @currencyCode, @balance, @creditLimit,
        @maskedPanJson, @rawJson, @updatedAt
      )
      ON CONFLICT(profile, id) DO UPDATE SET
        type = excluded.type,
        currency_code = excluded.currency_code,
        balance = excluded.balance,
        credit_limit = excluded.credit_limit,
        masked_pan_json = excluded.masked_pan_json,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `);

    const write = this.#database.transaction(() => {
      for (const account of accounts) {
        const existed = Boolean(exists.get(this.profile, account.id));
        upsert.run({
          profile: this.profile,
          id: account.id,
          type: account.type,
          currencyCode: account.currencyCode,
          balance: account.balance,
          creditLimit: account.creditLimit,
          maskedPanJson: account.maskedPan
            ? JSON.stringify(account.maskedPan)
            : null,
          rawJson: JSON.stringify(account),
          updatedAt: nowIso(),
        });

        if (existed) {
          stats.updated += 1;
        } else {
          stats.inserted += 1;
        }
      }
    });
    write();

    return stats;
  }

  async upsertJars(jars: readonly MonobankJar[]): Promise<LedgerWriteStats> {
    const stats = emptyWriteStats();
    const exists = this.#database.prepare(
      "SELECT 1 FROM jars WHERE profile = ? AND id = ?",
    );
    const upsert = this.#database.prepare(`
      INSERT INTO jars (
        profile, id, title, description, currency_code,
        balance, goal, raw_json, updated_at
      )
      VALUES (
        @profile, @id, @title, @description, @currencyCode,
        @balance, @goal, @rawJson, @updatedAt
      )
      ON CONFLICT(profile, id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        currency_code = excluded.currency_code,
        balance = excluded.balance,
        goal = excluded.goal,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `);

    const write = this.#database.transaction(() => {
      for (const jar of jars) {
        const existed = Boolean(exists.get(this.profile, jar.id));
        upsert.run({
          profile: this.profile,
          id: jar.id,
          title: jar.title,
          description: jar.description,
          currencyCode: jar.currencyCode,
          balance: jar.balance,
          goal: jar.goal,
          rawJson: JSON.stringify(jar),
          updatedAt: nowIso(),
        });

        if (existed) {
          stats.updated += 1;
        } else {
          stats.inserted += 1;
        }
      }
    });
    write();

    return stats;
  }

  async upsertCurrencyRates(
    rates: readonly MonobankCurrencyRate[],
  ): Promise<LedgerWriteStats> {
    const stats = emptyWriteStats();
    const exists = this.#database.prepare(`
      SELECT 1 FROM currency_rates
      WHERE profile = ?
        AND currency_code_a = ?
        AND currency_code_b = ?
        AND date = ?
    `);
    const upsert = this.#database.prepare(`
      INSERT INTO currency_rates (
        profile, currency_code_a, currency_code_b, date,
        rate_buy, rate_sell, rate_cross, raw_json, updated_at
      )
      VALUES (
        @profile, @currencyCodeA, @currencyCodeB, @date,
        @rateBuy, @rateSell, @rateCross, @rawJson, @updatedAt
      )
      ON CONFLICT(profile, currency_code_a, currency_code_b, date)
      DO UPDATE SET
        rate_buy = excluded.rate_buy,
        rate_sell = excluded.rate_sell,
        rate_cross = excluded.rate_cross,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `);

    const write = this.#database.transaction(() => {
      for (const rate of rates) {
        const existed = Boolean(
          exists.get(
            this.profile,
            rate.currencyCodeA,
            rate.currencyCodeB,
            rate.date,
          ),
        );
        upsert.run({
          profile: this.profile,
          currencyCodeA: rate.currencyCodeA,
          currencyCodeB: rate.currencyCodeB,
          date: rate.date,
          rateBuy: rate.rateBuy ?? null,
          rateSell: rate.rateSell ?? null,
          rateCross: rate.rateCross ?? null,
          rawJson: JSON.stringify(rate),
          updatedAt: nowIso(),
        });

        if (existed) {
          stats.updated += 1;
        } else {
          stats.inserted += 1;
        }
      }
    });
    write();

    return stats;
  }

  async upsertStatementItems(
    accountId: string,
    items: readonly MonobankStatementItem[],
    entries: readonly LedgerEntry[],
  ): Promise<LedgerWriteStats> {
    let stats = emptyWriteStats();
    const rawExists = this.#database.prepare(`
      SELECT 1 FROM raw_statement_items
      WHERE profile = ? AND account_id = ? AND statement_item_id = ?
    `);
    const rawLookup = this.#database.prepare(`
      SELECT payload_json
      FROM raw_statement_items
      WHERE profile = ? AND account_id = ? AND statement_item_id = ?
    `);
    const rawUpsert = this.#database.prepare(`
      INSERT INTO raw_statement_items (
        profile, account_id, statement_item_id, time, payload_json, updated_at
      )
      VALUES (@profile, @accountId, @statementItemId, @time, @payloadJson, @updatedAt)
      ON CONFLICT(profile, account_id, statement_item_id) DO UPDATE SET
        time = excluded.time,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `);

    const write = this.#database.transaction(() => {
      for (const [index, item] of items.entries()) {
        const entry = entries[index];
        const statementItemId = entry?.rawStatementItemId ?? item.id;
        const payloadJson = JSON.stringify(item);

        if (!statementItemId) {
          throw new Error(
            "Statement item is missing an identifier and entry id",
          );
        }

        const existed = Boolean(
          rawExists.get(this.profile, accountId, statementItemId),
        );
        const previousPayload = (
          rawLookup.get(this.profile, accountId, statementItemId) as
            | SqliteRawStatementItemRow
            | undefined
        )?.payload_json;

        if (existed && previousPayload === payloadJson) {
          stats.skipped += 1;
          continue;
        }

        rawUpsert.run({
          profile: this.profile,
          accountId,
          statementItemId,
          time: item.time,
          payloadJson,
          updatedAt: nowIso(),
        });

        if (!entry) {
          stats.skipped += 1;
          continue;
        }

        const entryStats = this.upsertLedgerEntry(entry);
        stats = addWriteStats(stats, entryStats);

        if (existed && entryStats.inserted === 0 && entryStats.updated === 0) {
          stats.skipped += 1;
        }
      }
    });
    write();

    return stats;
  }

  async listAccounts(
    profile = this.profile,
  ): Promise<readonly LedgerAccount[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT id, type, currency_code, balance, credit_limit, masked_pan_json, updated_at
          FROM accounts
          WHERE profile = ?
          ORDER BY id
        `,
      )
      .all(profile) as SqliteAccountRow[];

    return rows.map(mapAccountRow);
  }

  async listCategories(profile = this.profile): Promise<readonly Category[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            id,
            name,
            color,
            description,
            is_system,
            created_at,
            updated_at
          FROM categories
          WHERE profile = ?
          ORDER BY name
        `,
      )
      .all(profile) as SqliteCategoryRow[];

    return rows.map(mapCategoryRow);
  }

  async listLedgerEntries(query: LedgerEntryQuery): Promise<LedgerEntryPage> {
    const limit = normalizeLimit(query.limit);
    const offset = normalizeOffset(query.offset);
    const where = buildLedgerEntryWhereClause(query);
    const orderBy = buildLedgerEntryOrderByClause(query);
    const totalRow = this.#database
      .prepare(
        `SELECT COUNT(*) AS total FROM ledger_entries WHERE ${where.sql}`,
      )
      .get(where.params) as { total: number };
    const rows = this.#database
      .prepare(
        `
          SELECT
            id, account_id, time, description, amount, operation_amount,
            currency_code, category_id, category_name, merchant_name,
            raw_statement_item_id, hold, balance, note, tags_json, split_plan_json,
            created_at, updated_at
          FROM ledger_entries
          WHERE ${where.sql}
          ORDER BY ${orderBy}
          LIMIT @limit OFFSET @offset
        `,
      )
      .all({ ...where.params, limit, offset }) as SqliteLedgerEntryRow[];

    return {
      entries: rows.map(mapLedgerEntryRow),
      total: totalRow.total,
      limit,
      offset,
    };
  }

  async updateLedgerEntryAnnotation(
    profile: string,
    id: string,
    update: LedgerEntryAnnotationUpdate,
  ): Promise<LedgerEntry | undefined> {
    const annotation = normalizeLedgerEntryAnnotation(update);
    const selectEntry = this.#database.prepare(
      `
          SELECT
            id, account_id, time, description, amount, operation_amount,
            currency_code, category_id, category_name, merchant_name,
          raw_statement_item_id, hold, balance, note, tags_json, split_plan_json,
          created_at, updated_at
        FROM ledger_entries
        WHERE profile = ? AND id = ?
      `,
    );

    if (annotation.note === undefined && annotation.tagsJson === undefined) {
      const existingRow = selectEntry.get(profile, id) as
        | SqliteLedgerEntryRow
        | undefined;

      return existingRow ? mapLedgerEntryRow(existingRow) : undefined;
    }

    this.#database
      .prepare(
        `
          UPDATE ledger_entries
          SET
            note = CASE WHEN @hasNote = 1 THEN @note ELSE note END,
            tags_json = CASE WHEN @hasTags = 1 THEN @tagsJson ELSE tags_json END,
            updated_at = @updatedAt
          WHERE profile = @profile AND id = @id
        `,
      )
      .run({
        profile,
        id,
        hasNote: annotation.note === undefined ? 0 : 1,
        note: annotation.note ?? null,
        hasTags: annotation.tagsJson === undefined ? 0 : 1,
        tagsJson: annotation.tagsJson ?? null,
        updatedAt: nowIso(),
      });

    const row = selectEntry.get(profile, id) as
      | SqliteLedgerEntryRow
      | undefined;

    return row ? mapLedgerEntryRow(row) : undefined;
  }

  async updateLedgerEntrySplitPlan(
    profile: string,
    id: string,
    update: LedgerEntrySplitPlanUpdate,
  ): Promise<LedgerEntry | undefined> {
    const splitPlan = normalizeLedgerEntrySplitPlan(update);
    const selectEntry = this.#database.prepare(
      `
        SELECT
          id, account_id, time, description, amount, operation_amount,
          currency_code, category_id, category_name, merchant_name,
          raw_statement_item_id, hold, balance, note, tags_json, split_plan_json,
          created_at, updated_at
        FROM ledger_entries
        WHERE profile = ? AND id = ?
      `,
    );

    if (splitPlan.splitPlanJson === undefined) {
      const existingRow = selectEntry.get(profile, id) as
        | SqliteLedgerEntryRow
        | undefined;

      return existingRow ? mapLedgerEntryRow(existingRow) : undefined;
    }

    this.#database
      .prepare(
        `
          UPDATE ledger_entries
          SET
            split_plan_json = @splitPlanJson,
            updated_at = @updatedAt
          WHERE profile = @profile AND id = @id
        `,
      )
      .run({
        profile,
        id,
        splitPlanJson: splitPlan.splitPlanJson,
        updatedAt: nowIso(),
      });

    const row = selectEntry.get(profile, id) as
      | SqliteLedgerEntryRow
      | undefined;

    return row ? mapLedgerEntryRow(row) : undefined;
  }

  async getLedgerSummary(profile = this.profile): Promise<LedgerSummary> {
    const row = this.#database
      .prepare(
        `
          SELECT
            (SELECT COUNT(*) FROM accounts WHERE profile = @profile) AS accounts,
            COUNT(*) AS ledger_entries,
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS income,
            SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS expenses,
            SUM(amount) AS net,
            COALESCE(
              json_group_array(DISTINCT currency_code)
                FILTER (WHERE currency_code IS NOT NULL),
              '[]'
            ) AS currencies_json,
            (
              SELECT MAX(finished_at)
              FROM sync_runs
              WHERE profile = @profile AND status = 'success'
            ) AS last_synced_at
          FROM ledger_entries
          WHERE profile = @profile
        `,
      )
      .get({ profile }) as SqliteSummaryRow;
    const currencies = JSON.parse(row.currencies_json) as unknown;

    return {
      profile,
      accounts: row.accounts,
      ledgerEntries: row.ledger_entries,
      income: row.income ?? 0,
      expenses: row.expenses ?? 0,
      net: row.net ?? 0,
      currencies: Array.isArray(currencies)
        ? currencies.filter((currency): currency is number => {
            return typeof currency === "number";
          })
        : [],
      ...(row.last_synced_at ? { lastSyncedAt: row.last_synced_at } : {}),
    };
  }

  async listSyncRuns(
    profile = this.profile,
    limit = 20,
  ): Promise<readonly SyncRun[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            id, profile, source, status, started_at, finished_at,
            api_calls, windows_fetched, items_seen, items_inserted, items_updated, items_skipped, rate_limited
          FROM sync_runs
          WHERE profile = ?
          ORDER BY started_at DESC
          LIMIT ?
        `,
      )
      .all(profile, normalizeLimit(limit)) as SqliteSyncRunRow[];

    return rows.map(mapSyncRunRow);
  }

  async listWebhookEvents(
    profile = this.profile,
    limit = 20,
  ): Promise<readonly StoredWebhookEvent[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            id, profile, account_id, type, statement_item_id,
            received_at, processed_at
          FROM webhook_events
          WHERE profile = ?
          ORDER BY received_at DESC
          LIMIT ?
        `,
      )
      .all(profile, normalizeLimit(limit)) as SqliteWebhookEventRow[];

    return rows.map(mapWebhookEventRow);
  }

  async recordWebhookEvent(
    event: MonobankPersonalWebhookEvent,
    receivedAt = nowIso(),
    deliveryMetadata = {},
  ): Promise<StoredWebhookEvent> {
    const statementItemId = event.data.statementItem.id;
    const payloadHash = webhookPayloadHash(event);
    const deliveryFingerprint = webhookDeliveryFingerprint(deliveryMetadata);
    const storedEvent: StoredWebhookEvent = {
      id: webhookEventId(event, payloadHash, deliveryFingerprint),
      profile: this.profile,
      accountId: event.data.account,
      type: event.type,
      receivedAt,
      ...(statementItemId === undefined ? {} : { statementItemId }),
    };

    this.#database
      .prepare(
        `
          INSERT INTO webhook_events (
            id, profile, account_id, type, statement_item_id, payload_hash,
            delivery_fingerprint, received_at, processed_at, payload_json
          )
          VALUES (
            @id, @profile, @accountId, @type, @statementItemId, @payloadHash,
            @deliveryFingerprint, @receivedAt, @processedAt, @payloadJson
          )
          ON CONFLICT(profile, payload_hash, delivery_fingerprint) DO NOTHING
        `,
      )
      .run({
        id: storedEvent.id,
        profile: storedEvent.profile,
        accountId: storedEvent.accountId,
        type: storedEvent.type,
        statementItemId: storedEvent.statementItemId,
        payloadHash,
        deliveryFingerprint,
        receivedAt: storedEvent.receivedAt,
        processedAt: storedEvent.processedAt ?? null,
        payloadJson: JSON.stringify(event),
      });

    const row = this.#database
      .prepare(
        `
          SELECT
            id, profile, account_id, type, statement_item_id,
            received_at, processed_at
          FROM webhook_events
          WHERE profile = @profile
            AND payload_hash = @payloadHash
            AND delivery_fingerprint = @deliveryFingerprint
          ORDER BY received_at DESC, id DESC
          LIMIT 1
        `,
      )
      .get({
        profile: this.profile,
        payloadHash,
        deliveryFingerprint,
      }) as SqliteWebhookEventRow | undefined;

    return row ? mapWebhookEventRow(row) : storedEvent;
  }

  async getDatabaseInfo(profile = this.profile): Promise<SqliteDatabaseInfo> {
    const migrationsRows = this.#database
      .prepare("SELECT id FROM schema_migrations ORDER BY id")
      .all() as { id: string }[];
    const integrityRow = this.#database
      .prepare("PRAGMA integrity_check")
      .get() as { integrity_check: string };
    const pageCountRow = this.#database.prepare("PRAGMA page_count").get() as {
      page_count: number;
    };
    const pageSizeRow = this.#database.prepare("PRAGMA page_size").get() as {
      page_size: number;
    };
    const counts = this.#database
      .prepare(
        `
          SELECT
            (SELECT COUNT(*) FROM accounts WHERE profile = @profile) AS accounts,
            (SELECT COUNT(*) FROM ledger_entries WHERE profile = @profile) AS ledgerEntries,
            (SELECT COUNT(*) FROM sync_runs WHERE profile = @profile) AS syncRuns,
            (SELECT COUNT(*) FROM webhook_events WHERE profile = @profile) AS webhookEvents
        `,
      )
      .get({ profile }) as {
      accounts: number;
      ledgerEntries: number;
      syncRuns: number;
      webhookEvents: number;
    };

    return {
      filePath: this.filePath,
      profile,
      migrations: migrationsRows.map((row) => row.id),
      integrityCheck: integrityRow.integrity_check,
      pageCount: pageCountRow.page_count,
      pageSize: pageSizeRow.page_size,
      bytes: pageCountRow.page_count * pageSizeRow.page_size,
      accounts: counts.accounts,
      ledgerEntries: counts.ledgerEntries,
      syncRuns: counts.syncRuns,
      webhookEvents: counts.webhookEvents,
    };
  }

  async compact(): Promise<void> {
    this.#database.exec("VACUUM");
  }

  async close(): Promise<void> {
    this.#database.close();
  }

  private ensureProfile(): void {
    this.#database
      .prepare(
        `
          INSERT INTO profiles (name, created_at)
          VALUES (?, ?)
          ON CONFLICT(name) DO NOTHING
        `,
      )
      .run(this.profile, nowIso());
  }

  private setSyncCursorSync(cursor: SyncCursor): void {
    this.#database
      .prepare(
        `
          INSERT INTO sync_cursors (
            profile, account_id, source, statement_from, statement_to, updated_at
          )
          VALUES (
            @profile, @accountId, @source, @statementFrom, @statementTo, @updatedAt
          )
          ON CONFLICT(profile, account_id, source) DO UPDATE SET
            statement_from = excluded.statement_from,
            statement_to = excluded.statement_to,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        profile: cursor.profile,
        accountId: cursor.accountId,
        source: cursor.source,
        statementFrom: cursor.statementFrom,
        statementTo: cursor.statementTo,
        updatedAt: cursor.updatedAt,
      });
  }

  private upsertLedgerEntry(entry: LedgerEntry): LedgerWriteStats {
    const existed = Boolean(
      this.#database
        .prepare("SELECT 1 FROM ledger_entries WHERE profile = ? AND id = ?")
        .get(this.profile, entry.id),
    );
    const timestamp = nowIso();

    this.#database
      .prepare(
        `
          INSERT INTO ledger_entries (
            profile, id, account_id, time, description, amount,
            operation_amount, currency_code, category_id, category_name,
            merchant_name, raw_statement_item_id, hold, balance,
            created_at, updated_at
          )
          VALUES (
            @profile, @id, @accountId, @time, @description, @amount,
            @operationAmount, @currencyCode, @categoryId, @categoryName,
            @merchantName, @rawStatementItemId, @hold, @balance,
            @createdAt, @updatedAt
          )
          ON CONFLICT(profile, id) DO UPDATE SET
            account_id = excluded.account_id,
            time = excluded.time,
            description = excluded.description,
            amount = excluded.amount,
            operation_amount = excluded.operation_amount,
            currency_code = excluded.currency_code,
            category_id = excluded.category_id,
            category_name = excluded.category_name,
            merchant_name = excluded.merchant_name,
            raw_statement_item_id = excluded.raw_statement_item_id,
            hold = excluded.hold,
            balance = excluded.balance,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        profile: this.profile,
        id: entry.id,
        accountId: entry.accountId,
        time: entry.time,
        description: entry.description,
        amount: entry.amount,
        operationAmount: entry.operationAmount ?? null,
        currencyCode: entry.currencyCode,
        categoryId: entry.categoryId ?? null,
        categoryName: entry.categoryName ?? null,
        merchantName: entry.merchantName ?? null,
        rawStatementItemId: entry.rawStatementItemId,
        hold: entry.hold ? 1 : 0,
        balance: entry.balance ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

    return {
      inserted: existed ? 0 : 1,
      updated: existed ? 1 : 0,
      skipped: 0,
    };
  }
}

export function createSqliteLedgerDb(
  options: SqliteLedgerDbOptions,
): SqliteLedgerDb {
  return new BetterSqliteLedgerDb(options);
}
