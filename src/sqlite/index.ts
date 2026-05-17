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
  WebhookEventStatus,
  Budget,
  BudgetPeriod,
  Category,
  CategoryRule,
  LedgerDb,
  LedgerDbTransaction,
  LedgerEntry,
  LedgerEntryAnnotationUpdate,
  LedgerEntrySplitPlanUpdate,
  LedgerEntryPage,
  LedgerEntryQuery,
  LedgerEntrySortField,
  LedgerJar,
  LedgerSummary,
  LedgerWriteStats,
  LocalAppSettings,
  LocalAppSettingsUpdate,
  Merchant,
  RecurringItem,
  StoredWebhookEvent,
  SyncCursor,
  SyncRun,
  Tag,
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

export interface SqliteLocalConfigurationImport {
  categories?: readonly Category[];
  categoryRules?: readonly CategoryRule[];
  budgets?: readonly Budget[];
  budgetPeriods?: readonly BudgetPeriod[];
  tags?: readonly Tag[];
}

export interface SqliteLocalConfigurationImportStats {
  categories: number;
  categoryRules: number;
  budgets: number;
  budgetPeriods: number;
  tags: number;
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
  listJars(profile?: string): Promise<readonly LedgerJar[]>;
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
  listCategoryRules(profile?: string): Promise<readonly CategoryRule[]>;
  listMerchants(profile?: string): Promise<readonly Merchant[]>;
  listBudgets(profile?: string): Promise<readonly Budget[]>;
  listBudgetPeriods(profile?: string): Promise<readonly BudgetPeriod[]>;
  listRecurringItems(profile?: string): Promise<readonly RecurringItem[]>;
  listTags(profile?: string): Promise<readonly Tag[]>;
  listSyncRuns(profile?: string, limit?: number): Promise<readonly SyncRun[]>;
  listWebhookEvents(
    profile?: string,
    limit?: number,
  ): Promise<readonly StoredWebhookEvent[]>;
  importLocalConfiguration(
    profile: string,
    configuration: SqliteLocalConfigurationImport,
  ): Promise<SqliteLocalConfigurationImportStats>;
  recordWebhookEvent(
    event: MonobankPersonalWebhookEvent,
    receivedAt?: string,
    deliveryMetadata?: Readonly<Record<string, string>>,
  ): Promise<StoredWebhookEvent>;
  listPendingWebhookStatementWindows(
    profile: string,
    accountId: string,
  ): Promise<readonly { from: number; to: number }[]>;
  markWebhookEventsAsProcessed(
    profile: string,
    accountId: string,
    processedAt?: string,
    reconciledWindows?: readonly { from: number; to: number }[],
    receivedBefore?: string,
  ): Promise<void>;
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

interface SqliteJarRow {
  id: string;
  title: string;
  description: string;
  currency_code: number;
  balance: number;
  goal: number;
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

interface SqliteLocalAppSettingsRow {
  profile: string;
  source: "fixture" | "monobank" | null;
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
  status: string;
  payload_hash?: string;
  delivery_fingerprint?: string;
}

interface SqliteWebhookPayloadRow {
  payload_json: string;
}

interface SqlitePendingWebhookEventRow {
  id: string;
  statement_item_id: string | null;
  payload_json: string;
}

interface SqliteSummaryRow {
  accounts: number;
  ledger_entries: number;
  income: number | null;
  expenses: number | null;
  net: number | null;
  currencies_json: string;
  last_synced_at: string | null;
  oldest_sync_cursor_updated_at: string | null;
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

interface SqliteCategoryRuleRow {
  id: string;
  category_id: string;
  name: string;
  priority: number;
  match_type: "condition" | "fallback";
  merchant_contains: string | null;
  description_contains: string | null;
  mcc: number | null;
  amount_direction: "income" | "expense" | "any" | null;
  is_system: number;
  is_enabled: number;
  created_at: string;
  updated_at: string;
}

interface SqliteMerchantRow {
  id: string;
  name: string;
  normalized_name: string;
  first_seen_at: number;
  last_seen_at: number;
  created_at: string;
  updated_at: string;
}

interface SqliteBudgetRow {
  id: string;
  profile: string;
  category_id: string;
  currency_code: number;
  period_start: string;
  period_end: string;
  amount_limit: number;
  rollover: number;
  include_inflows: number;
  created_at: string;
  updated_at: string;
}

interface SqliteBudgetPeriodRow {
  id: string;
  profile: string;
  budget_id: string;
  period_start: string;
  period_end: string;
  planned_amount: number;
  actual_amount: number | null;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
}

interface SqliteRecurringItemRow {
  id: string;
  profile: string;
  account_id: string;
  category_id: string | null;
  merchant_name: string | null;
  frequency: RecurringItem["frequency"];
  expected_amount_min: number | null;
  expected_amount_max: number | null;
  is_active: number;
  started_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SqliteTagRow {
  id: string;
  name: string;
  normalized_name: string;
  created_at: string;
  updated_at: string;
}

interface SeedCategory {
  id: string;
  name: string;
  color?: string;
  description?: string;
}

interface SeedCategoryRule {
  id: string;
  categoryId: string;
  name: string;
  priority: number;
  matchType: "condition" | "fallback";
  merchantContains?: string;
  descriptionContains?: string;
  mcc?: number;
  amountDirection?: "income" | "expense" | "any";
}

const seededCategories: readonly SeedCategory[] = [
  {
    id: "income",
    name: "Income",
    color: "#16a34a",
    description: "Money received from salary, reimbursements, or transfers in.",
  },
  {
    id: "groceries",
    name: "Groceries",
    color: "#0ea5e9",
    description: "Food purchases and daily grocery spending.",
  },
  {
    id: "subscriptions",
    name: "Subscriptions",
    color: "#7c3aed",
    description: "Recurring subscriptions and service plans.",
  },
  {
    id: "transport",
    name: "Transport",
    color: "#f97316",
    description: "Transit, taxi, and other transport-related expenses.",
  },
  {
    id: "travel",
    name: "Travel",
    color: "#06b6d4",
    description: "Travel, hotel, and travel-related spending.",
  },
  {
    id: "dining",
    name: "Dining",
    color: "#f43f5e",
    description: "Restaurants, cafes, and food outside home.",
  },
  {
    id: "transfers",
    name: "Transfers",
    color: "#64748b",
    description: "Transfers between accounts and known payment transfers.",
  },
  {
    id: "uncategorized",
    name: "Uncategorized",
    color: "#64748b",
    description: "Manual review required; no automatic category match yet.",
  },
];

const seededCategoryRules: readonly SeedCategoryRule[] = [
  {
    id: "income-positive-amount",
    categoryId: "income",
    name: "Income by positive amount",
    priority: 100,
    matchType: "condition",
    amountDirection: "income",
  },
  {
    id: "groceries-mcc-or-text",
    categoryId: "groceries",
    name: "Groceries by MCC or text",
    priority: 200,
    matchType: "condition",
    descriptionContains: "grocery",
    mcc: 5411,
    amountDirection: "expense",
  },
  {
    id: "subscriptions-mcc-or-text",
    categoryId: "subscriptions",
    name: "Subscriptions by MCC or text",
    priority: 300,
    matchType: "condition",
    descriptionContains: "subscription",
    mcc: 5734,
    amountDirection: "expense",
  },
  {
    id: "transport-mcc-or-text",
    categoryId: "transport",
    name: "Transport by MCC or text",
    priority: 400,
    matchType: "condition",
    descriptionContains: "metro",
    mcc: 4111,
    amountDirection: "expense",
  },
  {
    id: "travel-mcc-or-text",
    categoryId: "travel",
    name: "Travel by MCC or text",
    priority: 500,
    matchType: "condition",
    descriptionContains: "travel",
    mcc: 4722,
    amountDirection: "expense",
  },
  {
    id: "dining-mcc-or-text",
    categoryId: "dining",
    name: "Dining by MCC or text",
    priority: 600,
    matchType: "condition",
    descriptionContains: "coffee",
    mcc: 5814,
    amountDirection: "expense",
  },
  {
    id: "transfers-mcc-or-text",
    categoryId: "transfers",
    name: "Transfers by MCC or text",
    priority: 700,
    matchType: "condition",
    descriptionContains: "transfer",
    mcc: 4829,
    amountDirection: "any",
  },
  {
    id: "uncategorized-fallback",
    categoryId: "uncategorized",
    name: "Uncategorized fallback",
    priority: 9999,
    matchType: "fallback",
    amountDirection: "any",
  },
];

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
  {
    id: "0007_webhook_event_status",
    description: "Track webhook event status",
    sql: `
      ALTER TABLE webhook_events
        ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

      UPDATE webhook_events
        SET status = 'pending'
        WHERE status IS NULL OR status = '';

      CREATE INDEX IF NOT EXISTS idx_webhook_events_status
        ON webhook_events(profile, status);
    `,
  },
  {
    id: "0008_local_app_settings",
    description: "Store profile-scoped local app settings",
    sql: `
      CREATE TABLE IF NOT EXISTS local_app_settings (
        profile TEXT PRIMARY KEY,
        source TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );
    `,
  },
  {
    id: "0009_category_rules",
    description: "Add category rule storage",
    sql: `
      CREATE TABLE IF NOT EXISTS category_rules (
        profile TEXT NOT NULL,
        id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        priority INTEGER NOT NULL,
        match_type TEXT NOT NULL,
        merchant_contains TEXT,
        description_contains TEXT,
        mcc INTEGER,
        amount_direction TEXT,
        is_system INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, id),
        FOREIGN KEY (profile) REFERENCES profiles(name),
        FOREIGN KEY (profile, category_id) REFERENCES categories(profile, id)
      );

      CREATE INDEX IF NOT EXISTS idx_category_rules_profile_priority
        ON category_rules(profile, priority, id);

      CREATE INDEX IF NOT EXISTS idx_category_rules_category
        ON category_rules(profile, category_id);
    `,
  },
  {
    id: "0010_merchants",
    description: "Add merchant storage",
    sql: `
      CREATE TABLE IF NOT EXISTS merchants (
        profile TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, id),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_profile_normalized
        ON merchants(profile, normalized_name);

      CREATE INDEX IF NOT EXISTS idx_merchants_profile_last_seen
        ON merchants(profile, last_seen_at DESC);
    `,
  },
  {
    id: "0011_budgets",
    description: "Add budget storage",
    sql: `
      CREATE TABLE IF NOT EXISTS budgets (
        profile TEXT NOT NULL,
        id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        currency_code INTEGER NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        amount_limit INTEGER NOT NULL,
        rollover INTEGER NOT NULL DEFAULT 0,
        include_inflows INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, id),
        FOREIGN KEY (profile) REFERENCES profiles(name),
        FOREIGN KEY (profile, category_id) REFERENCES categories(profile, id)
      );

      CREATE INDEX IF NOT EXISTS idx_budgets_profile_period
        ON budgets(profile, period_start, period_end);

      CREATE INDEX IF NOT EXISTS idx_budgets_profile_category
        ON budgets(profile, category_id);
    `,
  },
  {
    id: "0012_budget_periods",
    description: "Add budget period storage",
    sql: `
      CREATE TABLE IF NOT EXISTS budget_periods (
        profile TEXT NOT NULL,
        id TEXT NOT NULL,
        budget_id TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        planned_amount INTEGER NOT NULL,
        actual_amount INTEGER,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, id),
        FOREIGN KEY (profile) REFERENCES profiles(name),
        FOREIGN KEY (profile, budget_id) REFERENCES budgets(profile, id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_periods_budget_period
        ON budget_periods(profile, budget_id, period_start, period_end);

      CREATE INDEX IF NOT EXISTS idx_budget_periods_profile_status
        ON budget_periods(profile, status, period_start);
    `,
  },
  {
    id: "0013_recurring_items",
    description: "Add recurring item storage",
    sql: `
      CREATE TABLE IF NOT EXISTS recurring_items (
        profile TEXT NOT NULL,
        id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        category_id TEXT,
        merchant_name TEXT,
        frequency TEXT NOT NULL,
        expected_amount_min INTEGER,
        expected_amount_max INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1,
        started_at TEXT,
        last_seen_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, id),
        FOREIGN KEY (profile) REFERENCES profiles(name),
        FOREIGN KEY (profile, account_id) REFERENCES accounts(profile, id),
        FOREIGN KEY (profile, category_id) REFERENCES categories(profile, id)
      );

      CREATE INDEX IF NOT EXISTS idx_recurring_items_profile_active
        ON recurring_items(profile, is_active, frequency);

      CREATE INDEX IF NOT EXISTS idx_recurring_items_profile_account
        ON recurring_items(profile, account_id);
    `,
  },
  {
    id: "0014_tags",
    description: "Add tag storage",
    sql: `
      CREATE TABLE IF NOT EXISTS tags (
        profile TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, id),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_profile_normalized
        ON tags(profile, normalized_name);
    `,
  },
  {
    id: "0015_query_performance_indexes",
    description: "Add ledger and budget query indexes",
    sql: `
      CREATE INDEX IF NOT EXISTS idx_ledger_entries_profile_category_time
        ON ledger_entries(profile, category_id, time DESC);

      CREATE INDEX IF NOT EXISTS idx_ledger_entries_profile_time_category
        ON ledger_entries(profile, time DESC, category_id);

      CREATE INDEX IF NOT EXISTS idx_budgets_profile_category_period
        ON budgets(profile, category_id, period_start DESC, period_end, id);

      CREATE INDEX IF NOT EXISTS idx_budget_periods_profile_period
        ON budget_periods(profile, period_start DESC, budget_id, id);
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

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)]),
    );
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function webhookPayloadHash(event: MonobankPersonalWebhookEvent): string {
  return createHash("sha256").update(stableStringify(event)).digest("hex");
}

function createStatementItemFingerprint(
  accountId: string,
  item: MonobankStatementItem,
): string {
  const payload = {
    accountId,
    time: item.time,
    description: item.description,
    mcc: item.mcc,
    originalMcc: item.originalMcc,
    amount: item.amount,
    operationAmount: item.operationAmount,
    currencyCode: item.currencyCode,
    commissionRate: item.commissionRate,
    cashbackAmount: item.cashbackAmount,
    balance: item.balance,
    hold: item.hold,
    comment: item.comment ?? "",
    receiptId: item.receiptId ?? "",
    invoiceId: item.invoiceId ?? "",
    counterEdrpou: item.counterEdrpou ?? "",
    counterIban: item.counterIban ?? "",
    counterName: item.counterName ?? "",
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function statementItemStorageIdentity(
  accountId: string,
  item: MonobankStatementItem,
): string {
  if (item.id !== undefined && item.id.trim().length > 0) {
    return item.id;
  }

  return `missing-id:${createStatementItemFingerprint(accountId, item)}`;
}

function webhookStatementItemMetadata(
  payloadJson: string,
): { statementItemId: string; time: number } | undefined {
  try {
    const event = JSON.parse(payloadJson) as MonobankPersonalWebhookEvent;

    const time = event.data.statementItem.time;

    if (!Number.isInteger(time) || time < 0) {
      return undefined;
    }

    return {
      statementItemId: statementItemStorageIdentity(
        event.data.account,
        event.data.statementItem,
      ),
      time,
    };
  } catch {
    return undefined;
  }
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

function normalizeMerchantName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function merchantIdForName(normalizedName: string): string {
  const digest = createHash("sha256")
    .update(normalizedName)
    .digest("hex")
    .slice(0, 16);

  return `merchant-${digest}`;
}

function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function tagIdForName(normalizedName: string): string {
  const digest = createHash("sha256")
    .update(normalizedName)
    .digest("hex")
    .slice(0, 16);

  return `tag-${digest}`;
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

function mapJarRow(row: SqliteJarRow): LedgerJar {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    currencyCode: row.currency_code,
    balance: row.balance,
    goal: row.goal,
    updatedAt: row.updated_at,
  };
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

function mapCategoryRuleRow(row: SqliteCategoryRuleRow): CategoryRule {
  const rule: CategoryRule = {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    priority: row.priority,
    matchType: row.match_type,
    createdAt: row.created_at,
  };

  if (row.merchant_contains !== null) {
    rule.merchantContains = row.merchant_contains;
  }

  if (row.description_contains !== null) {
    rule.descriptionContains = row.description_contains;
  }

  if (row.mcc !== null) {
    rule.mcc = row.mcc;
  }

  if (row.amount_direction !== null) {
    rule.amountDirection = row.amount_direction;
  }

  if (row.is_system === 1) {
    rule.isSystem = true;
  }

  rule.isEnabled = row.is_enabled === 1;

  if (row.updated_at !== row.created_at) {
    rule.updatedAt = row.updated_at;
  }

  return rule;
}

function mapMerchantRow(row: SqliteMerchantRow): Merchant {
  const merchant: Merchant = {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
  };

  if (row.updated_at !== row.created_at) {
    merchant.updatedAt = row.updated_at;
  }

  return merchant;
}

function mapBudgetRow(row: SqliteBudgetRow): Budget {
  return {
    id: row.id,
    profile: row.profile,
    categoryId: row.category_id,
    currencyCode: row.currency_code,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    amountLimit: row.amount_limit,
    rollover: row.rollover === 1,
    ...(row.include_inflows === 1 ? { includeInflows: true } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBudgetPeriodRow(row: SqliteBudgetPeriodRow): BudgetPeriod {
  return {
    id: row.id,
    profile: row.profile,
    budgetId: row.budget_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    plannedAmount: row.planned_amount,
    ...(row.actual_amount === null ? {} : { actualAmount: row.actual_amount }),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecurringItemRow(row: SqliteRecurringItemRow): RecurringItem {
  return {
    id: row.id,
    profile: row.profile,
    accountId: row.account_id,
    ...(row.category_id === null ? {} : { categoryId: row.category_id }),
    ...(row.merchant_name === null ? {} : { merchantName: row.merchant_name }),
    frequency: row.frequency,
    ...(row.expected_amount_min === null
      ? {}
      : { expectedAmountMin: row.expected_amount_min }),
    ...(row.expected_amount_max === null
      ? {}
      : { expectedAmountMax: row.expected_amount_max }),
    isActive: row.is_active === 1,
    ...(row.started_at === null ? {} : { startedAt: row.started_at }),
    ...(row.last_seen_at === null ? {} : { lastSeenAt: row.last_seen_at }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTagRow(row: SqliteTagRow): Tag {
  const tag: Tag = {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    createdAt: row.created_at,
  };

  if (row.updated_at !== row.created_at) {
    tag.updatedAt = row.updated_at;
  }

  return tag;
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

function resolveWebhookEventStatus(
  value: string | undefined,
  processedAt: string | null,
): WebhookEventStatus {
  if (
    value === "pending" ||
    value === "processed" ||
    value === "duplicate" ||
    value === "ignored" ||
    value === "failed"
  ) {
    return value;
  }

  if (processedAt !== null) {
    return "processed";
  }

  return "pending";
}

function mapWebhookEventRow(row: SqliteWebhookEventRow): StoredWebhookEvent {
  const event: StoredWebhookEvent = {
    id: row.id,
    profile: row.profile,
    accountId: row.account_id,
    type: row.type,
    status: resolveWebhookEventStatus(row.status, row.processed_at),
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

  if (query.tag?.trim()) {
    clauses.push(
      "EXISTS (SELECT 1 FROM json_each(ledger_entries.tags_json) WHERE value = @tag)",
    );
    params.tag = query.tag.trim();
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
      this.seedDefaultCategories();
      this.seedDefaultCategoryRules();
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
      updateLedgerEntryAnnotation: (profile, id, update) =>
        this.updateLedgerEntryAnnotation(profile, id, update),
      updateLedgerEntrySplitPlan: (profile, id, update) =>
        this.updateLedgerEntrySplitPlan(profile, id, update),
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

  async getLocalAppSettings(
    profile: string,
  ): Promise<LocalAppSettings | undefined> {
    const row = this.#database
      .prepare(
        `
          SELECT profile, source, updated_at
          FROM local_app_settings
          WHERE profile = ?
        `,
      )
      .get(profile) as SqliteLocalAppSettingsRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      profile: row.profile,
      ...(row.source === null ? {} : { source: row.source }),
      updatedAt: row.updated_at,
    };
  }

  async updateLocalAppSettings(
    profile: string,
    update: LocalAppSettingsUpdate,
  ): Promise<LocalAppSettings> {
    this.ensureProfile();

    const current = await this.getLocalAppSettings(profile);
    const nextSource = update.source ?? current?.source;
    const updatedAt = nowIso();

    this.#database
      .prepare(
        `
          INSERT INTO local_app_settings (profile, source, updated_at)
          VALUES (@profile, @source, @updatedAt)
          ON CONFLICT(profile) DO UPDATE SET
            source = excluded.source,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        profile,
        source: nextSource ?? null,
        updatedAt,
      });

    return {
      profile,
      ...(nextSource === undefined ? {} : { source: nextSource }),
      updatedAt,
    };
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

  async listJars(profile = this.profile): Promise<readonly LedgerJar[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            id,
            title,
            description,
            currency_code,
            balance,
            goal,
            updated_at
          FROM jars
          WHERE profile = ?
          ORDER BY title, id
        `,
      )
      .all(profile) as SqliteJarRow[];

    return rows.map(mapJarRow);
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

  async listCategoryRules(
    profile = this.profile,
  ): Promise<readonly CategoryRule[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            id,
            category_id,
            name,
            priority,
            match_type,
            merchant_contains,
            description_contains,
            mcc,
            amount_direction,
            is_system,
            is_enabled,
            created_at,
            updated_at
          FROM category_rules
          WHERE profile = ?
          ORDER BY priority, id
        `,
      )
      .all(profile) as SqliteCategoryRuleRow[];

    return rows.map(mapCategoryRuleRow);
  }

  async listMerchants(profile = this.profile): Promise<readonly Merchant[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            id,
            name,
            normalized_name,
            first_seen_at,
            last_seen_at,
            created_at,
            updated_at
          FROM merchants
          WHERE profile = ?
          ORDER BY last_seen_at DESC, name
        `,
      )
      .all(profile) as SqliteMerchantRow[];

    return rows.map(mapMerchantRow);
  }

  async listBudgets(profile = this.profile): Promise<readonly Budget[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            id,
            profile,
            category_id,
            currency_code,
            period_start,
            period_end,
            amount_limit,
            rollover,
            include_inflows,
            created_at,
            updated_at
          FROM budgets
          WHERE profile = ?
          ORDER BY period_start DESC, category_id, id
        `,
      )
      .all(profile) as SqliteBudgetRow[];

    return rows.map(mapBudgetRow);
  }

  async listBudgetPeriods(
    profile = this.profile,
  ): Promise<readonly BudgetPeriod[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            id,
            profile,
            budget_id,
            period_start,
            period_end,
            planned_amount,
            actual_amount,
            status,
            created_at,
            updated_at
          FROM budget_periods
          WHERE profile = ?
          ORDER BY period_start DESC, budget_id, id
        `,
      )
      .all(profile) as SqliteBudgetPeriodRow[];

    return rows.map(mapBudgetPeriodRow);
  }

  async listRecurringItems(
    profile = this.profile,
  ): Promise<readonly RecurringItem[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            id,
            profile,
            account_id,
            category_id,
            merchant_name,
            frequency,
            expected_amount_min,
            expected_amount_max,
            is_active,
            started_at,
            last_seen_at,
            created_at,
            updated_at
          FROM recurring_items
          WHERE profile = ?
          ORDER BY is_active DESC, frequency, merchant_name, id
        `,
      )
      .all(profile) as SqliteRecurringItemRow[];

    return rows.map(mapRecurringItemRow);
  }

  async listTags(profile = this.profile): Promise<readonly Tag[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            id,
            name,
            normalized_name,
            created_at,
            updated_at
          FROM tags
          WHERE profile = ?
          ORDER BY name
        `,
      )
      .all(profile) as SqliteTagRow[];

    return rows.map(mapTagRow);
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

    if (row && annotation.tagsJson !== undefined) {
      this.upsertTagsFromLedgerEntry(profile, row, nowIso());
    }

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
            ) AS last_synced_at,
            (
              SELECT MIN(updated_at)
              FROM sync_cursors
              WHERE profile = @profile
            ) AS oldest_sync_cursor_updated_at
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
      ...(row.oldest_sync_cursor_updated_at
        ? { oldestSyncCursorUpdatedAt: row.oldest_sync_cursor_updated_at }
        : {}),
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
            status, received_at, processed_at
          FROM webhook_events
          WHERE profile = ?
          ORDER BY received_at DESC
          LIMIT ?
        `,
      )
      .all(profile, normalizeLimit(limit)) as SqliteWebhookEventRow[];

    return rows.map(mapWebhookEventRow);
  }

  async importLocalConfiguration(
    profile: string,
    configuration: SqliteLocalConfigurationImport,
  ): Promise<SqliteLocalConfigurationImportStats> {
    const normalizedProfile = profile.trim() || this.profile;
    const insertCategory = this.#database.prepare(
      `
        INSERT INTO categories (
          profile, id, name, color, description, is_system, created_at, updated_at
        )
        VALUES (
          @profile, @id, @name, @color, @description, @isSystem, @createdAt, @updatedAt
        )
        ON CONFLICT(profile, id) DO UPDATE SET
          name = excluded.name,
          color = excluded.color,
          description = excluded.description,
          is_system = excluded.is_system,
          updated_at = excluded.updated_at
      `,
    );
    const insertCategoryRule = this.#database.prepare(
      `
        INSERT INTO category_rules (
          profile,
          id,
          category_id,
          name,
          priority,
          match_type,
          merchant_contains,
          description_contains,
          mcc,
          amount_direction,
          is_system,
          is_enabled,
          created_at,
          updated_at
        )
        VALUES (
          @profile,
          @id,
          @categoryId,
          @name,
          @priority,
          @matchType,
          @merchantContains,
          @descriptionContains,
          @mcc,
          @amountDirection,
          @isSystem,
          @isEnabled,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(profile, id) DO UPDATE SET
          category_id = excluded.category_id,
          name = excluded.name,
          priority = excluded.priority,
          match_type = excluded.match_type,
          merchant_contains = excluded.merchant_contains,
          description_contains = excluded.description_contains,
          mcc = excluded.mcc,
          amount_direction = excluded.amount_direction,
          is_system = excluded.is_system,
          is_enabled = excluded.is_enabled,
          updated_at = excluded.updated_at
      `,
    );
    const insertBudget = this.#database.prepare(
      `
        INSERT INTO budgets (
          profile,
          id,
          category_id,
          currency_code,
          period_start,
          period_end,
          amount_limit,
          rollover,
          include_inflows,
          created_at,
          updated_at
        )
        VALUES (
          @profile,
          @id,
          @categoryId,
          @currencyCode,
          @periodStart,
          @periodEnd,
          @amountLimit,
          @rollover,
          @includeInflows,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(profile, id) DO UPDATE SET
          category_id = excluded.category_id,
          currency_code = excluded.currency_code,
          period_start = excluded.period_start,
          period_end = excluded.period_end,
          amount_limit = excluded.amount_limit,
          rollover = excluded.rollover,
          include_inflows = excluded.include_inflows,
          updated_at = excluded.updated_at
      `,
    );
    const insertBudgetPeriod = this.#database.prepare(
      `
        INSERT INTO budget_periods (
          profile,
          id,
          budget_id,
          period_start,
          period_end,
          planned_amount,
          actual_amount,
          status,
          created_at,
          updated_at
        )
        VALUES (
          @profile,
          @id,
          @budgetId,
          @periodStart,
          @periodEnd,
          @plannedAmount,
          @actualAmount,
          @status,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(profile, id) DO UPDATE SET
          budget_id = excluded.budget_id,
          period_start = excluded.period_start,
          period_end = excluded.period_end,
          planned_amount = excluded.planned_amount,
          actual_amount = excluded.actual_amount,
          status = excluded.status,
          updated_at = excluded.updated_at
      `,
    );
    const insertTag = this.#database.prepare(
      `
        INSERT INTO tags (
          profile,
          id,
          name,
          normalized_name,
          created_at,
          updated_at
        )
        VALUES (
          @profile,
          @id,
          @name,
          @normalizedName,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(profile, normalized_name) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at
      `,
    );
    const stats: SqliteLocalConfigurationImportStats = {
      categories: 0,
      categoryRules: 0,
      budgets: 0,
      budgetPeriods: 0,
      tags: 0,
    };

    this.#database.transaction(() => {
      this.ensureProfileName(normalizedProfile);

      for (const category of configuration.categories ?? []) {
        const updatedAt = category.updatedAt ?? category.createdAt;
        insertCategory.run({
          profile: normalizedProfile,
          id: category.id,
          name: category.name,
          color: category.color ?? null,
          description: category.description ?? "",
          isSystem: category.isSystem ? 1 : 0,
          createdAt: category.createdAt,
          updatedAt,
        });
        stats.categories += 1;
      }

      for (const rule of configuration.categoryRules ?? []) {
        const updatedAt = rule.updatedAt ?? rule.createdAt;
        insertCategoryRule.run({
          profile: normalizedProfile,
          id: rule.id,
          categoryId: rule.categoryId,
          name: rule.name,
          priority: rule.priority,
          matchType: rule.matchType,
          merchantContains: rule.merchantContains ?? null,
          descriptionContains: rule.descriptionContains ?? null,
          mcc: rule.mcc ?? null,
          amountDirection: rule.amountDirection ?? null,
          isSystem: rule.isSystem ? 1 : 0,
          isEnabled: rule.isEnabled === false ? 0 : 1,
          createdAt: rule.createdAt,
          updatedAt,
        });
        stats.categoryRules += 1;
      }

      for (const budget of configuration.budgets ?? []) {
        insertBudget.run({
          profile: normalizedProfile,
          id: budget.id,
          categoryId: budget.categoryId,
          currencyCode: budget.currencyCode,
          periodStart: budget.periodStart,
          periodEnd: budget.periodEnd,
          amountLimit: budget.amountLimit,
          rollover: budget.rollover ? 1 : 0,
          includeInflows: budget.includeInflows ? 1 : 0,
          createdAt: budget.createdAt,
          updatedAt: budget.updatedAt,
        });
        stats.budgets += 1;
      }

      for (const period of configuration.budgetPeriods ?? []) {
        insertBudgetPeriod.run({
          profile: normalizedProfile,
          id: period.id,
          budgetId: period.budgetId,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          plannedAmount: period.plannedAmount,
          actualAmount: period.actualAmount ?? null,
          status: period.status,
          createdAt: period.createdAt,
          updatedAt: period.updatedAt,
        });
        stats.budgetPeriods += 1;
      }

      for (const tag of configuration.tags ?? []) {
        const normalizedName =
          tag.normalizedName.trim() || normalizeTagName(tag.name);
        const updatedAt = tag.updatedAt ?? tag.createdAt;

        if (!normalizedName) {
          continue;
        }

        insertTag.run({
          profile: normalizedProfile,
          id: tag.id || tagIdForName(normalizedName),
          name: tag.name,
          normalizedName,
          createdAt: tag.createdAt,
          updatedAt,
        });
        stats.tags += 1;
      }
    })();

    return stats;
  }

  async recordWebhookEvent(
    event: MonobankPersonalWebhookEvent,
    receivedAt = nowIso(),
    deliveryMetadata = {},
  ): Promise<StoredWebhookEvent> {
    const statementItemId = statementItemStorageIdentity(
      event.data.account,
      event.data.statementItem,
    );
    const payloadHash = webhookPayloadHash(event);
    const deliveryFingerprint = webhookDeliveryFingerprint(deliveryMetadata);
    const storedEvent: StoredWebhookEvent = {
      id: webhookEventId(event, payloadHash, deliveryFingerprint),
      profile: this.profile,
      accountId: event.data.account,
      type: event.type,
      status: "pending",
      receivedAt,
      statementItemId,
    };

    const insertResult = this.#database
      .prepare(
        `
          INSERT INTO webhook_events (
            id, profile, account_id, type, statement_item_id, status,
            payload_hash, delivery_fingerprint, received_at, processed_at, payload_json
          )
          VALUES (
            @id, @profile, @accountId, @type, @statementItemId, @status,
            @payloadHash, @deliveryFingerprint, @receivedAt, @processedAt, @payloadJson
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
        status: storedEvent.status,
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
            id, profile, account_id, type, statement_item_id, status,
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

    if (!row) {
      return storedEvent;
    }

    if (insertResult.changes === 0) {
      this.#database
        .prepare(
          `
            UPDATE webhook_events
              SET status = 'duplicate'
            WHERE profile = @profile
              AND payload_hash = @payloadHash
              AND delivery_fingerprint = @deliveryFingerprint
              AND status = 'pending';
          `,
        )
        .run({
          profile: this.profile,
          payloadHash,
          deliveryFingerprint,
        });

      const duplicateRow = this.#database
        .prepare(
          `
            SELECT
              id, profile, account_id, type, statement_item_id, status,
              received_at, processed_at
            FROM webhook_events
            WHERE profile = @profile
              AND payload_hash = @payloadHash
              AND delivery_fingerprint = @deliveryFingerprint
          `,
        )
        .get({
          profile: this.profile,
          payloadHash,
          deliveryFingerprint,
        }) as SqliteWebhookEventRow | undefined;

      if (duplicateRow) {
        return mapWebhookEventRow(duplicateRow);
      }

      return {
        ...mapWebhookEventRow(row),
        status: "duplicate",
      };
    }

    return mapWebhookEventRow(row);
  }

  async listPendingWebhookStatementWindows(
    profile: string,
    accountId: string,
  ): Promise<readonly { from: number; to: number }[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT payload_json
          FROM webhook_events
          WHERE profile = @profile
            AND account_id = @accountId
            AND status IN ('pending', 'failed')
        `,
      )
      .all({ profile, accountId }) as SqliteWebhookPayloadRow[];
    const statementTimes = rows.flatMap((row) => {
      try {
        const event = JSON.parse(
          row.payload_json,
        ) as MonobankPersonalWebhookEvent;
        const time = event.data.statementItem.time;

        return Number.isInteger(time) && time >= 0 ? [time] : [];
      } catch {
        return [];
      }
    });

    return [...new Set(statementTimes)]
      .sort((left, right) => left - right)
      .map((time) => {
        return { from: time, to: time };
      });
  }

  async markWebhookEventsAsProcessed(
    profile: string,
    accountId: string,
    processedAt = nowIso(),
    reconciledWindows: readonly { from: number; to: number }[] = [],
    receivedBefore = processedAt,
  ): Promise<void> {
    const rows = this.#database
      .prepare(
        `
          SELECT id, statement_item_id, payload_json
          FROM webhook_events
          WHERE profile = @profile
            AND account_id = @accountId
            AND status IN ('pending', 'failed')
            AND received_at <= @receivedBefore
        `,
      )
      .all({
        profile,
        accountId,
        receivedBefore,
      }) as SqlitePendingWebhookEventRow[];
    const hasLedgerEntry = this.#database.prepare(
      `
        SELECT 1
        FROM ledger_entries
        WHERE profile = @profile
          AND account_id = @accountId
          AND raw_statement_item_id = @statementItemId
        LIMIT 1
      `,
    );
    const markProcessed = this.#database.prepare(
      `
        UPDATE webhook_events
          SET status = 'processed',
              processed_at = @processedAt
        WHERE profile = @profile
          AND id = @id
      `,
    );
    const markIgnored = this.#database.prepare(
      `
        UPDATE webhook_events
          SET status = 'ignored',
              processed_at = @processedAt
        WHERE profile = @profile
          AND id = @id
      `,
    );
    const markFailed = this.#database.prepare(
      `
        UPDATE webhook_events
          SET status = 'failed',
              processed_at = @processedAt
        WHERE profile = @profile
          AND id = @id
      `,
    );

    for (const row of rows) {
      const metadata = webhookStatementItemMetadata(row.payload_json);
      const statementItemId =
        row.statement_item_id ?? metadata?.statementItemId;

      if (!statementItemId || !metadata) {
        markFailed.run({
          profile,
          id: row.id,
          processedAt,
        });
        continue;
      }

      const ledgerEntry = hasLedgerEntry.get({
        profile,
        accountId,
        statementItemId,
      });

      if (!ledgerEntry) {
        const wasReconciled = reconciledWindows.some((window) => {
          return metadata.time >= window.from && metadata.time <= window.to;
        });

        if (wasReconciled) {
          markIgnored.run({
            profile,
            id: row.id,
            processedAt,
          });
        }

        continue;
      }

      markProcessed.run({
        profile,
        id: row.id,
        processedAt,
      });
    }
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
    this.ensureProfileName(this.profile);
  }

  private ensureProfileName(profile: string): void {
    this.#database
      .prepare(
        `
          INSERT INTO profiles (name, created_at)
          VALUES (?, ?)
          ON CONFLICT(name) DO NOTHING
        `,
      )
      .run(profile, nowIso());
  }

  private seedDefaultCategories(): void {
    const seed = this.#database
      .prepare(
        `
          SELECT 1
          FROM sqlite_master
          WHERE type = 'table' AND name = 'categories'
          LIMIT 1
        `,
      )
      .get();

    if (!seed) {
      return;
    }

    const insertCategory = this.#database.prepare(
      `
        INSERT INTO categories (
          profile, id, name, color, description, is_system, created_at, updated_at
        )
        VALUES (
          @profile, @id, @name, @color, @description, 1, @timestamp, @timestamp
        )
        ON CONFLICT(profile, id) DO NOTHING
      `,
    );

    const timestamp = nowIso();

    this.#database.transaction(() => {
      for (const category of seededCategories) {
        insertCategory.run({
          profile: this.profile,
          id: category.id,
          name: category.name,
          color: category.color ?? null,
          description: category.description ?? "",
          timestamp,
        });
      }
    })();
  }

  private seedDefaultCategoryRules(): void {
    const seed = this.#database
      .prepare(
        `
          SELECT 1
          FROM sqlite_master
          WHERE type = 'table' AND name = 'category_rules'
          LIMIT 1
        `,
      )
      .get();

    if (!seed) {
      return;
    }

    const insertRule = this.#database.prepare(
      `
        INSERT INTO category_rules (
          profile,
          id,
          category_id,
          name,
          priority,
          match_type,
          merchant_contains,
          description_contains,
          mcc,
          amount_direction,
          is_system,
          is_enabled,
          created_at,
          updated_at
        )
        VALUES (
          @profile,
          @id,
          @categoryId,
          @name,
          @priority,
          @matchType,
          @merchantContains,
          @descriptionContains,
          @mcc,
          @amountDirection,
          1,
          1,
          @timestamp,
          @timestamp
        )
        ON CONFLICT(profile, id) DO NOTHING
      `,
    );

    const timestamp = nowIso();

    this.#database.transaction(() => {
      for (const rule of seededCategoryRules) {
        insertRule.run({
          profile: this.profile,
          id: rule.id,
          categoryId: rule.categoryId,
          name: rule.name,
          priority: rule.priority,
          matchType: rule.matchType,
          merchantContains: rule.merchantContains ?? null,
          descriptionContains: rule.descriptionContains ?? null,
          mcc: rule.mcc ?? null,
          amountDirection: rule.amountDirection ?? null,
          timestamp,
        });
      }
    })();
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

    this.upsertMerchantFromLedgerEntry(entry, timestamp);

    return {
      inserted: existed ? 0 : 1,
      updated: existed ? 1 : 0,
      skipped: 0,
    };
  }

  private upsertMerchantFromLedgerEntry(
    entry: LedgerEntry,
    timestamp: string,
  ): void {
    const name = entry.merchantName?.trim();

    if (!name) {
      return;
    }

    const normalizedName = normalizeMerchantName(name);

    if (!normalizedName) {
      return;
    }

    this.#database
      .prepare(
        `
          INSERT INTO merchants (
            profile,
            id,
            name,
            normalized_name,
            first_seen_at,
            last_seen_at,
            created_at,
            updated_at
          )
          VALUES (
            @profile,
            @id,
            @name,
            @normalizedName,
            @firstSeenAt,
            @lastSeenAt,
            @createdAt,
            @updatedAt
          )
          ON CONFLICT(profile, normalized_name) DO UPDATE SET
            name = CASE
              WHEN excluded.last_seen_at >= merchants.last_seen_at
              THEN excluded.name
              ELSE merchants.name
            END,
            first_seen_at = MIN(merchants.first_seen_at, excluded.first_seen_at),
            last_seen_at = MAX(merchants.last_seen_at, excluded.last_seen_at),
            updated_at = excluded.updated_at
        `,
      )
      .run({
        profile: this.profile,
        id: merchantIdForName(normalizedName),
        name,
        normalizedName,
        firstSeenAt: entry.time,
        lastSeenAt: entry.time,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
  }

  private upsertTagsFromLedgerEntry(
    profile: string,
    row: SqliteLedgerEntryRow,
    timestamp: string,
  ): void {
    const tags = parseTags(row.tags_json);

    if (!tags) {
      return;
    }

    const insertTag = this.#database.prepare(
      `
        INSERT INTO tags (
          profile,
          id,
          name,
          normalized_name,
          created_at,
          updated_at
        )
        VALUES (
          @profile,
          @id,
          @name,
          @normalizedName,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(profile, normalized_name) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at
      `,
    );

    for (const name of tags) {
      const normalizedName = normalizeTagName(name);

      if (!normalizedName) {
        continue;
      }

      insertTag.run({
        profile,
        id: tagIdForName(normalizedName),
        name,
        normalizedName,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }
}

export function createSqliteLedgerDb(
  options: SqliteLedgerDbOptions,
): SqliteLedgerDb {
  return new BetterSqliteLedgerDb(options);
}
