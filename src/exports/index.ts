import type { SqliteLedgerDb } from "../sqlite/index.js";
import type { LedgerEntry, LedgerEntryQuery } from "../storage/index.js";

export type ExportFormat = "csv" | "json" | "jsonl" | "journal-csv" | "sqlite";
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
}

export interface LedgerExport {
  fileName: string;
  contentType: string;
  body: string;
}

export const exportPresetDefinitions: Readonly<
  Record<
    ExportPreset,
    {
      label: string;
      format: Exclude<ExportFormat, "sqlite">;
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

  return `${parts.join("-")}.${fileExtension(format)}`;
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

  return filters;
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

export async function createLedgerExport(
  db: SqliteLedgerDb,
  request: ExportRequest,
): Promise<LedgerExport> {
  const format = resolveExportFormat(request);
  const page = await listAllLedgerEntries(db, request);
  const fileName = createExportFileName(request, format);

  if (format === "json") {
    return {
      fileName,
      contentType: "application/json; charset=utf-8",
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
      body: page.entries.map((entry) => JSON.stringify(entry)).join("\n"),
    };
  }

  return {
    fileName,
    contentType: "text/csv; charset=utf-8",
    body:
      format === "journal-csv"
        ? renderJournalCsv(page.entries)
        : renderLedgerCsv(page.entries),
  };
}
