import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { parquetWriteBuffer, type ColumnSource } from "hyparquet-writer";
import type BetterSqlite3 from "better-sqlite3";

import type { SqliteLedgerDb } from "../sqlite/index.js";
import type {
  Budget,
  BudgetPeriod,
  Category,
  CategoryRule,
  LedgerEntry,
  LedgerEntryQuery,
  Tag,
} from "../storage/index.js";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as typeof BetterSqlite3;

export type ExportFormat =
  | "csv"
  | "json"
  | "jsonl"
  | "journal-csv"
  | "parquet"
  | "sqlite";
export type ExportPreset =
  | "accountant-handoff"
  | "monthly-personal-finance"
  | "bookkeeping"
  | "budget-analysis"
  | "raw-transaction-archive";

export interface ExportRequest {
  profile: string;
  format?: ExportFormat;
  preset?: ExportPreset;
  from?: number;
  to?: number;
  accountIds?: readonly string[];
  categoryIds?: readonly string[];
  merchantName?: string;
  status?: "hold" | "posted";
  reviewState?: LedgerEntry["reviewState"];
  currencyCode?: number;
  amountMin?: number;
  amountMax?: number;
  tag?: string;
  includeExcludedAccounts?: boolean;
}

export interface LedgerExport {
  fileName: string;
  contentType: string;
  body: string | Uint8Array;
  format: Exclude<ExportFormat, "sqlite">;
  preset?: ExportPreset;
  filters: Record<string, unknown>;
  rowCount: number;
}

export interface SqliteSnapshotExportRequest {
  profile: string;
  databasePath: string;
  redacted?: boolean;
}

export interface SqliteSnapshotExport {
  fileName: string;
  contentType: "application/vnd.sqlite3";
  body: Uint8Array;
  format: "sqlite";
  filters: Record<string, unknown>;
  rowCount: number;
}

export interface LocalConfigurationExportRequest {
  profile: string;
}

export interface LocalConfigurationExportBody {
  profile: string;
  format: "local-configuration";
  schemaVersion: 1;
  categories: readonly Category[];
  categoryRules: readonly CategoryRule[];
  budgets: readonly Budget[];
  budgetPeriods: readonly BudgetPeriod[];
  tags: readonly Tag[];
  totals: {
    categories: number;
    categoryRules: number;
    budgets: number;
    budgetPeriods: number;
    tags: number;
  };
}

export type LocalConfigurationImportBody = Omit<
  LocalConfigurationExportBody,
  "profile" | "format" | "schemaVersion" | "totals"
>;

export const exportPresetDefinitions: Readonly<
  Record<
    ExportPreset,
    {
      label: string;
      format: Exclude<ExportFormat, "sqlite" | "parquet">;
      description: string;
    }
  >
> = {
  "accountant-handoff": {
    label: "Accountant handoff",
    format: "journal-csv",
    description: "Journal-style debit and credit CSV for accountant review.",
  },
  "monthly-personal-finance": {
    label: "Monthly personal finance",
    format: "csv",
    description: "Transaction CSV for a monthly personal finance review.",
  },
  bookkeeping: {
    label: "Bookkeeping",
    format: "journal-csv",
    description: "Journal-style CSV for bookkeeping workflows.",
  },
  "budget-analysis": {
    label: "Budget analysis",
    format: "csv",
    description: "Categorized transaction CSV for budget analysis.",
  },
  "raw-transaction-archive": {
    label: "Raw transaction archive",
    format: "jsonl",
    description: "Line-delimited JSON archive for local storage or diffing.",
  },
};

export const exportPresetNames = Object.keys(
  exportPresetDefinitions,
) as readonly ExportPreset[];

export function isExportFormat(value: string): value is ExportFormat {
  return (
    value === "csv" ||
    value === "json" ||
    value === "jsonl" ||
    value === "journal-csv" ||
    value === "parquet" ||
    value === "sqlite"
  );
}

export function isExportPreset(value: string): value is ExportPreset {
  return value in exportPresetDefinitions;
}

function escapeCsvCell(value: string | number | boolean | undefined): string {
  if (value === undefined) {
    return "";
  }

  const text = String(value);

  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function safeFileSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveExportFormat(
  request: ExportRequest,
): Exclude<ExportFormat, "sqlite"> {
  if (request.format === "sqlite") {
    throw new Error(
      "sqlite export is available by copying the local database file",
    );
  }

  if (request.format) {
    return request.format;
  }

  if (request.preset) {
    return exportPresetDefinitions[request.preset].format;
  }

  return "csv";
}

function fileExtension(format: Exclude<ExportFormat, "sqlite">): string {
  return format === "journal-csv" ? "csv" : format;
}

function createExportFileName(
  request: ExportRequest,
  format: Exclude<ExportFormat, "sqlite">,
): string {
  const parts = [
    "mono-ledger",
    safeFileSegment(request.profile) || "default",
    safeFileSegment(request.preset ?? format),
  ];

  if (request.from !== undefined || request.to !== undefined) {
    parts.push(`${request.from ?? "start"}-${request.to ?? "end"}`);
  }

  if (request.accountIds?.length === 1 && request.accountIds[0]) {
    parts.push(`account-${safeFileSegment(request.accountIds[0])}`);
  }

  if (request.categoryIds?.length === 1 && request.categoryIds[0]) {
    parts.push(`category-${safeFileSegment(request.categoryIds[0])}`);
  }

  if (request.tag?.trim()) {
    parts.push(`tag-${safeFileSegment(request.tag)}`);
  }

  return `${parts.join("-")}.${fileExtension(format)}`;
}

function createLocalConfigurationFileName(
  request: LocalConfigurationExportRequest,
): string {
  return `mono-ledger-${safeFileSegment(request.profile) || "default"}-local-configuration.json`;
}

function createSqliteSnapshotFileName(
  request: SqliteSnapshotExportRequest,
): string {
  const privacySegment = request.redacted === false ? "full" : "redacted";

  return `mono-ledger-${safeFileSegment(request.profile) || "default"}-sqlite-snapshot-${privacySegment}.sqlite`;
}

function createEntryQuery(request: ExportRequest): LedgerEntryQuery {
  const query: LedgerEntryQuery = {
    profile: request.profile,
    limit: 500,
  };

  if (request.from !== undefined) {
    query.from = request.from;
  }

  if (request.to !== undefined) {
    query.to = request.to;
  }

  if (request.accountIds?.length === 1) {
    const accountId = request.accountIds[0];

    if (accountId) {
      query.accountId = accountId;
    }
  }

  if (request.categoryIds?.length === 1) {
    const categoryId = request.categoryIds[0];

    if (categoryId) {
      query.categoryId = categoryId;
    }
  }

  if (request.merchantName?.trim()) {
    query.merchantName = request.merchantName.trim();
  }

  if (request.status) {
    query.status = request.status;
  }

  if (request.reviewState) {
    query.reviewState = request.reviewState;
  }

  if (request.currencyCode !== undefined) {
    query.currencyCode = request.currencyCode;
  }

  if (request.amountMin !== undefined) {
    query.amountMin = request.amountMin;
  }

  if (request.amountMax !== undefined) {
    query.amountMax = request.amountMax;
  }

  if (request.tag?.trim()) {
    query.tag = request.tag.trim();
  }

  if (request.includeExcludedAccounts) {
    query.includeExcludedAccounts = true;
  }

  return query;
}

async function listAllLedgerEntries(
  db: SqliteLedgerDb,
  request: ExportRequest,
): Promise<{ entries: readonly LedgerEntry[]; total: number }> {
  const entries: LedgerEntry[] = [];
  const limit = 500;
  let offset = 0;
  let total = 0;

  while (true) {
    const page = await db.listLedgerEntries({
      ...createEntryQuery(request),
      limit,
      offset,
    });

    total = page.total;
    entries.push(...page.entries);

    if (entries.length >= page.total || page.entries.length === 0) {
      break;
    }

    offset += page.entries.length;
  }

  return {
    entries,
    total,
  };
}

function exportFilters(request: ExportRequest): Record<string, unknown> {
  const filters: Record<string, unknown> = {};

  if (request.from !== undefined) {
    filters.from = request.from;
  }

  if (request.to !== undefined) {
    filters.to = request.to;
  }

  if (request.accountIds?.length) {
    filters.accountIds = [...request.accountIds];
  }

  if (request.categoryIds?.length) {
    filters.categoryIds = [...request.categoryIds];
  }

  if (request.tag?.trim()) {
    filters.tag = request.tag.trim();
  }

  if (request.merchantName?.trim()) {
    filters.merchantName = request.merchantName.trim();
  }

  if (request.status) {
    filters.status = request.status;
  }

  if (request.reviewState) {
    filters.reviewState = request.reviewState;
  }

  if (request.currencyCode !== undefined) {
    filters.currencyCode = request.currencyCode;
  }

  if (request.amountMin !== undefined) {
    filters.amountMin = request.amountMin;
  }

  if (request.amountMax !== undefined) {
    filters.amountMax = request.amountMax;
  }

  if (request.includeExcludedAccounts) {
    filters.includeExcludedAccounts = true;
  }

  return filters;
}

function ledgerExportMetadata(
  request: ExportRequest,
  format: Exclude<ExportFormat, "sqlite">,
  page: { total: number },
): Pick<LedgerExport, "format" | "preset" | "filters" | "rowCount"> {
  return {
    format,
    ...(request.preset ? { preset: request.preset } : {}),
    filters: exportFilters(request),
    rowCount: page.total,
  };
}

function formatMinorUnits(value: number): string {
  return (Math.abs(value) / 100).toFixed(2);
}

function renderLedgerCsv(entries: readonly LedgerEntry[]): string {
  const headers = [
    "id",
    "accountId",
    "time",
    "date",
    "description",
    "amount",
    "operationAmount",
    "currencyCode",
    "categoryId",
    "categoryName",
    "merchantName",
    "hold",
    "balance",
    "rawStatementItemId",
  ];
  const rows = entries.map((entry) => {
    return [
      entry.id,
      entry.accountId,
      entry.time,
      new Date(entry.time * 1000).toISOString(),
      entry.description,
      entry.amount,
      entry.operationAmount,
      entry.currencyCode,
      entry.categoryId,
      entry.categoryName,
      entry.merchantName,
      entry.hold ?? false,
      entry.balance,
      entry.rawStatementItemId,
    ]
      .map(escapeCsvCell)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function renderJournalCsv(entries: readonly LedgerEntry[]): string {
  const headers = [
    "date",
    "accountId",
    "description",
    "debit",
    "credit",
    "currencyCode",
    "category",
    "merchant",
    "sourceId",
  ];
  const rows = entries.map((entry) => {
    return [
      new Date(entry.time * 1000).toISOString().slice(0, 10),
      entry.accountId,
      entry.description,
      entry.amount < 0 ? formatMinorUnits(entry.amount) : undefined,
      entry.amount > 0 ? formatMinorUnits(entry.amount) : undefined,
      entry.currencyCode,
      entry.categoryName ?? entry.categoryId,
      entry.merchantName,
      entry.rawStatementItemId,
    ]
      .map(escapeCsvCell)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function optionalString(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

function optionalNumber(value: number | undefined): bigint | null {
  return value === undefined ? null : BigInt(value);
}

function serializeJsonColumn(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

function ledgerEntriesToParquetColumns(
  entries: readonly LedgerEntry[],
): ColumnSource[] {
  const dates = entries.map((entry) =>
    new Date(entry.time * 1000).toISOString(),
  );

  return [
    { name: "id", data: entries.map((entry) => entry.id), type: "STRING" },
    {
      name: "account_id",
      data: entries.map((entry) => entry.accountId),
      type: "STRING",
    },
    {
      name: "time",
      data: entries.map((entry) => BigInt(entry.time)),
      type: "INT64",
    },
    {
      name: "posted_at",
      data: dates,
      type: "STRING",
    },
    {
      name: "posted_date",
      data: dates.map((date) => date.slice(0, 10)),
      type: "STRING",
    },
    {
      name: "posted_month",
      data: dates.map((date) => date.slice(0, 7)),
      type: "STRING",
    },
    {
      name: "description",
      data: entries.map((entry) => entry.description),
      type: "STRING",
    },
    {
      name: "amount_minor",
      data: entries.map((entry) => BigInt(entry.amount)),
      type: "INT64",
    },
    {
      name: "amount",
      data: entries.map((entry) => entry.amount / 100),
      type: "DOUBLE",
    },
    {
      name: "operation_amount_minor",
      data: entries.map((entry) => optionalNumber(entry.operationAmount)),
      type: "INT64",
    },
    {
      name: "currency_code",
      data: entries.map((entry) => entry.currencyCode),
      type: "INT32",
    },
    {
      name: "category_id",
      data: entries.map((entry) => optionalString(entry.categoryId)),
      type: "STRING",
    },
    {
      name: "category_name",
      data: entries.map((entry) => optionalString(entry.categoryName)),
      type: "STRING",
    },
    {
      name: "category_source",
      data: entries.map((entry) => optionalString(entry.categorySource)),
      type: "STRING",
    },
    {
      name: "category_rule_id",
      data: entries.map((entry) => optionalString(entry.categoryRuleId)),
      type: "STRING",
    },
    {
      name: "merchant_name",
      data: entries.map((entry) => optionalString(entry.merchantName)),
      type: "STRING",
    },
    {
      name: "status",
      data: entries.map((entry) => (entry.hold ? "hold" : "posted")),
      type: "STRING",
    },
    {
      name: "hold",
      data: entries.map((entry) => entry.hold === true),
      type: "BOOLEAN",
    },
    {
      name: "balance_minor",
      data: entries.map((entry) => optionalNumber(entry.balance)),
      type: "INT64",
    },
    {
      name: "note",
      data: entries.map((entry) => optionalString(entry.note)),
      type: "STRING",
    },
    {
      name: "tags_json",
      data: entries.map((entry) => serializeJsonColumn(entry.tags)),
      type: "JSON",
    },
    {
      name: "split_plan_json",
      data: entries.map((entry) => serializeJsonColumn(entry.splitPlan)),
      type: "JSON",
    },
    {
      name: "review_state",
      data: entries.map((entry) => entry.reviewState ?? "needs_review"),
      type: "STRING",
    },
    {
      name: "reviewed_at",
      data: entries.map((entry) => optionalString(entry.reviewedAt)),
      type: "STRING",
    },
    {
      name: "reviewed_source",
      data: entries.map((entry) => optionalString(entry.reviewedSource)),
      type: "STRING",
    },
    {
      name: "raw_statement_item_id",
      data: entries.map((entry) => entry.rawStatementItemId),
      type: "STRING",
    },
  ];
}

function renderLedgerParquet(entries: readonly LedgerEntry[]): Uint8Array {
  const buffer = parquetWriteBuffer({
    columnData: ledgerEntriesToParquetColumns(entries),
    codec: "UNCOMPRESSED",
    rowGroupSize: 100_000,
    kvMetadata: [
      { key: "mono_ledger_sync.dataset", value: "ledger_entries" },
      { key: "mono_ledger_sync.schema_version", value: "1" },
    ],
  });

  return new Uint8Array(buffer);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(
  record: Record<string, unknown>,
  property: string,
): string {
  const value = record[property];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid local configuration: ${property} is required`);
  }

  return value;
}

function readOptionalString(
  record: Record<string, unknown>,
  property: string,
): string | undefined {
  const value = record[property];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(
      `Invalid local configuration: ${property} must be a string`,
    );
  }

  return value;
}

function readRequiredNumber(
  record: Record<string, unknown>,
  property: string,
): number {
  const value = record[property];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid local configuration: ${property} is required`);
  }

  return value;
}

function readOptionalNumber(
  record: Record<string, unknown>,
  property: string,
): number | undefined {
  const value = record[property];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Invalid local configuration: ${property} must be a number`,
    );
  }

  return value;
}

function readOptionalBoolean(
  record: Record<string, unknown>,
  property: string,
): boolean | undefined {
  const value = record[property];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(
      `Invalid local configuration: ${property} must be a boolean`,
    );
  }

  return value;
}

function readArray(
  record: Record<string, unknown>,
  property: keyof LocalConfigurationImportBody,
): readonly Record<string, unknown>[] {
  const value = record[property];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(
      `Invalid local configuration: ${property} must be an array`,
    );
  }

  return value;
}

function parseCategory(record: Record<string, unknown>): Category {
  const category: Category = {
    id: readRequiredString(record, "id"),
    name: readRequiredString(record, "name"),
    createdAt: readRequiredString(record, "createdAt"),
  };
  const color = readOptionalString(record, "color");
  const description = readOptionalString(record, "description");
  const isSystem = readOptionalBoolean(record, "isSystem");
  const updatedAt = readOptionalString(record, "updatedAt");

  if (color !== undefined) {
    category.color = color;
  }
  if (description !== undefined) {
    category.description = description;
  }
  if (isSystem !== undefined) {
    category.isSystem = isSystem;
  }
  if (updatedAt !== undefined) {
    category.updatedAt = updatedAt;
  }

  return category;
}

function parseCategoryRule(record: Record<string, unknown>): CategoryRule {
  const matchType = readRequiredString(record, "matchType");
  const amountDirection = readOptionalString(record, "amountDirection");

  if (matchType !== "condition" && matchType !== "fallback") {
    throw new Error("Invalid local configuration: matchType is unsupported");
  }
  if (
    amountDirection !== undefined &&
    amountDirection !== "income" &&
    amountDirection !== "expense" &&
    amountDirection !== "any"
  ) {
    throw new Error(
      "Invalid local configuration: amountDirection is unsupported",
    );
  }

  const rule: CategoryRule = {
    id: readRequiredString(record, "id"),
    categoryId: readRequiredString(record, "categoryId"),
    name: readRequiredString(record, "name"),
    priority: readRequiredNumber(record, "priority"),
    matchType,
    createdAt: readRequiredString(record, "createdAt"),
  };
  const merchantContains = readOptionalString(record, "merchantContains");
  const descriptionContains = readOptionalString(record, "descriptionContains");
  const mcc = readOptionalNumber(record, "mcc");
  const isSystem = readOptionalBoolean(record, "isSystem");
  const isEnabled = readOptionalBoolean(record, "isEnabled");
  const updatedAt = readOptionalString(record, "updatedAt");

  if (merchantContains !== undefined) {
    rule.merchantContains = merchantContains;
  }
  if (descriptionContains !== undefined) {
    rule.descriptionContains = descriptionContains;
  }
  if (mcc !== undefined) {
    rule.mcc = mcc;
  }
  if (amountDirection !== undefined) {
    rule.amountDirection = amountDirection;
  }
  if (isSystem !== undefined) {
    rule.isSystem = isSystem;
  }
  if (isEnabled !== undefined) {
    rule.isEnabled = isEnabled;
  }
  if (updatedAt !== undefined) {
    rule.updatedAt = updatedAt;
  }

  return rule;
}

function parseBudget(record: Record<string, unknown>): Budget {
  const budget: Budget = {
    id: readRequiredString(record, "id"),
    profile: readRequiredString(record, "profile"),
    categoryId: readRequiredString(record, "categoryId"),
    currencyCode: readRequiredNumber(record, "currencyCode"),
    periodStart: readRequiredString(record, "periodStart"),
    periodEnd: readRequiredString(record, "periodEnd"),
    amountLimit: readRequiredNumber(record, "amountLimit"),
    rollover: readOptionalBoolean(record, "rollover") ?? false,
    createdAt: readRequiredString(record, "createdAt"),
    updatedAt: readRequiredString(record, "updatedAt"),
  };
  const includeInflows = readOptionalBoolean(record, "includeInflows");

  if (includeInflows !== undefined) {
    budget.includeInflows = includeInflows;
  }

  return budget;
}

function parseBudgetPeriod(record: Record<string, unknown>): BudgetPeriod {
  const status = readRequiredString(record, "status");

  if (status !== "open" && status !== "closed") {
    throw new Error("Invalid local configuration: status is unsupported");
  }

  const period: BudgetPeriod = {
    id: readRequiredString(record, "id"),
    profile: readRequiredString(record, "profile"),
    budgetId: readRequiredString(record, "budgetId"),
    periodStart: readRequiredString(record, "periodStart"),
    periodEnd: readRequiredString(record, "periodEnd"),
    plannedAmount: readRequiredNumber(record, "plannedAmount"),
    status,
    createdAt: readRequiredString(record, "createdAt"),
    updatedAt: readRequiredString(record, "updatedAt"),
  };
  const actualAmount = readOptionalNumber(record, "actualAmount");

  if (actualAmount !== undefined) {
    period.actualAmount = actualAmount;
  }

  return period;
}

function parseTag(record: Record<string, unknown>): Tag {
  const tag: Tag = {
    id: readRequiredString(record, "id"),
    name: readRequiredString(record, "name"),
    normalizedName: readRequiredString(record, "normalizedName"),
    createdAt: readRequiredString(record, "createdAt"),
  };
  const updatedAt = readOptionalString(record, "updatedAt");

  if (updatedAt !== undefined) {
    tag.updatedAt = updatedAt;
  }

  return tag;
}

export function parseLocalConfigurationImport(
  value: unknown,
): LocalConfigurationImportBody {
  if (!isRecord(value)) {
    throw new Error("Invalid local configuration: JSON object is required");
  }

  if (value.format !== undefined && value.format !== "local-configuration") {
    throw new Error("Invalid local configuration: format is unsupported");
  }

  return {
    categories: readArray(value, "categories").map(parseCategory),
    categoryRules: readArray(value, "categoryRules").map(parseCategoryRule),
    budgets: readArray(value, "budgets").map(parseBudget),
    budgetPeriods: readArray(value, "budgetPeriods").map(parseBudgetPeriod),
    tags: readArray(value, "tags").map(parseTag),
  };
}

export async function createLedgerExport(
  db: SqliteLedgerDb,
  request: ExportRequest,
): Promise<LedgerExport> {
  const format = resolveExportFormat(request);
  const page = await listAllLedgerEntries(db, request);
  const fileName = createExportFileName(request, format);
  const metadata = ledgerExportMetadata(request, format, page);

  if (format === "json") {
    return {
      fileName,
      contentType: "application/json; charset=utf-8",
      ...metadata,
      body: JSON.stringify(
        {
          profile: request.profile,
          format,
          ...(request.preset ? { preset: request.preset } : {}),
          filters: exportFilters(request),
          total: page.total,
          entries: page.entries,
        },
        null,
        2,
      ),
    };
  }

  if (format === "jsonl") {
    return {
      fileName,
      contentType: "application/x-ndjson; charset=utf-8",
      ...metadata,
      body: page.entries.map((entry) => JSON.stringify(entry)).join("\n"),
    };
  }

  if (format === "parquet") {
    return {
      fileName,
      contentType: "application/vnd.apache.parquet",
      ...metadata,
      body: renderLedgerParquet(page.entries),
    };
  }

  return {
    fileName,
    contentType: "text/csv; charset=utf-8",
    ...metadata,
    body:
      format === "journal-csv"
        ? renderJournalCsv(page.entries)
        : renderLedgerCsv(page.entries),
  };
}

function redactSqliteSnapshotFile(filePath: string): void {
  const database = new Database(filePath);

  try {
    database.pragma("foreign_keys = OFF");
    database.pragma("secure_delete = ON");
    database.exec(
      [
        "UPDATE accounts SET masked_pan_json = NULL, raw_json = '{}'",
        "UPDATE jars SET raw_json = '{}'",
        "UPDATE currency_rates SET raw_json = '{}'",
        "DELETE FROM raw_statement_items",
        "DELETE FROM webhook_events",
        "UPDATE local_app_settings SET export_directory = NULL",
        "UPDATE local_exports SET file_path = NULL",
      ].join(";\n"),
    );
    database.exec("VACUUM");
  } finally {
    database.close();
  }
}

function sqliteSnapshotFilters(
  request: SqliteSnapshotExportRequest,
): Record<string, unknown> {
  return {
    redacted: request.redacted !== false,
  };
}

export async function createSqliteSnapshotExport(
  request: SqliteSnapshotExportRequest,
): Promise<SqliteSnapshotExport> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-snapshot-"));
  const snapshotPath = path.join(
    tempRoot,
    createSqliteSnapshotFileName(request),
  );

  try {
    await copyFile(request.databasePath, snapshotPath);

    if (request.redacted !== false) {
      redactSqliteSnapshotFile(snapshotPath);
    }

    const body = await readFile(snapshotPath);
    const database = new Database(snapshotPath, { readonly: true });

    try {
      const row = database
        .prepare(
          "SELECT COUNT(*) AS total FROM ledger_entries WHERE profile = ?",
        )
        .get(request.profile) as { total: number } | undefined;

      return {
        fileName: createSqliteSnapshotFileName(request),
        contentType: "application/vnd.sqlite3",
        body,
        format: "sqlite",
        filters: sqliteSnapshotFilters(request),
        rowCount: row?.total ?? 0,
      };
    } finally {
      database.close();
    }
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export async function createLocalConfigurationExport(
  db: SqliteLedgerDb,
  request: LocalConfigurationExportRequest,
): Promise<LedgerExport> {
  const [categories, categoryRules, budgets, budgetPeriods, tags] =
    await Promise.all([
      db.listCategories(request.profile),
      db.listCategoryRules(request.profile),
      db.listBudgets(request.profile),
      db.listBudgetPeriods(request.profile),
      db.listTags(request.profile),
    ]);
  const body: LocalConfigurationExportBody = {
    profile: request.profile,
    format: "local-configuration",
    schemaVersion: 1,
    categories,
    categoryRules,
    budgets,
    budgetPeriods,
    tags,
    totals: {
      categories: categories.length,
      categoryRules: categoryRules.length,
      budgets: budgets.length,
      budgetPeriods: budgetPeriods.length,
      tags: tags.length,
    },
  };

  return {
    fileName: createLocalConfigurationFileName(request),
    contentType: "application/json; charset=utf-8",
    format: "json",
    filters: {},
    rowCount:
      body.totals.categories +
      body.totals.categoryRules +
      body.totals.budgets +
      body.totals.budgetPeriods +
      body.totals.tags,
    body: JSON.stringify(body, null, 2),
  };
}
