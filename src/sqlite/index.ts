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
  LedgerEntryBulkEditUpdate,
  LedgerEntryCategoryRestoreEntry,
  LedgerEntryReviewState,
  LedgerEntrySplitPlanUpdate,
  LedgerEntryPage,
  LedgerEntryQuery,
  LedgerEntrySortField,
  LedgerCategorySpending,
  LedgerJar,
  LedgerSummary,
  LedgerWriteStats,
  LocalExportRecord,
  LocalAppSettings,
  LocalAppSettingsUpdate,
  Merchant,
  MerchantCleanupRule,
  RecurringDetectionDecision,
  RecurringDetectionDecisionAction,
  RecurringItem,
  StoredWebhookEvent,
  SyncCursor,
  SyncRun,
  Tag,
} from "../storage/index.js";
import { categorizeStatementItem } from "../sync/index.js";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as typeof BetterSqlite3;

export const sqliteStorageEngine = "sqlite";
const internalTransferCategoryId = "transfers";
const internalTransferCategoryName = "Transfers";
const internalTransferRuleId = "internal-transfer-pair";
const internalTransferWindowSeconds = 3 * 24 * 60 * 60;

const ledgerEntrySortColumns: Record<LedgerEntrySortField, string> = {
  time: "ledger_entries.time",
  merchant:
    "LOWER(COALESCE(ledger_entries.merchant_name, ledger_entries.description, ''))",
  amount: "ledger_entries.amount",
  account: "ledger_entries.account_id",
  category:
    "LOWER(COALESCE(ledger_entries.category_name, ledger_entries.category_id, ''))",
  status: "ledger_entries.hold",
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
  listCurrencyRates(profile?: string): Promise<readonly MonobankCurrencyRate[]>;
  upsertStatementItems(
    accountId: string,
    items: readonly MonobankStatementItem[],
    entries: readonly LedgerEntry[],
  ): Promise<LedgerWriteStats>;
  listAccounts(profile?: string): Promise<readonly LedgerAccount[]>;
  listJars(profile?: string): Promise<readonly LedgerJar[]>;
  listCategorySpending(
    profile?: string,
  ): Promise<readonly LedgerCategorySpending[]>;
  listLedgerEntries(query: LedgerEntryQuery): Promise<LedgerEntryPage>;
  getRawStatementItemForEntry(
    profile: string,
    entryId: string,
  ): Promise<SqliteRawStatementItemLookup>;
  updateLedgerEntryAnnotation(
    profile: string,
    id: string,
    update: LedgerEntryAnnotationUpdate,
  ): Promise<LedgerEntry | undefined>;
  updateLedgerEntriesBulkEdit(
    profile: string,
    ids: readonly string[],
    update: LedgerEntryBulkEditUpdate,
  ): Promise<readonly LedgerEntry[]>;
  updateLedgerEntrySplitPlan(
    profile: string,
    id: string,
    update: LedgerEntrySplitPlanUpdate,
  ): Promise<LedgerEntry | undefined>;
  getLedgerSummary(profile?: string): Promise<LedgerSummary>;
  listCategories(profile?: string): Promise<readonly Category[]>;
  listCategoryRules(profile?: string): Promise<readonly CategoryRule[]>;
  upsertCategoryRule(
    profile: string,
    rule: CategoryRule,
  ): Promise<CategoryRule>;
  listMerchants(profile?: string): Promise<readonly Merchant[]>;
  listBudgets(profile?: string): Promise<readonly Budget[]>;
  listBudgetPeriods(profile?: string): Promise<readonly BudgetPeriod[]>;
  deleteMonthlyCategoryBudget(
    profile: string,
    budgetPeriodId: string,
  ): Promise<boolean>;
  listRecurringItems(profile?: string): Promise<readonly RecurringItem[]>;
  upsertRecurringItem(
    profile: string,
    item: RecurringItem,
  ): Promise<RecurringItem>;
  listRecurringDetectionDecisions(
    profile?: string,
  ): Promise<readonly RecurringDetectionDecision[]>;
  recordRecurringDetectionDecision(
    profile: string,
    candidateId: string,
    action: RecurringDetectionDecisionAction,
    decidedAt?: string,
  ): Promise<RecurringDetectionDecision>;
  listTags(profile?: string): Promise<readonly Tag[]>;
  interruptStaleSyncRuns(
    profile: string,
    staleBefore: string,
    interruptedAt: string,
    reason: string,
  ): Promise<number>;
  listSyncRuns(profile?: string, limit?: number): Promise<readonly SyncRun[]>;
  listWebhookEvents(
    profile?: string,
    limit?: number,
  ): Promise<readonly StoredWebhookEvent[]>;
  recordLocalExport(record: LocalExportRecord): Promise<LocalExportRecord>;
  listLocalExports(
    profile?: string,
    limit?: number,
  ): Promise<readonly LocalExportRecord[]>;
  pruneRawStatementItems(profile: string, beforeTime: number): Promise<number>;
  clearProfileLedgerData(profile: string): Promise<Record<string, number>>;
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
  checkpoint(): Promise<void>;
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
  category_source?: LedgerEntry["categorySource"] | null;
  category_rule_id?: string | null;
  category_rule_version?: string | null;
  merchant_name: string | null;
  raw_statement_item_id: string;
  hold: number;
  balance: number | null;
  note: string | null;
  tags_json: string | null;
  split_plan_json: string | null;
  review_state?: LedgerEntryReviewState | null;
  reviewed_at?: string | null;
  reviewed_source?: string | null;
  created_at: string;
  updated_at: string;
}

interface SqliteRawStatementItemRow {
  payload_json: string;
  updated_at: string;
}

export type SqliteRawStatementItemLookup =
  | { available: true; payload: { payload_json: string; updated_at: string } }
  | {
      available: false;
      reason: "entry_not_found" | "pruned" | "no_raw_id";
    };

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
  sync_schedule: LocalAppSettings["syncSchedule"] | null;
  excluded_account_ids_json: string | null;
  export_directory: string | null;
  budget_warning_threshold: number | null;
  raw_statement_retention_days: number | null;
  last_backup_at: string | null;
  last_compact_at: string | null;
  updated_at: string;
}

interface SqliteSyncRunRow {
  id: string;
  profile: string;
  source: "fixture" | "monobank";
  status: SyncRun["status"];
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  api_calls: number;
  windows_fetched: number;
  items_seen: number;
  items_inserted: number;
  items_updated: number;
  items_skipped: number;
  rate_limited: number;
  details_json: string | null;
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

interface SqliteLocalExportRow {
  id: string;
  profile: string;
  format: string;
  preset: string | null;
  filters_json: string;
  row_count: number;
  destination: LocalExportRecord["destination"];
  file_path: string | null;
  status: LocalExportRecord["status"];
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
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

interface SqliteLatestEntryTimeRow {
  latest_entry_time: number | null;
}

interface SqliteCashflowRow {
  income: number | null;
  expenses: number | null;
  net: number | null;
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

interface SqliteCategorySpendingRow {
  category_id: string | null;
  category_name: string | null;
  currency_code: number;
  amount: number;
  transaction_count: number;
}

interface SqliteCategoryRuleRow {
  id: string;
  category_id: string;
  category_name?: string;
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

interface SqliteMerchantCleanupRuleRow {
  id: string;
  name: string;
  priority: number;
  merchant_contains: string;
  canonical_name: string;
  is_system: number;
  is_enabled: number;
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

interface SqliteRecurringDetectionDecisionRow {
  profile: string;
  candidate_id: string;
  action: RecurringDetectionDecisionAction;
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

interface SeedMerchantCleanupRule {
  id: string;
  name: string;
  priority: number;
  merchantContains: string;
  canonicalName: string;
}

interface InternalTransferCandidateRow {
  id: string;
  account_id: string;
  time: number;
  amount: number;
  currency_code: number;
  category_id: string | null;
  hold: number;
  has_category_override: number | null;
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
    id: "utilities",
    name: "Utilities",
    color: "#2563eb",
    description:
      "Utility bills, mobile plans, internet, and communal services.",
  },
  {
    id: "healthcare",
    name: "Healthcare",
    color: "#dc2626",
    description: "Pharmacies, clinics, medical visits, and health services.",
  },
  {
    id: "shopping",
    name: "Shopping",
    color: "#9333ea",
    description: "Clothing, marketplaces, electronics, and personal shopping.",
  },
  {
    id: "household",
    name: "Household",
    color: "#ca8a04",
    description: "Home goods, repairs, furniture, and household supplies.",
  },
  {
    id: "education",
    name: "Education",
    color: "#0891b2",
    description: "Courses, books, school, and professional learning.",
  },
  {
    id: "taxes",
    name: "Taxes",
    color: "#475569",
    description: "Taxes, public services, and mandatory state payments.",
  },
  {
    id: "charity",
    name: "Charity",
    color: "#db2777",
    description: "Donations, volunteer support, and charitable transfers.",
  },
  {
    id: "cash",
    name: "Cash",
    color: "#65a30d",
    description: "ATM withdrawals and cash handling.",
  },
  {
    id: "fees",
    name: "Fees",
    color: "#ea580c",
    description: "Bank fees, commissions, and service charges.",
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
    id: "utilities-mcc-or-text",
    categoryId: "utilities",
    name: "Utilities by MCC or text",
    priority: 250,
    matchType: "condition",
    descriptionContains: "utility",
    mcc: 4900,
    amountDirection: "expense",
  },
  {
    id: "healthcare-mcc-or-text",
    categoryId: "healthcare",
    name: "Healthcare by MCC or text",
    priority: 260,
    matchType: "condition",
    descriptionContains: "pharmacy",
    mcc: 5912,
    amountDirection: "expense",
  },
  {
    id: "shopping-mcc-or-text",
    categoryId: "shopping",
    name: "Shopping by MCC or text",
    priority: 270,
    matchType: "condition",
    descriptionContains: "marketplace",
    mcc: 5311,
    amountDirection: "expense",
  },
  {
    id: "household-mcc-or-text",
    categoryId: "household",
    name: "Household by MCC or text",
    priority: 280,
    matchType: "condition",
    descriptionContains: "household",
    mcc: 5200,
    amountDirection: "expense",
  },
  {
    id: "education-mcc-or-text",
    categoryId: "education",
    name: "Education by MCC or text",
    priority: 290,
    matchType: "condition",
    descriptionContains: "education",
    mcc: 8299,
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
    id: "taxes-mcc-or-text",
    categoryId: "taxes",
    name: "Taxes by MCC or text",
    priority: 650,
    matchType: "condition",
    descriptionContains: "tax",
    mcc: 9311,
    amountDirection: "expense",
  },
  {
    id: "charity-mcc-or-text",
    categoryId: "charity",
    name: "Charity by MCC or text",
    priority: 660,
    matchType: "condition",
    descriptionContains: "donation",
    mcc: 8398,
    amountDirection: "expense",
  },
  {
    id: "cash-mcc-or-text",
    categoryId: "cash",
    name: "Cash by MCC or text",
    priority: 670,
    matchType: "condition",
    descriptionContains: "atm",
    mcc: 6011,
    amountDirection: "expense",
  },
  {
    id: "fees-mcc-or-text",
    categoryId: "fees",
    name: "Fees by MCC or text",
    priority: 680,
    matchType: "condition",
    descriptionContains: "fee",
    mcc: 6012,
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

const seededMerchantCleanupRules: readonly SeedMerchantCleanupRule[] = [
  {
    id: "kyiv-metro-cleanup",
    name: "Kyiv Metro cleanup",
    priority: 200,
    merchantContains: "kyiv metro",
    canonicalName: "Kyiv Metro",
  },
  {
    id: "cloud-subscription-cleanup",
    name: "Cloud Subscription cleanup",
    priority: 300,
    merchantContains: "cloud subscription",
    canonicalName: "Cloud Subscription",
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
  {
    id: "0016_merchant_cleanup_rules",
    description: "Add merchant cleanup rules",
    sql: `
      CREATE TABLE IF NOT EXISTS merchant_cleanup_rules (
        profile TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        priority INTEGER NOT NULL,
        merchant_contains TEXT NOT NULL,
        canonical_name TEXT NOT NULL,
        is_system INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, id),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE INDEX IF NOT EXISTS idx_merchant_cleanup_rules_profile_priority
        ON merchant_cleanup_rules(profile, is_enabled, priority, id);
    `,
  },
  {
    id: "0017_ledger_entry_manual_overrides",
    description: "Track manual ledger category and merchant overrides",
    sql: `
      CREATE TABLE IF NOT EXISTS ledger_entry_manual_overrides (
        profile TEXT NOT NULL,
        ledger_entry_id TEXT NOT NULL,
        has_category_override INTEGER NOT NULL DEFAULT 0,
        has_merchant_override INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, ledger_entry_id),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE INDEX IF NOT EXISTS idx_ledger_entry_manual_overrides_profile_entry
        ON ledger_entry_manual_overrides(profile, ledger_entry_id);

    `,
  },
  {
    id: "0018_ledger_entry_category_rule_metadata",
    description: "Track category rule metadata on ledger entries",
    sql: `
      ALTER TABLE ledger_entries ADD COLUMN category_source TEXT;
      ALTER TABLE ledger_entries ADD COLUMN category_rule_id TEXT;
      ALTER TABLE ledger_entries ADD COLUMN category_rule_version TEXT;

      CREATE INDEX IF NOT EXISTS idx_ledger_entries_category_source
        ON ledger_entries(profile, category_source);

      CREATE INDEX IF NOT EXISTS idx_ledger_entries_category_rule
        ON ledger_entries(profile, category_rule_id);

      UPDATE ledger_entries
        SET category_source = 'manual',
            category_rule_id = NULL,
            category_rule_version = NULL
        WHERE EXISTS (
          SELECT 1
          FROM ledger_entry_manual_overrides
          WHERE ledger_entry_manual_overrides.profile = ledger_entries.profile
            AND ledger_entry_manual_overrides.ledger_entry_id = ledger_entries.id
            AND ledger_entry_manual_overrides.has_category_override = 1
        );
    `,
  },
  {
    id: "0019_recurring_detection_decisions",
    description: "Track recurring detection confirm and ignore decisions",
    sql: `
      CREATE TABLE IF NOT EXISTS recurring_detection_decisions (
        profile TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, candidate_id),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE INDEX IF NOT EXISTS idx_recurring_detection_decisions_profile_action
        ON recurring_detection_decisions(profile, action, updated_at DESC);
    `,
  },
  {
    id: "0020_remove_fixture_merchant_cleanup_seed",
    description: "Remove fixture merchant cleanup seed",
    sql: `
      DELETE FROM merchant_cleanup_rules
      WHERE id = 'fixture-grocery-cleanup'
        AND is_system = 1;
    `,
  },
  {
    id: "0021_sync_run_error_message",
    description: "Track user-facing sync run failure reasons",
    sql: `
      ALTER TABLE sync_runs ADD COLUMN error_message TEXT;
    `,
  },
  {
    id: "0022_ledger_entry_review_states",
    description: "Track local transaction review state",
    sql: `
      CREATE TABLE IF NOT EXISTS ledger_entry_review_states (
        profile TEXT NOT NULL,
        ledger_entry_id TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'needs_review',
        reviewed_at TEXT,
        reviewed_source TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile, ledger_entry_id),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE INDEX IF NOT EXISTS idx_ledger_entry_review_states_profile_state
        ON ledger_entry_review_states(profile, state, updated_at DESC);
    `,
  },
  {
    id: "0023_local_app_cockpit_settings",
    description: "Store local cockpit workflow settings",
    sql: `
      ALTER TABLE local_app_settings ADD COLUMN sync_schedule TEXT;
      ALTER TABLE local_app_settings ADD COLUMN excluded_account_ids_json TEXT;
      ALTER TABLE local_app_settings ADD COLUMN export_directory TEXT;
      ALTER TABLE local_app_settings ADD COLUMN budget_warning_threshold INTEGER;
      ALTER TABLE local_app_settings ADD COLUMN last_backup_at TEXT;
      ALTER TABLE local_app_settings ADD COLUMN last_compact_at TEXT;
    `,
  },
  {
    id: "0024_local_exports",
    description: "Track recent local export runs",
    sql: `
      CREATE TABLE IF NOT EXISTS local_exports (
        id TEXT NOT NULL,
        profile TEXT NOT NULL,
        format TEXT NOT NULL,
        preset TEXT,
        filters_json TEXT NOT NULL,
        row_count INTEGER NOT NULL,
        destination TEXT NOT NULL,
        file_path TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        error_message TEXT,
        PRIMARY KEY (profile, id),
        FOREIGN KEY (profile) REFERENCES profiles(name)
      );

      CREATE INDEX IF NOT EXISTS idx_local_exports_profile_created
        ON local_exports(profile, created_at DESC);
    `,
  },
  {
    id: "0025_raw_statement_retention",
    description: "Store raw statement payload retention settings",
    sql: `
      ALTER TABLE local_app_settings
        ADD COLUMN raw_statement_retention_days INTEGER NOT NULL DEFAULT 90;
    `,
  },
  {
    id: "0026_bi_views",
    description: "Add DuckDB-friendly BI views",
    sql: `
      DROP VIEW IF EXISTS v_transactions_long;
      DROP VIEW IF EXISTS v_monthly_spending;
      DROP VIEW IF EXISTS v_daily_balance;
      DROP VIEW IF EXISTS v_recurring_commitments;
      DROP VIEW IF EXISTS v_budget_progress;

      CREATE VIEW v_transactions_long AS
        SELECT
          ledger_entries.profile,
          ledger_entries.id AS transaction_id,
          ledger_entries.account_id,
          accounts.type AS account_type,
          ledger_entries.time AS transaction_time,
          datetime(ledger_entries.time, 'unixepoch') AS transaction_at_utc,
          date(ledger_entries.time, 'unixepoch') AS transaction_date,
          substr(date(ledger_entries.time, 'unixepoch'), 1, 7) AS transaction_month,
          ledger_entries.description,
          ledger_entries.merchant_name,
          ledger_entries.amount,
          ROUND(ledger_entries.amount / 100.0, 2) AS amount_major,
          ledger_entries.operation_amount,
          ledger_entries.currency_code,
          ledger_entries.category_id,
          ledger_entries.category_name,
          ledger_entries.category_source,
          ledger_entries.category_rule_id,
          ledger_entries.hold AS is_hold,
          ledger_entries.balance,
          COALESCE(ledger_entry_review_states.state, 'needs_review') AS review_state,
          ledger_entry_review_states.reviewed_at,
          ledger_entries.note,
          ledger_entries.tags_json,
          ledger_entries.raw_statement_item_id,
          ledger_entries.created_at,
          ledger_entries.updated_at
        FROM ledger_entries
        LEFT JOIN accounts
          ON accounts.profile = ledger_entries.profile
          AND accounts.id = ledger_entries.account_id
        LEFT JOIN ledger_entry_review_states
          ON ledger_entry_review_states.profile = ledger_entries.profile
          AND ledger_entry_review_states.ledger_entry_id = ledger_entries.id;

      CREATE VIEW v_monthly_spending AS
        SELECT
          profile,
          transaction_month AS month,
          currency_code,
          category_id,
          category_name,
          SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS spending_amount,
          ROUND(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) / 100.0, 2) AS spending_amount_major,
          COUNT(*) FILTER (WHERE amount < 0) AS transaction_count
        FROM v_transactions_long
        WHERE amount < 0
          AND COALESCE(category_id, '') <> 'transfers'
        GROUP BY profile, transaction_month, currency_code, category_id, category_name;

      CREATE VIEW v_daily_balance AS
        SELECT
          profile,
          account_id,
          balance_date,
          currency_code,
          balance,
          ROUND(balance / 100.0, 2) AS balance_major,
          transaction_time,
          transaction_id
        FROM (
          SELECT
            ledger_entries.profile,
            ledger_entries.account_id,
            date(ledger_entries.time, 'unixepoch') AS balance_date,
            ledger_entries.currency_code,
            ledger_entries.balance,
            ledger_entries.time AS transaction_time,
            ledger_entries.id AS transaction_id,
            ROW_NUMBER() OVER (
              PARTITION BY ledger_entries.profile, ledger_entries.account_id, date(ledger_entries.time, 'unixepoch')
              ORDER BY ledger_entries.time DESC, ledger_entries.id DESC
            ) AS row_number
          FROM ledger_entries
          WHERE ledger_entries.balance IS NOT NULL
        )
        WHERE row_number = 1;

      CREATE VIEW v_recurring_commitments AS
        SELECT
          recurring_items.profile,
          recurring_items.id AS recurring_item_id,
          recurring_items.account_id,
          recurring_items.category_id,
          categories.name AS category_name,
          recurring_items.merchant_name,
          recurring_items.frequency,
          recurring_items.expected_amount_min,
          recurring_items.expected_amount_max,
          ROUND(recurring_items.expected_amount_min / 100.0, 2) AS expected_amount_min_major,
          ROUND(recurring_items.expected_amount_max / 100.0, 2) AS expected_amount_max_major,
          recurring_items.is_active,
          recurring_items.started_at,
          recurring_items.last_seen_at,
          recurring_items.created_at,
          recurring_items.updated_at
        FROM recurring_items
        LEFT JOIN categories
          ON categories.profile = recurring_items.profile
          AND categories.id = recurring_items.category_id;

      CREATE VIEW v_budget_progress AS
        SELECT
          budget_periods.profile,
          budgets.id AS budget_id,
          budget_periods.id AS budget_period_id,
          budgets.category_id,
          categories.name AS category_name,
          budgets.currency_code,
          budgets.period_start,
          budgets.period_end,
          budgets.amount_limit,
          budget_periods.planned_amount,
          COALESCE(
            budget_periods.actual_amount,
            (
              SELECT SUM(
                CASE
                  WHEN ledger_entries.amount < 0 THEN -ledger_entries.amount
                  WHEN budgets.include_inflows = 1 THEN -ledger_entries.amount
                  ELSE 0
                END
              )
              FROM ledger_entries
              WHERE ledger_entries.profile = budget_periods.profile
                AND ledger_entries.category_id = budgets.category_id
                AND ledger_entries.currency_code = budgets.currency_code
                AND date(ledger_entries.time, 'unixepoch') >= budget_periods.period_start
                AND date(ledger_entries.time, 'unixepoch') <= budget_periods.period_end
                AND ledger_entries.hold = 0
            ),
            0
          ) AS actual_amount,
          budgets.amount_limit - COALESCE(
            budget_periods.actual_amount,
            (
              SELECT SUM(
                CASE
                  WHEN ledger_entries.amount < 0 THEN -ledger_entries.amount
                  WHEN budgets.include_inflows = 1 THEN -ledger_entries.amount
                  ELSE 0
                END
              )
              FROM ledger_entries
              WHERE ledger_entries.profile = budget_periods.profile
                AND ledger_entries.category_id = budgets.category_id
                AND ledger_entries.currency_code = budgets.currency_code
                AND date(ledger_entries.time, 'unixepoch') >= budget_periods.period_start
                AND date(ledger_entries.time, 'unixepoch') <= budget_periods.period_end
                AND ledger_entries.hold = 0
            ),
            0
          ) AS remaining_amount,
          CASE
            WHEN budgets.amount_limit <= 0 THEN 0
            ELSE ROUND(
              COALESCE(
                budget_periods.actual_amount,
                (
                  SELECT SUM(
                    CASE
                      WHEN ledger_entries.amount < 0 THEN -ledger_entries.amount
                      WHEN budgets.include_inflows = 1 THEN -ledger_entries.amount
                      ELSE 0
                    END
                  )
                  FROM ledger_entries
                  WHERE ledger_entries.profile = budget_periods.profile
                    AND ledger_entries.category_id = budgets.category_id
                    AND ledger_entries.currency_code = budgets.currency_code
                    AND date(ledger_entries.time, 'unixepoch') >= budget_periods.period_start
                    AND date(ledger_entries.time, 'unixepoch') <= budget_periods.period_end
                    AND ledger_entries.hold = 0
                ),
                0
              ) * 100.0 / budgets.amount_limit,
              2
            )
          END AS progress_percentage,
          budget_periods.status,
          budgets.include_inflows,
          budget_periods.created_at,
          budget_periods.updated_at
        FROM budget_periods
        INNER JOIN budgets
          ON budgets.profile = budget_periods.profile
          AND budgets.id = budget_periods.budget_id
        LEFT JOIN categories
          ON categories.profile = budgets.profile
          AND categories.id = budgets.category_id;
    `,
  },
  {
    id: "0027_sync_run_details",
    description: "Track per-account sync completion and failed windows",
    sql: `
      ALTER TABLE sync_runs ADD COLUMN details_json TEXT;
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

function parseStringList(value: string | null): readonly string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return [
      ...new Set(
        parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  } catch {
    return [];
  }
}

function parseRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

function isSyncSchedule(
  value: unknown,
): value is NonNullable<LocalAppSettings["syncSchedule"]> {
  return (
    value === "manual" ||
    value === "hourly" ||
    value === "daily" ||
    value === "app_start"
  );
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

function isLedgerEntryReviewState(
  value: unknown,
): value is LedgerEntryReviewState {
  return (
    value === "needs_review" || value === "reviewed" || value === "ignored"
  );
}

function normalizeLedgerEntryBulkEdit(update: LedgerEntryBulkEditUpdate): {
  categoryId: string | null | undefined;
  merchantName: string | null | undefined;
  tagsJson: string | null | undefined;
  reviewState: LedgerEntryReviewState | undefined;
  reviewedSource: string | null | undefined;
} {
  const categoryId =
    update.categoryId === undefined ? undefined : update.categoryId.trim();
  const merchantName =
    update.merchantName === undefined ? undefined : update.merchantName.trim();
  const reviewedSource =
    update.reviewedSource === undefined
      ? undefined
      : update.reviewedSource.trim();
  const tags =
    update.tags === undefined
      ? undefined
      : [...new Set(update.tags.map((tag) => tag.trim()).filter(Boolean))];

  return {
    categoryId:
      categoryId === undefined
        ? undefined
        : categoryId === ""
          ? null
          : categoryId,
    merchantName:
      merchantName === undefined
        ? undefined
        : merchantName === ""
          ? null
          : merchantName,
    tagsJson:
      tags === undefined
        ? undefined
        : tags.length === 0
          ? null
          : JSON.stringify(tags),
    reviewState: isLedgerEntryReviewState(update.reviewState)
      ? update.reviewState
      : undefined,
    reviewedSource:
      reviewedSource === undefined
        ? undefined
        : reviewedSource === ""
          ? null
          : reviewedSource,
  };
}

function normalizeLedgerEntryCategoryRestoreEntries(
  entries: readonly LedgerEntryCategoryRestoreEntry[],
): LedgerEntryCategoryRestoreEntry[] {
  const normalizedEntries = new Map<string, LedgerEntryCategoryRestoreEntry>();

  for (const entry of entries) {
    const id = entry.id.trim();

    if (!id) {
      continue;
    }

    const categoryId = entry.categoryId?.trim();
    const categoryName = entry.categoryName?.trim();
    const categoryRuleId = entry.categoryRuleId?.trim();
    const categoryRuleVersion = entry.categoryRuleVersion?.trim();

    normalizedEntries.set(id, {
      id,
      ...(categoryId ? { categoryId } : {}),
      ...(categoryName ? { categoryName } : {}),
      ...(entry.categorySource ? { categorySource: entry.categorySource } : {}),
      ...(categoryRuleId ? { categoryRuleId } : {}),
      ...(categoryRuleVersion ? { categoryRuleVersion } : {}),
    });
  }

  return [...normalizedEntries.values()];
}

function normalizeMerchantName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function tokenizeRuleText(text: string): readonly string[] {
  return normalizeMerchantName(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function tokenSequenceIncludes(
  textTokens: readonly string[],
  termTokens: readonly string[],
): boolean {
  if (termTokens.length === 0 || termTokens.length > textTokens.length) {
    return false;
  }

  return textTokens.some((_, startIndex) =>
    termTokens.every(
      (termToken, offset) => textTokens[startIndex + offset] === termToken,
    ),
  );
}

function ruleTermVariants(term: string): readonly string[] {
  const normalizedTerm = normalizeMerchantName(term);
  const variants = [
    normalizedTerm,
    `${normalizedTerm}s`,
    `${normalizedTerm}es`,
  ];

  if (normalizedTerm.endsWith("y")) {
    variants.push(`${normalizedTerm.slice(0, -1)}ies`);
  }

  return variants;
}

function textMatchesRuleTerm(text: string | undefined, term: string): boolean {
  const normalizedText = normalizeMerchantName(text ?? "");
  const normalizedTerm = normalizeMerchantName(term);

  if (!normalizedText || !normalizedTerm) {
    return false;
  }

  const textTokens = tokenizeRuleText(normalizedText);
  const termTokens = tokenizeRuleText(normalizedTerm);

  if (termTokens.length > 1) {
    return tokenSequenceIncludes(textTokens, termTokens);
  }

  const textTokenSet = new Set(textTokens);

  return ruleTermVariants(normalizedTerm).some((variant) =>
    textTokenSet.has(variant),
  );
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

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function localMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function localMonthStartEpoch(date: Date): number {
  return Math.floor(
    new Date(date.getFullYear(), date.getMonth(), 1).getTime() / 1000,
  );
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

function mapCategorySpendingRow(
  row: SqliteCategorySpendingRow,
): LedgerCategorySpending {
  const categoryId = row.category_id ?? "uncategorized";
  const categoryName =
    row.category_name && row.category_name.trim() !== ""
      ? row.category_name
      : "Uncategorized";

  return {
    categoryId,
    categoryName,
    currencyCode: row.currency_code,
    amount: row.amount,
    transactionCount: row.transaction_count,
  };
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

function mapMerchantCleanupRuleRow(
  row: SqliteMerchantCleanupRuleRow,
): MerchantCleanupRule {
  const rule: MerchantCleanupRule = {
    id: row.id,
    name: row.name,
    priority: row.priority,
    merchantContains: row.merchant_contains,
    canonicalName: row.canonical_name,
    createdAt: row.created_at,
  };

  if (row.is_system === 1) {
    rule.isSystem = true;
  }

  rule.isEnabled = row.is_enabled === 1;

  if (row.updated_at !== row.created_at) {
    rule.updatedAt = row.updated_at;
  }

  return rule;
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

function mapRecurringDetectionDecisionRow(
  row: SqliteRecurringDetectionDecisionRow,
): RecurringDetectionDecision {
  return {
    profile: row.profile,
    candidateId: row.candidate_id,
    action: row.action,
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

  if (row.category_source !== undefined && row.category_source !== null) {
    entry.categorySource = row.category_source;
  }

  if (row.category_rule_id !== undefined && row.category_rule_id !== null) {
    entry.categoryRuleId = row.category_rule_id;
  }

  if (
    row.category_rule_version !== undefined &&
    row.category_rule_version !== null
  ) {
    entry.categoryRuleVersion = row.category_rule_version;
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

  entry.reviewState = row.review_state ?? "needs_review";

  if (row.reviewed_at) {
    entry.reviewedAt = row.reviewed_at;
  }

  if (row.reviewed_source) {
    entry.reviewedSource = row.reviewed_source;
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

  if (row.error_message !== null) {
    run.errorMessage = row.error_message;
  }

  if (row.details_json !== null) {
    try {
      const details = JSON.parse(row.details_json) as SyncRun["details"];

      if (details && Array.isArray(details.accounts)) {
        run.details = details;
      }
    } catch {
      // Keep older/corrupt optional detail payloads from hiding the run itself.
    }
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

function mapLocalAppSettingsRow(
  row: SqliteLocalAppSettingsRow,
): LocalAppSettings {
  const settings: LocalAppSettings = {
    profile: row.profile,
    updatedAt: row.updated_at,
  };
  const excludedAccountIds = parseStringList(row.excluded_account_ids_json);

  if (row.source !== null) {
    settings.source = row.source;
  }

  if (isSyncSchedule(row.sync_schedule)) {
    settings.syncSchedule = row.sync_schedule;
  }

  if (excludedAccountIds.length > 0) {
    settings.excludedAccountIds = excludedAccountIds;
  }

  if (row.export_directory !== null && row.export_directory.trim() !== "") {
    settings.exportDirectory = row.export_directory;
  }

  if (
    row.budget_warning_threshold !== null &&
    Number.isInteger(row.budget_warning_threshold)
  ) {
    settings.budgetWarningThreshold = row.budget_warning_threshold;
  }

  if (
    row.raw_statement_retention_days !== null &&
    Number.isInteger(row.raw_statement_retention_days)
  ) {
    settings.rawStatementRetentionDays = row.raw_statement_retention_days;
  }

  if (row.last_backup_at !== null) {
    settings.lastBackupAt = row.last_backup_at;
  }

  if (row.last_compact_at !== null) {
    settings.lastCompactAt = row.last_compact_at;
  }

  return settings;
}

function mapLocalExportRow(row: SqliteLocalExportRow): LocalExportRecord {
  const record: LocalExportRecord = {
    id: row.id,
    profile: row.profile,
    format: row.format,
    filters: parseRecord(row.filters_json),
    rowCount: row.row_count,
    destination: row.destination,
    status: row.status,
    createdAt: row.created_at,
  };

  if (row.preset !== null) {
    record.preset = row.preset;
  }

  if (row.file_path !== null) {
    record.filePath = row.file_path;
  }

  if (row.completed_at !== null) {
    record.completedAt = row.completed_at;
  }

  if (row.error_message !== null) {
    record.errorMessage = row.error_message;
  }

  return record;
}

function accountExclusionClause(
  excludedAccountIds: readonly string[] | undefined,
  column = "ledger_entries.account_id",
): {
  sql: string;
  params: Record<string, string>;
} {
  const normalizedIds = [
    ...new Set(
      (excludedAccountIds ?? []).map((id) => id.trim()).filter(Boolean),
    ),
  ];

  if (normalizedIds.length === 0) {
    return {
      sql: "",
      params: {},
    };
  }

  const placeholders = normalizedIds.map((id, index) => {
    return [`excludedAccountId${index}`, id] as const;
  });

  return {
    sql: ` AND ${column} NOT IN (${placeholders
      .map(([key]) => `@${key}`)
      .join(", ")})`,
    params: Object.fromEntries(placeholders),
  };
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
  const clauses = ["ledger_entries.profile = @profile"];
  const params: Record<string, string | number> = {
    profile: query.profile,
  };

  if (query.accountId) {
    clauses.push("ledger_entries.account_id = @accountId");
    params.accountId = query.accountId;
  } else if (!query.includeExcludedAccounts) {
    const exclusions = accountExclusionClause(query.excludedAccountIds);

    if (exclusions.sql) {
      clauses.push(exclusions.sql.replace(/^ AND /, ""));
      Object.assign(params, exclusions.params);
    }
  }

  if (query.categoryId) {
    clauses.push("ledger_entries.category_id = @categoryId");
    params.categoryId = query.categoryId;
  }

  if (query.merchantName?.trim()) {
    clauses.push("ledger_entries.merchant_name LIKE @merchantName");
    params.merchantName = `%${query.merchantName.trim()}%`;
  }

  if (query.status === "hold") {
    clauses.push("ledger_entries.hold = 1");
  }

  if (query.status === "posted") {
    clauses.push("ledger_entries.hold = 0");
  }

  if (query.reviewState !== undefined) {
    clauses.push(
      "COALESCE(ledger_entry_review_states.state, 'needs_review') = @reviewState",
    );
    params.reviewState = query.reviewState;
  }

  if (query.currencyCode !== undefined) {
    clauses.push("ledger_entries.currency_code = @currencyCode");
    params.currencyCode = query.currencyCode;
  }

  if (query.tag?.trim()) {
    clauses.push(
      "EXISTS (SELECT 1 FROM json_each(ledger_entries.tags_json) WHERE value = @tag)",
    );
    params.tag = query.tag.trim();
  }

  if (query.amountMin !== undefined) {
    clauses.push("ledger_entries.amount >= @amountMin");
    params.amountMin = query.amountMin;
  }

  if (query.amountMax !== undefined) {
    clauses.push("ledger_entries.amount <= @amountMax");
    params.amountMax = query.amountMax;
  }

  if (query.from !== undefined) {
    clauses.push("ledger_entries.time >= @from");
    params.from = query.from;
  }

  if (query.to !== undefined) {
    clauses.push("ledger_entries.time <= @to");
    params.to = query.to;
  }

  if (query.search?.trim()) {
    clauses.push(
      "(ledger_entries.description LIKE @search OR ledger_entries.merchant_name LIKE @search OR ledger_entries.category_name LIKE @search OR ledger_entries.note LIKE @search OR ledger_entries.tags_json LIKE @search)",
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
      const hadMerchantCleanupMigration = Boolean(
        hasMigration.get("0016_merchant_cleanup_rules"),
      );
      let appliedManualOverrideMigration = false;
      let appliedCategoryRuleMetadataMigration = false;

      for (const migration of migrations) {
        if (hasMigration.get(migration.id)) {
          continue;
        }

        this.#database.exec(migration.sql);
        recordMigration.run(migration.id, migration.description, nowIso());
        appliedManualOverrideMigration ||=
          migration.id === "0017_ledger_entry_manual_overrides";
        appliedCategoryRuleMetadataMigration ||=
          migration.id === "0018_ledger_entry_category_rule_metadata";
      }

      this.ensureProfile();
      if (appliedManualOverrideMigration) {
        this.seedDefaultConfigurationForExistingProfiles();
        this.backfillLegacyManualOverrideMarkers({
          compareCleanedMerchants: hadMerchantCleanupMigration,
        });
      }
      if (
        appliedManualOverrideMigration ||
        appliedCategoryRuleMetadataMigration
      ) {
        this.backfillManualCategoryOverrideSources();
      }
      this.seedDefaultCategories();
      this.seedDefaultCategoryRules();
      this.seedDefaultMerchantCleanupRules();
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
      updateLedgerEntriesBulkEdit: (profile, ids, update) =>
        this.updateLedgerEntriesBulkEdit(profile, ids, update),
      restoreLedgerEntryCategories: (profile, entries) =>
        this.restoreLedgerEntryCategories(profile, entries),
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
    const settings = await this.getLocalAppSettings(profile);
    const exclusions = accountExclusionClause(
      settings?.excludedAccountIds,
      "id",
    );
    const rows = this.#database
      .prepare(
        `
          SELECT id AS accountId, currency_code AS currencyCode, balance, credit_limit AS creditLimit
          FROM accounts
          WHERE profile = @profile
            ${exclusions.sql}
          ORDER BY id
        `,
      )
      .all({ profile, ...exclusions.params }) as AccountBalance[];

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
          SELECT
            profile,
            source,
            sync_schedule,
            excluded_account_ids_json,
            export_directory,
            budget_warning_threshold,
            raw_statement_retention_days,
            last_backup_at,
            last_compact_at,
            updated_at
          FROM local_app_settings
          WHERE profile = ?
        `,
      )
      .get(profile) as SqliteLocalAppSettingsRow | undefined;

    return row ? mapLocalAppSettingsRow(row) : undefined;
  }

  async updateLocalAppSettings(
    profile: string,
    update: LocalAppSettingsUpdate,
  ): Promise<LocalAppSettings> {
    this.ensureProfile();

    const current = await this.getLocalAppSettings(profile);
    const nextSource = update.source ?? current?.source;
    const nextSyncSchedule = update.syncSchedule ?? current?.syncSchedule;
    const nextExcludedAccountIds =
      update.excludedAccountIds === undefined
        ? (current?.excludedAccountIds ?? [])
        : [
            ...new Set(
              update.excludedAccountIds.map((id) => id.trim()).filter(Boolean),
            ),
          ];
    const nextExportDirectory =
      update.exportDirectory === undefined
        ? current?.exportDirectory
        : (update.exportDirectory?.trim() ?? undefined);
    const nextBudgetWarningThreshold =
      update.budgetWarningThreshold ?? current?.budgetWarningThreshold;
    const requestedRawStatementRetentionDays = update.rawStatementRetentionDays;
    const nextRawStatementRetentionDays =
      requestedRawStatementRetentionDays === undefined ||
      !Number.isFinite(requestedRawStatementRetentionDays)
        ? (current?.rawStatementRetentionDays ?? 90)
        : Math.max(0, Math.trunc(requestedRawStatementRetentionDays));
    const nextLastBackupAt = update.lastBackupAt ?? current?.lastBackupAt;
    const nextLastCompactAt = update.lastCompactAt ?? current?.lastCompactAt;
    const updatedAt = nowIso();

    this.#database
      .prepare(
        `
          INSERT INTO local_app_settings (
            profile,
            source,
            sync_schedule,
            excluded_account_ids_json,
            export_directory,
            budget_warning_threshold,
            raw_statement_retention_days,
            last_backup_at,
            last_compact_at,
            updated_at
          )
          VALUES (
            @profile,
            @source,
            @syncSchedule,
            @excludedAccountIdsJson,
            @exportDirectory,
            @budgetWarningThreshold,
            @rawStatementRetentionDays,
            @lastBackupAt,
            @lastCompactAt,
            @updatedAt
          )
          ON CONFLICT(profile) DO UPDATE SET
            source = excluded.source,
            sync_schedule = excluded.sync_schedule,
            excluded_account_ids_json = excluded.excluded_account_ids_json,
            export_directory = excluded.export_directory,
            budget_warning_threshold = excluded.budget_warning_threshold,
            raw_statement_retention_days = excluded.raw_statement_retention_days,
            last_backup_at = excluded.last_backup_at,
            last_compact_at = excluded.last_compact_at,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        profile,
        source: nextSource ?? null,
        syncSchedule: nextSyncSchedule ?? null,
        excludedAccountIdsJson:
          nextExcludedAccountIds.length === 0
            ? null
            : JSON.stringify(nextExcludedAccountIds),
        exportDirectory: nextExportDirectory ?? null,
        budgetWarningThreshold: nextBudgetWarningThreshold ?? null,
        rawStatementRetentionDays: nextRawStatementRetentionDays ?? 90,
        lastBackupAt: nextLastBackupAt ?? null,
        lastCompactAt: nextLastCompactAt ?? null,
        updatedAt,
      });

    const row = await this.getLocalAppSettings(profile);

    if (!row) {
      return {
        profile,
        updatedAt,
      };
    }

    return row;
  }

  async recordSyncRun(run: SyncRun): Promise<void> {
    this.#database
      .prepare(
        `
          INSERT INTO sync_runs (
            id, profile, source, status, started_at, finished_at,
            error_message,
            api_calls, windows_fetched, items_seen, items_inserted, items_updated, items_skipped, rate_limited,
            details_json
          )
          VALUES (
            @id, @profile, @source, @status, @startedAt, @finishedAt,
            @errorMessage,
            @apiCalls, @windowsFetched, @itemsSeen, @itemsInserted, @itemsUpdated, @itemsSkipped, @rateLimited,
            @detailsJson
          )
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            finished_at = excluded.finished_at,
            error_message = excluded.error_message,
            api_calls = excluded.api_calls,
            windows_fetched = excluded.windows_fetched,
            items_seen = excluded.items_seen,
            items_inserted = excluded.items_inserted,
            items_updated = excluded.items_updated,
            items_skipped = excluded.items_skipped,
            rate_limited = excluded.rate_limited,
            details_json = excluded.details_json
        `,
      )
      .run({
        id: run.id,
        profile: run.profile,
        source: run.source,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt ?? null,
        errorMessage: run.errorMessage ?? null,
        apiCalls: run.apiCalls,
        windowsFetched: run.windowsFetched,
        itemsSeen: run.itemsSeen,
        itemsInserted: run.itemsInserted,
        itemsUpdated: run.itemsUpdated,
        itemsSkipped: run.itemsSkipped,
        rateLimited: run.rateLimited,
        detailsJson: run.details ? JSON.stringify(run.details) : null,
      });
  }

  async interruptStaleSyncRuns(
    profile: string,
    staleBefore: string,
    interruptedAt: string,
    reason: string,
  ): Promise<number> {
    const result = this.#database
      .prepare(
        `
          UPDATE sync_runs
          SET
            status = 'interrupted',
            finished_at = @interruptedAt,
            error_message = @reason
          WHERE profile = @profile
            AND status = 'running'
            AND started_at <= @staleBefore
        `,
      )
      .run({
        profile,
        staleBefore,
        interruptedAt,
        reason,
      });

    return result.changes;
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

  async listCurrencyRates(
    profile = this.profile,
  ): Promise<readonly MonobankCurrencyRate[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            currency_code_a AS currencyCodeA,
            currency_code_b AS currencyCodeB,
            date,
            rate_buy AS rateBuy,
            rate_sell AS rateSell,
            rate_cross AS rateCross
          FROM currency_rates
          WHERE profile = ?
          ORDER BY date DESC, currency_code_a ASC, currency_code_b ASC
        `,
      )
      .all(profile) as Array<{
      currencyCodeA: number;
      currencyCodeB: number;
      date: number;
      rateBuy: number | null;
      rateSell: number | null;
      rateCross: number | null;
    }>;

    return rows.map((row): MonobankCurrencyRate => {
      return {
        currencyCodeA: row.currencyCodeA,
        currencyCodeB: row.currencyCodeB,
        date: row.date,
        ...(row.rateBuy === null ? {} : { rateBuy: row.rateBuy }),
        ...(row.rateSell === null ? {} : { rateSell: row.rateSell }),
        ...(row.rateCross === null ? {} : { rateCross: row.rateCross }),
      };
    });
  }

  async upsertStatementItems(
    accountId: string,
    items: readonly MonobankStatementItem[],
    entries: readonly LedgerEntry[],
  ): Promise<LedgerWriteStats> {
    let stats = emptyWriteStats();
    const touchedLedgerEntryIds = new Set<string>();
    const rawExists = this.#database.prepare(`
      SELECT 1 FROM raw_statement_items
      WHERE profile = ? AND account_id = ? AND statement_item_id = ?
    `);
    const rawLookup = this.#database.prepare(`
      SELECT payload_json, updated_at
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
        const previousRaw = rawLookup.get(
          this.profile,
          accountId,
          statementItemId,
        ) as SqliteRawStatementItemRow | undefined;
        const previousPayload = previousRaw?.payload_json;

        if (!entry) {
          rawUpsert.run({
            profile: this.profile,
            accountId,
            statementItemId,
            time: item.time,
            payloadJson,
            updatedAt: nowIso(),
          });
          stats.skipped += 1;
          continue;
        }

        touchedLedgerEntryIds.add(entry.id);

        if (existed && previousPayload === payloadJson) {
          const normalizedEntry = this.mergeManualLedgerEntryOverrides(
            this.prepareLedgerEntryForWrite(entry, item),
          );

          if (this.ledgerEntryMatchesStoredEntry(normalizedEntry)) {
            stats.skipped += 1;
            continue;
          }

          const entryStats = this.upsertPreparedLedgerEntry(normalizedEntry);
          rawUpsert.run({
            profile: this.profile,
            accountId,
            statementItemId,
            time: item.time,
            payloadJson,
            updatedAt: nowIso(),
          });
          stats = addWriteStats(stats, entryStats);
          continue;
        }

        const normalizedEntry = this.mergeManualLedgerEntryOverrides(
          this.prepareLedgerEntryForWrite(entry, item),
        );
        const entryStats = this.upsertPreparedLedgerEntry(normalizedEntry);
        rawUpsert.run({
          profile: this.profile,
          accountId,
          statementItemId,
          time: item.time,
          payloadJson,
          updatedAt: nowIso(),
        });
        stats = addWriteStats(stats, entryStats);

        if (existed && entryStats.inserted === 0 && entryStats.updated === 0) {
          stats.skipped += 1;
        }
      }

      stats = addWriteStats(
        stats,
        this.applyInferredInternalTransferCategories(
          [...touchedLedgerEntryIds],
          nowIso(),
        ),
      );
    });
    write();

    return stats;
  }

  private applyInferredInternalTransferCategories(
    entryIds: readonly string[],
    updatedAt: string,
  ): LedgerWriteStats {
    const normalizedIds = [
      ...new Set(entryIds.map((id) => id.trim()).filter(Boolean)),
    ];

    if (normalizedIds.length === 0) {
      return emptyWriteStats();
    }

    const selectEntry = this.#database.prepare(
      `
        SELECT
          ledger_entries.id,
          ledger_entries.account_id,
          ledger_entries.time,
          ledger_entries.amount,
          ledger_entries.currency_code,
          ledger_entries.category_id,
          ledger_entries.hold,
          ledger_entry_manual_overrides.has_category_override
        FROM ledger_entries
        LEFT JOIN ledger_entry_manual_overrides
          ON ledger_entry_manual_overrides.profile = ledger_entries.profile
          AND ledger_entry_manual_overrides.ledger_entry_id = ledger_entries.id
        WHERE ledger_entries.profile = ? AND ledger_entries.id = ?
      `,
    );
    const selectCounterpart = this.#database.prepare(
      `
        SELECT
          ledger_entries.id,
          ledger_entries.account_id,
          ledger_entries.time,
          ledger_entries.amount,
          ledger_entries.currency_code,
          ledger_entries.category_id,
          ledger_entries.hold,
          ledger_entry_manual_overrides.has_category_override
        FROM ledger_entries
        LEFT JOIN ledger_entry_manual_overrides
          ON ledger_entry_manual_overrides.profile = ledger_entries.profile
          AND ledger_entry_manual_overrides.ledger_entry_id = ledger_entries.id
        WHERE ledger_entries.profile = @profile
          AND ledger_entries.id <> @id
          AND ledger_entries.account_id <> @accountId
          AND ledger_entries.currency_code = @currencyCode
          AND ledger_entries.amount = @oppositeAmount
          AND ledger_entries.amount <> 0
          AND ledger_entries.hold = 0
          AND ledger_entries.time BETWEEN @from AND @to
          AND COALESCE(ledger_entry_manual_overrides.has_category_override, 0) = 0
        ORDER BY ABS(ledger_entries.time - @time), ledger_entries.id
        LIMIT 1
      `,
    );
    const updateTransferCategory = this.#database.prepare(
      `
        UPDATE ledger_entries
        SET
          category_id = @categoryId,
          category_name = @categoryName,
          category_source = @categorySource,
          category_rule_id = @categoryRuleId,
          category_rule_version = @categoryRuleVersion,
          updated_at = @updatedAt
        WHERE profile = @profile
          AND id = @id
          AND category_id IS NOT @categoryId
          AND NOT EXISTS (
            SELECT 1
            FROM ledger_entry_manual_overrides
            WHERE ledger_entry_manual_overrides.profile = ledger_entries.profile
              AND ledger_entry_manual_overrides.ledger_entry_id = ledger_entries.id
              AND ledger_entry_manual_overrides.has_category_override = 1
          )
      `,
    );
    const pairedIds = new Set<string>();
    let updated = 0;

    const markTransfer = (row: InternalTransferCandidateRow): void => {
      if (
        row.category_id === internalTransferCategoryId ||
        row.has_category_override === 1
      ) {
        return;
      }

      const result = updateTransferCategory.run({
        profile: this.profile,
        id: row.id,
        categoryId: internalTransferCategoryId,
        categoryName: internalTransferCategoryName,
        categorySource: "system_rule",
        categoryRuleId: internalTransferRuleId,
        categoryRuleVersion: updatedAt,
        updatedAt,
      });

      updated += result.changes;
    };

    for (const id of normalizedIds) {
      if (pairedIds.has(id)) {
        continue;
      }

      const row = selectEntry.get(this.profile, id) as
        | InternalTransferCandidateRow
        | undefined;

      if (
        row === undefined ||
        row.amount === 0 ||
        row.hold === 1 ||
        row.has_category_override === 1
      ) {
        continue;
      }

      const counterpart = selectCounterpart.get({
        profile: this.profile,
        id: row.id,
        accountId: row.account_id,
        currencyCode: row.currency_code,
        oppositeAmount: -row.amount,
        from: row.time - internalTransferWindowSeconds,
        to: row.time + internalTransferWindowSeconds,
        time: row.time,
      }) as InternalTransferCandidateRow | undefined;

      if (counterpart === undefined) {
        continue;
      }

      markTransfer(row);
      markTransfer(counterpart);
      pairedIds.add(row.id);
      pairedIds.add(counterpart.id);
    }

    return {
      inserted: 0,
      updated,
      skipped: 0,
    };
  }

  async listAccounts(
    profile = this.profile,
  ): Promise<readonly LedgerAccount[]> {
    const settings = await this.getLocalAppSettings(profile);
    const excludedAccountIds = new Set(settings?.excludedAccountIds ?? []);
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

    return rows.map((row) => {
      const account = mapAccountRow(row);
      account.includedInReports = !excludedAccountIds.has(account.id);
      return account;
    });
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

  async listCategorySpending(
    profile = this.profile,
  ): Promise<readonly LedgerCategorySpending[]> {
    const settings = await this.getLocalAppSettings(profile);
    const exclusions = accountExclusionClause(settings?.excludedAccountIds);
    const rows = this.#database
      .prepare(
        `
          SELECT
            COALESCE(category_id, 'uncategorized') AS category_id,
            COALESCE(NULLIF(category_name, ''), 'Uncategorized') AS category_name,
            currency_code,
            SUM(-amount) AS amount,
            COUNT(*) AS transaction_count
          FROM ledger_entries
          WHERE profile = @profile
            AND amount < 0
            ${exclusions.sql}
          GROUP BY
            COALESCE(category_id, 'uncategorized'),
            COALESCE(NULLIF(category_name, ''), 'Uncategorized'),
            currency_code
          ORDER BY amount DESC, category_name, currency_code
        `,
      )
      .all({ profile, ...exclusions.params }) as SqliteCategorySpendingRow[];

    return rows.map(mapCategorySpendingRow);
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

  async upsertCategoryRule(
    profile: string,
    rule: CategoryRule,
  ): Promise<CategoryRule> {
    const normalizedProfile = profile.trim() || this.profile;
    const timestamp = rule.updatedAt ?? rule.createdAt;

    this.ensureProfileName(normalizedProfile);
    this.#database
      .prepare(
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
      )
      .run({
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
        updatedAt: timestamp,
      });

    const row = this.#database
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
          WHERE profile = ? AND id = ?
        `,
      )
      .get(normalizedProfile, rule.id) as SqliteCategoryRuleRow | undefined;

    if (!row) {
      throw new Error("Category rule could not be saved.");
    }

    return mapCategoryRuleRow(row);
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

  async listMerchantCleanupRules(
    profile = this.profile,
  ): Promise<readonly MerchantCleanupRule[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            id,
            name,
            priority,
            merchant_contains,
            canonical_name,
            is_system,
            is_enabled,
            created_at,
            updated_at
          FROM merchant_cleanup_rules
          WHERE profile = ?
          ORDER BY priority, id
        `,
      )
      .all(profile) as SqliteMerchantCleanupRuleRow[];

    return rows.map(mapMerchantCleanupRuleRow);
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

  async deleteMonthlyCategoryBudget(
    profile: string,
    budgetPeriodId: string,
  ): Promise<boolean> {
    const normalizedProfile = profile.trim() || this.profile;
    const normalizedPeriodId = budgetPeriodId.trim();

    const getBudgetId = this.#database.prepare(
      `
        SELECT budget_id
        FROM budget_periods
        WHERE profile = ? AND id = ?
      `,
    );
    const deleteBudgetPeriod = this.#database.prepare(
      `
        DELETE FROM budget_periods
        WHERE profile = ? AND id = ?
      `,
    );
    const countBudgetPeriods = this.#database.prepare(
      `
        SELECT COUNT(1) AS count
        FROM budget_periods
        WHERE profile = ? AND budget_id = ?
      `,
    );
    const deleteBudget = this.#database.prepare(
      `
        DELETE FROM budgets
        WHERE profile = ? AND id = ?
      `,
    );

    return this.#database.transaction(() => {
      const budgetRow = getBudgetId.get(
        normalizedProfile,
        normalizedPeriodId,
      ) as { budget_id: string } | undefined;

      if (!budgetRow || !budgetRow.budget_id) {
        return false;
      }

      deleteBudgetPeriod.run(normalizedProfile, normalizedPeriodId);

      const remaining = countBudgetPeriods.get(
        normalizedProfile,
        budgetRow.budget_id,
      ) as { count: number } | undefined;

      if (!remaining || remaining.count === 0) {
        deleteBudget.run(normalizedProfile, budgetRow.budget_id);
      }

      return true;
    })();
  }

  async updateMonthlyBudgetPeriodStatus(
    profile: string,
    budgetPeriodId: string,
    status: BudgetPeriod["status"],
    actualAmount?: number,
  ): Promise<BudgetPeriod | undefined> {
    const normalizedProfile = profile.trim() || this.profile;
    const normalizedPeriodId = budgetPeriodId.trim();
    const timestamp = new Date().toISOString();
    const update = this.#database.prepare(
      `
        UPDATE budget_periods
        SET status = ?, actual_amount = ?, updated_at = ?
        WHERE profile = ? AND id = ?
      `,
    );
    const select = this.#database.prepare(
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
        WHERE profile = ? AND id = ?
      `,
    );

    return this.#database.transaction(() => {
      const result = update.run(
        status,
        actualAmount ?? null,
        timestamp,
        normalizedProfile,
        normalizedPeriodId,
      );

      if (result.changes === 0) {
        return undefined;
      }

      const row = select.get(normalizedProfile, normalizedPeriodId) as
        | SqliteBudgetPeriodRow
        | undefined;

      return row === undefined ? undefined : mapBudgetPeriodRow(row);
    })();
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

  async upsertRecurringItem(
    profile: string,
    item: RecurringItem,
  ): Promise<RecurringItem> {
    const normalizedProfile = profile.trim() || this.profile;
    const itemId = item.id.trim();

    if (!itemId) {
      throw new Error("Recurring item ID is required.");
    }

    const timestamp = item.updatedAt || nowIso();
    const insert = this.#database.prepare(
      `
        INSERT INTO recurring_items (
          profile,
          id,
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
        )
        VALUES (
          @profile,
          @id,
          @accountId,
          @categoryId,
          @merchantName,
          @frequency,
          @expectedAmountMin,
          @expectedAmountMax,
          @isActive,
          @startedAt,
          @lastSeenAt,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(profile, id) DO UPDATE SET
          account_id = excluded.account_id,
          category_id = excluded.category_id,
          merchant_name = excluded.merchant_name,
          frequency = excluded.frequency,
          expected_amount_min = excluded.expected_amount_min,
          expected_amount_max = excluded.expected_amount_max,
          is_active = excluded.is_active,
          started_at = excluded.started_at,
          last_seen_at = excluded.last_seen_at,
          updated_at = excluded.updated_at
      `,
    );
    const select = this.#database.prepare(
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
        WHERE profile = ? AND id = ?
      `,
    );

    return this.#database.transaction(() => {
      this.ensureProfileName(normalizedProfile);
      insert.run({
        profile: normalizedProfile,
        id: itemId,
        accountId: item.accountId,
        categoryId: item.categoryId ?? null,
        merchantName: item.merchantName ?? null,
        frequency: item.frequency,
        expectedAmountMin: item.expectedAmountMin ?? null,
        expectedAmountMax: item.expectedAmountMax ?? null,
        isActive: item.isActive ? 1 : 0,
        startedAt: item.startedAt ?? null,
        lastSeenAt: item.lastSeenAt ?? null,
        createdAt: item.createdAt || timestamp,
        updatedAt: timestamp,
      });

      const row = select.get(normalizedProfile, itemId) as
        | SqliteRecurringItemRow
        | undefined;

      if (row === undefined) {
        throw new Error("Recurring item could not be saved.");
      }

      return mapRecurringItemRow(row);
    })();
  }

  async listRecurringDetectionDecisions(
    profile = this.profile,
  ): Promise<readonly RecurringDetectionDecision[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            profile,
            candidate_id,
            action,
            created_at,
            updated_at
          FROM recurring_detection_decisions
          WHERE profile = ?
          ORDER BY updated_at DESC, candidate_id
        `,
      )
      .all(profile) as SqliteRecurringDetectionDecisionRow[];

    return rows.map(mapRecurringDetectionDecisionRow);
  }

  async recordRecurringDetectionDecision(
    profile: string,
    candidateId: string,
    action: RecurringDetectionDecisionAction,
    decidedAt = nowIso(),
  ): Promise<RecurringDetectionDecision> {
    const normalizedProfile = profile.trim() || this.profile;
    const normalizedCandidateId = candidateId.trim();

    if (!normalizedCandidateId) {
      throw new Error("Recurring detection candidate ID is required.");
    }

    if (action !== "confirmed" && action !== "ignored") {
      throw new Error("Recurring detection decision action is invalid.");
    }

    const upsert = this.#database.prepare(
      `
        INSERT INTO recurring_detection_decisions (
          profile,
          candidate_id,
          action,
          created_at,
          updated_at
        )
        VALUES (
          @profile,
          @candidateId,
          @action,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(profile, candidate_id) DO UPDATE SET
          action = excluded.action,
          updated_at = excluded.updated_at
      `,
    );
    const select = this.#database.prepare(
      `
        SELECT
          profile,
          candidate_id,
          action,
          created_at,
          updated_at
        FROM recurring_detection_decisions
        WHERE profile = ? AND candidate_id = ?
      `,
    );

    return this.#database.transaction(() => {
      this.ensureProfileName(normalizedProfile);
      upsert.run({
        profile: normalizedProfile,
        candidateId: normalizedCandidateId,
        action,
        createdAt: decidedAt,
        updatedAt: decidedAt,
      });

      const row = select.get(normalizedProfile, normalizedCandidateId) as
        | SqliteRecurringDetectionDecisionRow
        | undefined;

      if (row === undefined) {
        throw new Error("Recurring detection decision could not be saved.");
      }

      return mapRecurringDetectionDecisionRow(row);
    })();
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

  async getRawStatementItemForEntry(
    profile: string,
    entryId: string,
  ): Promise<SqliteRawStatementItemLookup> {
    const lookup = this.#database
      .prepare(
        `SELECT raw_statement_item_id, account_id
         FROM ledger_entries
         WHERE profile = ? AND id = ?`,
      )
      .get(profile, entryId) as
      | { raw_statement_item_id: string | null; account_id: string }
      | undefined;

    if (lookup === undefined) {
      return { available: false, reason: "entry_not_found" };
    }

    if (
      lookup.raw_statement_item_id === null ||
      lookup.raw_statement_item_id === undefined ||
      lookup.raw_statement_item_id === ""
    ) {
      return { available: false, reason: "no_raw_id" };
    }

    const row = this.#database
      .prepare(
        `SELECT payload_json, updated_at
         FROM raw_statement_items
         WHERE profile = ? AND account_id = ? AND statement_item_id = ?`,
      )
      .get(profile, lookup.account_id, lookup.raw_statement_item_id) as
      | SqliteRawStatementItemRow
      | undefined;

    if (row === undefined) {
      return { available: false, reason: "pruned" };
    }

    return {
      available: true,
      payload: {
        payload_json: row.payload_json,
        updated_at: row.updated_at,
      },
    };
  }

  async listLedgerEntries(query: LedgerEntryQuery): Promise<LedgerEntryPage> {
    const limit = normalizeLimit(query.limit);
    const offset = normalizeOffset(query.offset);
    const settings =
      query.excludedAccountIds === undefined
        ? await this.getLocalAppSettings(query.profile)
        : undefined;
    const resolvedQuery: LedgerEntryQuery = {
      ...(settings?.excludedAccountIds === undefined
        ? {}
        : { excludedAccountIds: settings.excludedAccountIds }),
      ...query,
    };
    const where = buildLedgerEntryWhereClause(resolvedQuery);
    const orderBy = buildLedgerEntryOrderByClause(resolvedQuery);
    const totalRow = this.#database
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM ledger_entries
          LEFT JOIN ledger_entry_review_states
            ON ledger_entry_review_states.profile = ledger_entries.profile
            AND ledger_entry_review_states.ledger_entry_id = ledger_entries.id
          WHERE ${where.sql}
        `,
      )
      .get(where.params) as { total: number };
    const rows = this.#database
      .prepare(
        `
          SELECT
            ledger_entries.id,
            ledger_entries.account_id,
            ledger_entries.time,
            ledger_entries.description,
            ledger_entries.amount,
            ledger_entries.operation_amount,
            ledger_entries.currency_code,
            ledger_entries.category_id,
            ledger_entries.category_name,
            ledger_entries.category_source,
            ledger_entries.category_rule_id,
            ledger_entries.category_rule_version,
            ledger_entries.merchant_name,
            ledger_entries.raw_statement_item_id,
            ledger_entries.hold,
            ledger_entries.balance,
            ledger_entries.note,
            ledger_entries.tags_json,
            ledger_entries.split_plan_json,
            ledger_entry_review_states.state AS review_state,
            ledger_entry_review_states.reviewed_at,
            ledger_entry_review_states.reviewed_source,
            ledger_entries.created_at,
            ledger_entries.updated_at
          FROM ledger_entries
          LEFT JOIN ledger_entry_review_states
            ON ledger_entry_review_states.profile = ledger_entries.profile
            AND ledger_entry_review_states.ledger_entry_id = ledger_entries.id
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

    if (annotation.note === undefined && annotation.tagsJson === undefined) {
      const existingRow = this.selectLedgerEntryRow(profile, id);

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

    const row = this.selectLedgerEntryRow(profile, id);

    if (row && annotation.tagsJson !== undefined) {
      this.upsertTagsFromLedgerEntry(profile, row, nowIso());
    }

    return row ? mapLedgerEntryRow(row) : undefined;
  }

  async updateLedgerEntriesBulkEdit(
    profile: string,
    ids: readonly string[],
    update: LedgerEntryBulkEditUpdate,
  ): Promise<readonly LedgerEntry[]> {
    const normalizedIds = [
      ...new Set(ids.map((id) => id.trim()).filter(Boolean)),
    ];
    const normalizedUpdate = normalizeLedgerEntryBulkEdit(update);
    const timestamp = nowIso();
    const categoryName =
      normalizedUpdate.categoryId === undefined ||
      normalizedUpdate.categoryId === null
        ? normalizedUpdate.categoryId
        : ((
            this.#database
              .prepare(
                `
                  SELECT name
                  FROM categories
                  WHERE profile = ? AND id = ?
                `,
              )
              .get(profile, normalizedUpdate.categoryId) as
              | { name: string }
              | undefined
          )?.name ?? normalizedUpdate.categoryId);
    const setClauses: string[] = [];

    if (normalizedUpdate.categoryId !== undefined) {
      setClauses.push("category_id = @categoryId");
      setClauses.push("category_name = @categoryName");
      setClauses.push("category_source = @categorySource");
      setClauses.push("category_rule_id = NULL");
      setClauses.push("category_rule_version = NULL");
    }

    if (normalizedUpdate.merchantName !== undefined) {
      setClauses.push("merchant_name = @merchantName");
    }

    if (normalizedUpdate.tagsJson !== undefined) {
      setClauses.push("tags_json = @tagsJson");
    }

    const hasReviewUpdate = normalizedUpdate.reviewState !== undefined;

    if (normalizedIds.length === 0) {
      return [];
    }

    if (setClauses.length === 0 && !hasReviewUpdate) {
      return normalizedIds
        .map((id) => this.selectLedgerEntryRow(profile, id))
        .filter((row): row is SqliteLedgerEntryRow => row !== undefined)
        .map(mapLedgerEntryRow);
    }

    const updateEntry =
      setClauses.length === 0
        ? undefined
        : this.#database.prepare(
            `
              UPDATE ledger_entries
              SET
                ${setClauses.join(",\n                ")},
                updated_at = @updatedAt
              WHERE profile = @profile AND id = @id
            `,
          );
    const upsertManualOverride = this.#database.prepare(
      `
        INSERT INTO ledger_entry_manual_overrides (
          profile,
          ledger_entry_id,
          has_category_override,
          has_merchant_override,
          updated_at
        )
        VALUES (
          @profile,
          @id,
          @hasCategoryOverride,
          @hasMerchantOverride,
          @updatedAt
        )
        ON CONFLICT(profile, ledger_entry_id) DO UPDATE SET
          has_category_override = CASE
            WHEN excluded.has_category_override = 1 THEN 1
            ELSE ledger_entry_manual_overrides.has_category_override
          END,
          has_merchant_override = CASE
            WHEN excluded.has_merchant_override = 1 THEN 1
            ELSE ledger_entry_manual_overrides.has_merchant_override
          END,
          updated_at = excluded.updated_at
      `,
    );
    const upsertReviewState = this.#database.prepare(
      `
        INSERT INTO ledger_entry_review_states (
          profile,
          ledger_entry_id,
          state,
          reviewed_at,
          reviewed_source,
          created_at,
          updated_at
        )
        VALUES (
          @profile,
          @id,
          @state,
          @reviewedAt,
          @reviewedSource,
          @updatedAt,
          @updatedAt
        )
        ON CONFLICT(profile, ledger_entry_id) DO UPDATE SET
          state = excluded.state,
          reviewed_at = excluded.reviewed_at,
          reviewed_source = excluded.reviewed_source,
          updated_at = excluded.updated_at
      `,
    );

    const applyBulkEdit = () => {
      const updatedRows: SqliteLedgerEntryRow[] = [];

      for (const id of normalizedIds) {
        const existingRow = this.selectLedgerEntryRow(profile, id);

        if (existingRow === undefined) {
          continue;
        }

        if (updateEntry !== undefined) {
          updateEntry.run({
            profile,
            id,
            categoryId: normalizedUpdate.categoryId ?? null,
            categoryName: categoryName ?? null,
            categorySource:
              normalizedUpdate.categoryId === undefined ? null : "manual",
            merchantName: normalizedUpdate.merchantName ?? null,
            tagsJson: normalizedUpdate.tagsJson ?? null,
            updatedAt: timestamp,
          });

          if (
            normalizedUpdate.categoryId !== undefined ||
            normalizedUpdate.merchantName !== undefined
          ) {
            upsertManualOverride.run({
              profile,
              id,
              hasCategoryOverride:
                normalizedUpdate.categoryId === undefined ? 0 : 1,
              hasMerchantOverride:
                normalizedUpdate.merchantName === undefined ? 0 : 1,
              updatedAt: timestamp,
            });
          }
        }

        if (normalizedUpdate.reviewState !== undefined) {
          const decisionAt =
            normalizedUpdate.reviewState === "needs_review" ? null : timestamp;

          upsertReviewState.run({
            profile,
            id,
            state: normalizedUpdate.reviewState,
            reviewedAt: decisionAt,
            reviewedSource:
              decisionAt === null
                ? null
                : (normalizedUpdate.reviewedSource ?? "manual"),
            updatedAt: timestamp,
          });
        }

        const row = this.selectLedgerEntryRow(profile, id);

        if (row) {
          if (normalizedUpdate.tagsJson !== undefined) {
            this.upsertTagsFromLedgerEntry(profile, row, timestamp);
          }

          if (normalizedUpdate.merchantName !== undefined) {
            this.upsertMerchantFromLedgerEntryRow(profile, row, timestamp);
          }

          updatedRows.push(row);
        }
      }

      return updatedRows.map(mapLedgerEntryRow);
    };

    return this.#database.inTransaction
      ? applyBulkEdit()
      : this.#database.transaction(applyBulkEdit)();
  }

  async restoreLedgerEntryCategories(
    profile: string,
    entries: readonly LedgerEntryCategoryRestoreEntry[],
  ): Promise<readonly LedgerEntry[]> {
    const normalizedEntries =
      normalizeLedgerEntryCategoryRestoreEntries(entries);

    if (normalizedEntries.length === 0) {
      return [];
    }

    const timestamp = nowIso();
    const updateEntry = this.#database.prepare(
      `
        UPDATE ledger_entries
        SET
          category_id = @categoryId,
          category_name = @categoryName,
          category_source = @categorySource,
          category_rule_id = @categoryRuleId,
          category_rule_version = @categoryRuleVersion,
          updated_at = @updatedAt
        WHERE profile = @profile AND id = @id
      `,
    );
    const updateManualOverride = this.#database.prepare(
      `
        UPDATE ledger_entry_manual_overrides
        SET
          has_category_override = @hasCategoryOverride,
          updated_at = @updatedAt
        WHERE profile = @profile AND ledger_entry_id = @id
      `,
    );
    const insertManualOverride = this.#database.prepare(
      `
        INSERT OR IGNORE INTO ledger_entry_manual_overrides (
          profile,
          ledger_entry_id,
          has_category_override,
          has_merchant_override,
          updated_at
        )
        VALUES (
          @profile,
          @id,
          @hasCategoryOverride,
          0,
          @updatedAt
        )
      `,
    );
    const restore = () => {
      const updatedRows: SqliteLedgerEntryRow[] = [];

      for (const entry of normalizedEntries) {
        const hasCategoryOverride = entry.categorySource === "manual" ? 1 : 0;

        const updateResult = updateEntry.run({
          profile,
          id: entry.id,
          categoryId: entry.categoryId ?? null,
          categoryName: entry.categoryName ?? null,
          categorySource: entry.categorySource ?? null,
          categoryRuleId: entry.categoryRuleId ?? null,
          categoryRuleVersion: entry.categoryRuleVersion ?? null,
          updatedAt: timestamp,
        });

        if (updateResult.changes === 0) {
          continue;
        }

        const manualOverrideResult = updateManualOverride.run({
          profile,
          id: entry.id,
          hasCategoryOverride,
          updatedAt: timestamp,
        });

        if (manualOverrideResult.changes === 0 && hasCategoryOverride === 1) {
          insertManualOverride.run({
            profile,
            id: entry.id,
            hasCategoryOverride,
            updatedAt: timestamp,
          });
        }

        const row = this.selectLedgerEntryRow(profile, entry.id);

        if (row) {
          updatedRows.push(row);
        }
      }

      return updatedRows.map(mapLedgerEntryRow);
    };

    return this.#database.inTransaction
      ? restore()
      : this.#database.transaction(restore)();
  }

  async updateLedgerEntrySplitPlan(
    profile: string,
    id: string,
    update: LedgerEntrySplitPlanUpdate,
  ): Promise<LedgerEntry | undefined> {
    const splitPlan = normalizeLedgerEntrySplitPlan(update);

    if (splitPlan.splitPlanJson === undefined) {
      const existingRow = this.selectLedgerEntryRow(profile, id);

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

    const row = this.selectLedgerEntryRow(profile, id);

    return row ? mapLedgerEntryRow(row) : undefined;
  }

  async getLedgerSummary(profile = this.profile): Promise<LedgerSummary> {
    const settings = await this.getLocalAppSettings(profile);
    const exclusions = accountExclusionClause(settings?.excludedAccountIds);
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
            ${exclusions.sql}
        `,
      )
      .get({ profile, ...exclusions.params }) as SqliteSummaryRow;
    const currencies = JSON.parse(row.currencies_json) as unknown;
    const latestEntryTimeRow = this.#database
      .prepare(
        `
          SELECT MAX(time) AS latest_entry_time
          FROM ledger_entries
          WHERE profile = @profile
            ${exclusions.sql}
        `,
      )
      .get({ profile, ...exclusions.params }) as SqliteLatestEntryTimeRow;
    const anchorTime =
      latestEntryTimeRow.latest_entry_time ?? Math.floor(Date.now() / 1000);
    const anchorDate = new Date(anchorTime * 1000);
    const monthStart = localMonthStartEpoch(anchorDate);
    const monthToDateRow = this.#database
      .prepare(
        `
          SELECT
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS income,
            SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS expenses,
            SUM(amount) AS net
          FROM ledger_entries
          WHERE profile = @profile
            AND time >= @monthStart
            AND time <= @anchorTime
            ${exclusions.sql}
        `,
      )
      .get({
        profile,
        monthStart,
        anchorTime,
        ...exclusions.params,
      }) as SqliteCashflowRow;

    return {
      profile,
      accounts: row.accounts,
      ledgerEntries: row.ledger_entries,
      income: row.income ?? 0,
      expenses: row.expenses ?? 0,
      net: row.net ?? 0,
      monthToDate: {
        month: localMonthKey(anchorDate),
        from: localDateKey(new Date(monthStart * 1000)),
        to: localDateKey(anchorDate),
        income: monthToDateRow.income ?? 0,
        expenses: monthToDateRow.expenses ?? 0,
        net: monthToDateRow.net ?? 0,
      },
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
            error_message,
            api_calls, windows_fetched, items_seen, items_inserted, items_updated, items_skipped, rate_limited,
            details_json
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

  async recordLocalExport(
    record: LocalExportRecord,
  ): Promise<LocalExportRecord> {
    this.ensureProfileName(record.profile);

    this.#database
      .prepare(
        `
          INSERT INTO local_exports (
            id,
            profile,
            format,
            preset,
            filters_json,
            row_count,
            destination,
            file_path,
            status,
            created_at,
            completed_at,
            error_message
          )
          VALUES (
            @id,
            @profile,
            @format,
            @preset,
            @filtersJson,
            @rowCount,
            @destination,
            @filePath,
            @status,
            @createdAt,
            @completedAt,
            @errorMessage
          )
          ON CONFLICT(profile, id) DO UPDATE SET
            format = excluded.format,
            preset = excluded.preset,
            filters_json = excluded.filters_json,
            row_count = excluded.row_count,
            destination = excluded.destination,
            file_path = excluded.file_path,
            status = excluded.status,
            completed_at = excluded.completed_at,
            error_message = excluded.error_message
        `,
      )
      .run({
        id: record.id,
        profile: record.profile,
        format: record.format,
        preset: record.preset ?? null,
        filtersJson: stableStringify(record.filters),
        rowCount: record.rowCount,
        destination: record.destination,
        filePath: record.filePath ?? null,
        status: record.status,
        createdAt: record.createdAt,
        completedAt: record.completedAt ?? null,
        errorMessage: record.errorMessage ?? null,
      });

    return record;
  }

  async listLocalExports(
    profile = this.profile,
    limit = 20,
  ): Promise<readonly LocalExportRecord[]> {
    const rows = this.#database
      .prepare(
        `
          SELECT
            id,
            profile,
            format,
            preset,
            filters_json,
            row_count,
            destination,
            file_path,
            status,
            created_at,
            completed_at,
            error_message
          FROM local_exports
          WHERE profile = ?
          ORDER BY created_at DESC
          LIMIT ?
        `,
      )
      .all(profile, normalizeLimit(limit)) as SqliteLocalExportRow[];

    return rows.map(mapLocalExportRow);
  }

  async pruneRawStatementItems(
    profile: string,
    beforeTime: number,
  ): Promise<number> {
    if (!Number.isFinite(beforeTime) || beforeTime <= 0) {
      return 0;
    }

    const normalizedProfile = profile.trim() || this.profile;
    this.ensureProfileName(normalizedProfile);

    return this.#database
      .prepare(
        `
          DELETE FROM raw_statement_items
          WHERE profile = ?
            AND time < ?
        `,
      )
      .run(normalizedProfile, Math.trunc(beforeTime)).changes;
  }

  async clearProfileLedgerData(
    profile: string,
  ): Promise<Record<string, number>> {
    const normalizedProfile = profile.trim() || this.profile;
    this.ensureProfileName(normalizedProfile);
    const tables = [
      "ledger_entry_review_states",
      "ledger_entry_manual_overrides",
      "recurring_detection_decisions",
      "recurring_items",
      "raw_statement_items",
      "ledger_entries",
      "sync_cursors",
      "sync_runs",
      "webhook_events",
      "merchants",
      "tags",
      "currency_rates",
      "jars",
      "accounts",
    ] as const;
    const deleteStatements = tables.map((table) => {
      return [
        table,
        this.#database.prepare(`DELETE FROM ${table} WHERE profile = ?`),
      ] as const;
    });
    const clear = () => {
      const deleted: Record<string, number> = {};

      for (const [table, statement] of deleteStatements) {
        deleted[table] = statement.run(normalizedProfile).changes;
      }

      return deleted;
    };

    return this.#database.inTransaction
      ? clear()
      : this.#database.transaction(clear)();
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

  async checkpoint(): Promise<void> {
    this.#database.pragma("wal_checkpoint(TRUNCATE)");
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

  private seedDefaultCategories(profile = this.profile): void {
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
          profile,
          id: category.id,
          name: category.name,
          color: category.color ?? null,
          description: category.description ?? "",
          timestamp,
        });
      }
    })();
  }

  private seedDefaultCategoryRules(profile = this.profile): void {
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
          profile,
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

  private seedDefaultMerchantCleanupRules(profile = this.profile): void {
    const seed = this.#database
      .prepare(
        `
          SELECT 1
          FROM sqlite_master
          WHERE type = 'table' AND name = 'merchant_cleanup_rules'
          LIMIT 1
        `,
      )
      .get();

    if (!seed) {
      return;
    }

    const insertRule = this.#database.prepare(
      `
        INSERT INTO merchant_cleanup_rules (
          profile,
          id,
          name,
          priority,
          merchant_contains,
          canonical_name,
          is_system,
          is_enabled,
          created_at,
          updated_at
        )
        VALUES (
          @profile,
          @id,
          @name,
          @priority,
          @merchantContains,
          @canonicalName,
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
      for (const rule of seededMerchantCleanupRules) {
        insertRule.run({
          profile,
          id: rule.id,
          name: rule.name,
          priority: rule.priority,
          merchantContains: rule.merchantContains,
          canonicalName: rule.canonicalName,
          timestamp,
        });
      }
    })();
  }

  private seedDefaultConfigurationForExistingProfiles(): void {
    const rows = this.#database
      .prepare(
        `
          SELECT name
          FROM profiles
        `,
      )
      .all() as { name: string }[];

    for (const row of rows) {
      this.seedDefaultCategories(row.name);
      this.seedDefaultCategoryRules(row.name);
      this.seedDefaultMerchantCleanupRules(row.name);
    }
  }

  private backfillLegacyManualOverrideMarkers({
    compareCleanedMerchants,
  }: {
    compareCleanedMerchants: boolean;
  }): void {
    const tableExists = this.#database
      .prepare(
        `
          SELECT 1
          FROM sqlite_master
          WHERE type = 'table' AND name = 'ledger_entry_manual_overrides'
          LIMIT 1
        `,
      )
      .get();

    if (!tableExists) {
      return;
    }

    const rows = this.#database
      .prepare(
        `
          SELECT
            ledger_entries.profile,
            ledger_entries.id,
            ledger_entries.account_id,
            ledger_entries.time,
            ledger_entries.description,
            ledger_entries.amount,
            ledger_entries.operation_amount,
            ledger_entries.currency_code,
            ledger_entries.category_id,
            ledger_entries.category_name,
            ledger_entries.category_source,
            ledger_entries.category_rule_id,
            ledger_entries.category_rule_version,
            ledger_entries.merchant_name,
            ledger_entries.raw_statement_item_id,
            ledger_entries.hold,
            ledger_entries.balance,
            ledger_entries.note,
            ledger_entries.tags_json,
            ledger_entries.split_plan_json,
            ledger_entries.created_at,
            ledger_entries.updated_at,
            raw_statement_items.payload_json
          FROM ledger_entries
          INNER JOIN raw_statement_items
            ON raw_statement_items.profile = ledger_entries.profile
            AND raw_statement_items.account_id = ledger_entries.account_id
            AND raw_statement_items.statement_item_id = ledger_entries.raw_statement_item_id
          LEFT JOIN ledger_entry_manual_overrides
            ON ledger_entry_manual_overrides.profile = ledger_entries.profile
            AND ledger_entry_manual_overrides.ledger_entry_id = ledger_entries.id
          WHERE ledger_entry_manual_overrides.ledger_entry_id IS NULL
        `,
      )
      .all() as (SqliteLedgerEntryRow & {
      profile: string;
      payload_json: string;
    })[];

    if (rows.length === 0) {
      return;
    }

    const upsertManualOverride = this.#database.prepare(
      `
        INSERT INTO ledger_entry_manual_overrides (
          profile,
          ledger_entry_id,
          has_category_override,
          has_merchant_override,
          updated_at
        )
        VALUES (
          @profile,
          @id,
          @hasCategoryOverride,
          @hasMerchantOverride,
          @updatedAt
        )
        ON CONFLICT(profile, ledger_entry_id) DO NOTHING
      `,
    );

    for (const row of rows) {
      const statementItem = JSON.parse(
        row.payload_json,
      ) as MonobankStatementItem;
      const rawGeneratedEntry = this.ledgerEntryFromStoredRaw(
        row,
        statementItem,
      );
      const generatedCategory = categorizeStatementItem(statementItem);
      const generatedMerchantName = compareCleanedMerchants
        ? this.applyMerchantCleanupRules(
            rawGeneratedEntry.merchantName,
            row.profile,
          )
        : rawGeneratedEntry.merchantName;
      const hasCategoryOverride =
        row.category_id !== generatedCategory.categoryId ||
        row.category_name !== generatedCategory.categoryName;
      const hasMerchantOverride =
        row.merchant_name !== (generatedMerchantName ?? null);

      if (!hasCategoryOverride && !hasMerchantOverride) {
        continue;
      }

      upsertManualOverride.run({
        profile: row.profile,
        id: row.id,
        hasCategoryOverride: hasCategoryOverride ? 1 : 0,
        hasMerchantOverride: hasMerchantOverride ? 1 : 0,
        updatedAt: row.updated_at,
      });
    }
  }

  private backfillManualCategoryOverrideSources(): void {
    this.#database
      .prepare(
        `
          UPDATE ledger_entries
          SET
            category_source = 'manual',
            category_rule_id = NULL,
            category_rule_version = NULL
          WHERE EXISTS (
            SELECT 1
            FROM ledger_entry_manual_overrides
            WHERE ledger_entry_manual_overrides.profile = ledger_entries.profile
              AND ledger_entry_manual_overrides.ledger_entry_id = ledger_entries.id
              AND ledger_entry_manual_overrides.has_category_override = 1
          )
        `,
      )
      .run();
  }

  private ledgerEntryFromStoredRaw(
    row: SqliteLedgerEntryRow,
    item: MonobankStatementItem,
  ): LedgerEntry {
    const entry: LedgerEntry = {
      id: row.id,
      accountId: row.account_id,
      time: item.time,
      description: item.description,
      amount: item.amount,
      currencyCode: item.currencyCode,
      merchantName: item.counterName ?? item.description,
      rawStatementItemId: row.raw_statement_item_id,
      hold: item.hold,
    };

    if (item.operationAmount !== undefined) {
      entry.operationAmount = item.operationAmount;
    }

    if (item.balance !== undefined) {
      entry.balance = item.balance;
    }

    return entry;
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

  private upsertLedgerEntry(
    entry: LedgerEntry,
    statementItem?: MonobankStatementItem,
  ): LedgerWriteStats {
    const normalizedEntry = this.prepareLedgerEntryForWrite(
      entry,
      statementItem,
    );

    return this.upsertPreparedLedgerEntry(normalizedEntry);
  }

  private upsertPreparedLedgerEntry(
    normalizedEntry: LedgerEntry,
  ): LedgerWriteStats {
    const existed = Boolean(
      this.#database
        .prepare("SELECT 1 FROM ledger_entries WHERE profile = ? AND id = ?")
        .get(this.profile, normalizedEntry.id),
    );
    const timestamp = nowIso();

    this.#database
      .prepare(
        `
          INSERT INTO ledger_entries (
            profile, id, account_id, time, description, amount,
            operation_amount, currency_code, category_id, category_name,
            category_source, category_rule_id, category_rule_version,
            merchant_name, raw_statement_item_id, hold, balance,
            created_at, updated_at
          )
          VALUES (
            @profile, @id, @accountId, @time, @description, @amount,
            @operationAmount, @currencyCode, @categoryId, @categoryName,
            @categorySource, @categoryRuleId, @categoryRuleVersion,
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
            category_source = excluded.category_source,
            category_rule_id = excluded.category_rule_id,
            category_rule_version = excluded.category_rule_version,
            merchant_name = excluded.merchant_name,
            raw_statement_item_id = excluded.raw_statement_item_id,
            hold = excluded.hold,
            balance = excluded.balance,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        profile: this.profile,
        id: normalizedEntry.id,
        accountId: normalizedEntry.accountId,
        time: normalizedEntry.time,
        description: normalizedEntry.description,
        amount: normalizedEntry.amount,
        operationAmount: normalizedEntry.operationAmount ?? null,
        currencyCode: normalizedEntry.currencyCode,
        categoryId: normalizedEntry.categoryId ?? null,
        categoryName: normalizedEntry.categoryName ?? null,
        categorySource: normalizedEntry.categorySource ?? null,
        categoryRuleId: normalizedEntry.categoryRuleId ?? null,
        categoryRuleVersion: normalizedEntry.categoryRuleVersion ?? null,
        merchantName: normalizedEntry.merchantName ?? null,
        rawStatementItemId: normalizedEntry.rawStatementItemId,
        hold: normalizedEntry.hold ? 1 : 0,
        balance: normalizedEntry.balance ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

    this.upsertMerchantFromLedgerEntry(normalizedEntry, timestamp);

    return {
      inserted: existed ? 0 : 1,
      updated: existed ? 1 : 0,
      skipped: 0,
    };
  }

  private prepareLedgerEntryForWrite(
    entry: LedgerEntry,
    statementItem?: MonobankStatementItem,
    profile = this.profile,
  ): LedgerEntry {
    const cleanedMerchantName = this.applyMerchantCleanupRules(
      entry.merchantName,
      profile,
    );
    const cleanedEntry =
      cleanedMerchantName === undefined
        ? { ...entry }
        : { ...entry, merchantName: cleanedMerchantName };

    if (statementItem === undefined) {
      return cleanedEntry.categoryId &&
        cleanedEntry.categorySource === undefined
        ? {
            ...cleanedEntry,
            categorySource: "manual",
          }
        : cleanedEntry;
    }

    const entryWithManualMerchant = this.mergeManualLedgerEntryOverrides(
      cleanedEntry,
      { category: false, merchant: true },
      profile,
    );

    return this.mergeManualLedgerEntryOverrides(
      this.applyCategoryRules(entryWithManualMerchant, statementItem, profile),
      { category: true, merchant: false },
      profile,
    );
  }

  private ledgerEntryManualOverrideState(
    id: string,
    profile = this.profile,
  ):
    | {
        hasCategoryOverride: boolean;
        hasMerchantOverride: boolean;
      }
    | undefined {
    const row = this.#database
      .prepare(
        `
          SELECT has_category_override, has_merchant_override
          FROM ledger_entry_manual_overrides
          WHERE profile = ? AND ledger_entry_id = ?
        `,
      )
      .get(profile, id) as
      | {
          has_category_override: number;
          has_merchant_override: number;
        }
      | undefined;

    return row === undefined
      ? undefined
      : {
          hasCategoryOverride: row.has_category_override === 1,
          hasMerchantOverride: row.has_merchant_override === 1,
        };
  }

  private selectLedgerEntryRow(
    profile: string,
    id: string,
  ): SqliteLedgerEntryRow | undefined {
    return this.#database
      .prepare(
        `
          SELECT
            ledger_entries.*,
            ledger_entry_review_states.state AS review_state,
            ledger_entry_review_states.reviewed_at,
            ledger_entry_review_states.reviewed_source
          FROM ledger_entries
          LEFT JOIN ledger_entry_review_states
            ON ledger_entry_review_states.profile = ledger_entries.profile
            AND ledger_entry_review_states.ledger_entry_id = ledger_entries.id
          WHERE ledger_entries.profile = ? AND ledger_entries.id = ?
        `,
      )
      .get(profile, id) as SqliteLedgerEntryRow | undefined;
  }

  private mergeManualLedgerEntryOverrides(
    entry: LedgerEntry,
    fields: { category: boolean; merchant: boolean } = {
      category: true,
      merchant: true,
    },
    profile = this.profile,
  ): LedgerEntry {
    const overrideState = this.ledgerEntryManualOverrideState(
      entry.id,
      profile,
    );

    if (
      overrideState === undefined ||
      ((!fields.category || !overrideState.hasCategoryOverride) &&
        (!fields.merchant || !overrideState.hasMerchantOverride))
    ) {
      return entry;
    }

    const row = this.#database
      .prepare(
        `
          SELECT
            id, account_id, time, description, amount, operation_amount,
            currency_code, category_id, category_name, category_source,
            category_rule_id, category_rule_version, merchant_name,
            raw_statement_item_id, hold, balance, note, tags_json,
            split_plan_json, created_at, updated_at
          FROM ledger_entries
          WHERE profile = ? AND id = ?
        `,
      )
      .get(profile, entry.id) as SqliteLedgerEntryRow | undefined;

    if (row === undefined) {
      return entry;
    }

    const mergedEntry = { ...entry };

    if (fields.category && overrideState.hasCategoryOverride) {
      if (row.category_id === null) {
        delete mergedEntry.categoryId;
      } else {
        mergedEntry.categoryId = row.category_id;
      }

      if (row.category_name === null) {
        delete mergedEntry.categoryName;
      } else {
        mergedEntry.categoryName = row.category_name;
      }

      mergedEntry.categorySource = "manual";
      delete mergedEntry.categoryRuleId;
      delete mergedEntry.categoryRuleVersion;
    }

    if (fields.merchant && overrideState.hasMerchantOverride) {
      if (row.merchant_name === null) {
        delete mergedEntry.merchantName;
      } else {
        mergedEntry.merchantName = row.merchant_name;
      }
    }

    return mergedEntry;
  }

  private ledgerEntryMatchesStoredEntry(entry: LedgerEntry): boolean {
    const row = this.#database
      .prepare(
        `
          SELECT
            id, account_id, time, description, amount, operation_amount,
            currency_code, category_id, category_name, category_source,
            category_rule_id, category_rule_version, merchant_name,
            raw_statement_item_id, hold, balance, note, tags_json,
            split_plan_json, created_at, updated_at
          FROM ledger_entries
          WHERE profile = ? AND id = ?
        `,
      )
      .get(this.profile, entry.id) as SqliteLedgerEntryRow | undefined;

    return (
      row !== undefined &&
      row.account_id === entry.accountId &&
      row.time === entry.time &&
      row.description === entry.description &&
      row.amount === entry.amount &&
      row.operation_amount === (entry.operationAmount ?? null) &&
      row.currency_code === entry.currencyCode &&
      row.category_id === (entry.categoryId ?? null) &&
      row.category_name === (entry.categoryName ?? null) &&
      (row.category_source ?? null) === (entry.categorySource ?? null) &&
      (row.category_rule_id ?? null) === (entry.categoryRuleId ?? null) &&
      (row.category_rule_version ?? null) ===
        (entry.categoryRuleVersion ?? null) &&
      row.merchant_name === (entry.merchantName ?? null) &&
      row.raw_statement_item_id === entry.rawStatementItemId &&
      row.hold === (entry.hold ? 1 : 0) &&
      row.balance === (entry.balance ?? null)
    );
  }

  private upsertMerchantFromLedgerEntry(
    entry: LedgerEntry,
    timestamp: string,
  ): void {
    this.upsertMerchantName(
      this.profile,
      entry.merchantName,
      entry.time,
      timestamp,
    );
  }

  private applyCategoryRules(
    entry: LedgerEntry,
    statementItem?: MonobankStatementItem,
    profile = this.profile,
  ): LedgerEntry {
    const rows = this.#database
      .prepare(
        `
          SELECT
            category_rules.id,
            category_rules.category_id,
            categories.name AS category_name,
            category_rules.name,
            category_rules.priority,
            category_rules.match_type,
            category_rules.merchant_contains,
            category_rules.description_contains,
            category_rules.mcc,
            category_rules.amount_direction,
            category_rules.is_system,
            category_rules.is_enabled,
            category_rules.created_at,
            category_rules.updated_at
          FROM category_rules
          LEFT JOIN categories
            ON categories.profile = category_rules.profile
           AND categories.id = category_rules.category_id
          WHERE category_rules.profile = ?
            AND category_rules.is_enabled = 1
          ORDER BY category_rules.priority, category_rules.id
        `,
      )
      .all(profile) as SqliteCategoryRuleRow[];

    for (const row of rows) {
      if (!this.categoryRuleMatches(row, entry, statementItem)) {
        continue;
      }

      return {
        ...entry,
        categoryId: row.category_id,
        categoryName: row.category_name ?? row.category_id,
        categorySource: row.is_system === 1 ? "system_rule" : "user_rule",
        categoryRuleId: row.id,
        categoryRuleVersion: row.updated_at,
      };
    }

    return entry;
  }

  private categoryRuleMatches(
    rule: SqliteCategoryRuleRow,
    entry: LedgerEntry,
    statementItem?: MonobankStatementItem,
  ): boolean {
    if (rule.amount_direction === "income" && entry.amount <= 0) {
      return false;
    }

    if (rule.amount_direction === "expense" && entry.amount >= 0) {
      return false;
    }

    if (rule.match_type === "fallback") {
      return true;
    }

    const hasCondition =
      rule.mcc !== null ||
      rule.merchant_contains !== null ||
      rule.description_contains !== null;

    if (!hasCondition) {
      return true;
    }

    return (
      (rule.mcc !== null &&
        statementItem !== undefined &&
        statementItem.mcc === rule.mcc) ||
      (rule.merchant_contains !== null &&
        textMatchesRuleTerm(entry.merchantName, rule.merchant_contains)) ||
      (rule.description_contains !== null &&
        textMatchesRuleTerm(entry.description, rule.description_contains))
    );
  }

  private applyMerchantCleanupRules(
    merchantName: string | undefined,
    profile = this.profile,
  ): string | undefined {
    const name = merchantName?.trim();

    if (!name) {
      return merchantName;
    }

    const normalizedName = normalizeMerchantName(name);
    const rows = this.#database
      .prepare(
        `
          SELECT
            merchant_contains,
            canonical_name
          FROM merchant_cleanup_rules
          WHERE profile = ?
            AND is_enabled = 1
          ORDER BY priority, id
        `,
      )
      .all(profile) as Pick<
      SqliteMerchantCleanupRuleRow,
      "merchant_contains" | "canonical_name"
    >[];

    for (const row of rows) {
      const normalizedNeedle = normalizeMerchantName(row.merchant_contains);

      if (normalizedNeedle && normalizedName.includes(normalizedNeedle)) {
        return row.canonical_name;
      }
    }

    return name;
  }

  private upsertMerchantFromLedgerEntryRow(
    profile: string,
    row: SqliteLedgerEntryRow,
    timestamp: string,
  ): void {
    this.upsertMerchantName(profile, row.merchant_name, row.time, timestamp);
  }

  private upsertMerchantName(
    profile: string,
    merchantName: string | null | undefined,
    lastSeenAt: number,
    timestamp: string,
  ): void {
    const name = merchantName?.trim();

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
        profile,
        id: merchantIdForName(normalizedName),
        name,
        normalizedName,
        firstSeenAt: lastSeenAt,
        lastSeenAt,
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
