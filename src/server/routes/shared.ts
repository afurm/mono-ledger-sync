import type { LedgerSource } from "../../core/index.js";
import type { MonobankAdapter } from "../../monobank/index.js";
import type { SqliteLedgerDb } from "../../sqlite/index.js";
import {
  ledgerEntrySortDirections,
  ledgerEntrySortFields,
  type CategoryRuleInput,
  type LedgerEntryAnnotationUpdate,
  type LedgerEntryBulkEditUpdate,
  type LedgerEntryCategoryRestoreEntry,
  type LedgerEntrySortDirection,
  type LedgerEntrySortField,
  type LedgerEntrySplitPlanUpdate,
  type LedgerQueryService,
  type LedgerWriteService,
  type ManualRecurringItemInput,
  type MonthlyCategoryBudgetInput,
} from "../../storage/index.js";

export interface LocalApiRouteServices {
  profile: string;
  source: LedgerSource;
  dataDir: string;
  databasePath: string;
  db: SqliteLedgerDb;
  adapter: MonobankAdapter;
  queryService: LedgerQueryService;
  writeService: LedgerWriteService;
}

export interface LocalApiRouteContext {
  apiPrefix: string;
  getServices: () => Promise<LocalApiRouteServices>;
}

export const localApiErrorResponseSchema = {
  type: "object",
  required: ["error", "message"],
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    upstreamStatus: { type: "number" },
  },
} as const;

export const objectResponseSchema = {
  type: "object",
  additionalProperties: true,
} as const;

export function readNumberQuery(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    return readNumberQuery(value[0]);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readStringQuery(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return readStringQuery(value[0]);
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  return value;
}

export function readBooleanQuery(value: unknown): boolean | undefined {
  if (Array.isArray(value)) {
    return readBooleanQuery(value[0]);
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  return undefined;
}

export function readUtcDateQuery(
  value: unknown,
  field: string,
): Date | undefined {
  const text = readStringQuery(value);

  if (text === undefined) {
    return undefined;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (!match) {
    throw new Error(`${field} must use YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month, day));

  if (parsed.toISOString().slice(0, 10) !== text) {
    throw new Error(`${field} must be a valid calendar date.`);
  }

  return parsed;
}

export function isLedgerEntrySortField(
  value: string | undefined,
): value is LedgerEntrySortField {
  return ledgerEntrySortFields.includes(value as LedgerEntrySortField);
}

export function isLedgerEntrySortDirection(
  value: string | undefined,
): value is LedgerEntrySortDirection {
  return ledgerEntrySortDirections.includes(value as LedgerEntrySortDirection);
}

export function readLedgerEntryAnnotationUpdate(
  body: unknown,
): LedgerEntryAnnotationUpdate {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  const record = body as Record<string, unknown>;
  const update: LedgerEntryAnnotationUpdate = {};

  if (Object.hasOwn(record, "note") && typeof record.note === "string") {
    update.note = record.note;
  }

  if (Object.hasOwn(record, "tags") && Array.isArray(record.tags)) {
    update.tags = record.tags.filter((tag): tag is string => {
      return typeof tag === "string";
    });
  }

  return update;
}

export function readCategoryRuleInput(body: unknown): CategoryRuleInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { categoryId: "" };
  }

  const record = body as Record<string, unknown>;
  const input: CategoryRuleInput = {
    categoryId: typeof record.categoryId === "string" ? record.categoryId : "",
  };

  if (typeof record.name === "string") {
    input.name = record.name;
  }

  if (typeof record.merchantContains === "string") {
    input.merchantContains = record.merchantContains;
  }

  if (typeof record.descriptionContains === "string") {
    input.descriptionContains = record.descriptionContains;
  }

  if (typeof record.mcc === "number") {
    input.mcc = record.mcc;
  }

  if (
    record.amountDirection === "income" ||
    record.amountDirection === "expense" ||
    record.amountDirection === "any"
  ) {
    input.amountDirection = record.amountDirection;
  }

  if (typeof record.priority === "number") {
    input.priority = record.priority;
  }

  if (typeof record.isEnabled === "boolean") {
    input.isEnabled = record.isEnabled;
  }

  return input;
}

export function readLedgerEntryBulkEditUpdate(body: unknown): {
  ids: readonly string[];
  update: LedgerEntryBulkEditUpdate;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ids: [], update: {} };
  }

  const record = body as Record<string, unknown>;
  const update: LedgerEntryBulkEditUpdate = {};
  const ids = Array.isArray(record.ids)
    ? record.ids.filter((id): id is string => typeof id === "string")
    : [];

  if (
    Object.hasOwn(record, "categoryId") &&
    typeof record.categoryId === "string"
  ) {
    update.categoryId = record.categoryId;
  }

  if (
    Object.hasOwn(record, "merchantName") &&
    typeof record.merchantName === "string"
  ) {
    update.merchantName = record.merchantName;
  }

  if (
    Object.hasOwn(record, "reviewState") &&
    (record.reviewState === "needs_review" ||
      record.reviewState === "reviewed" ||
      record.reviewState === "ignored")
  ) {
    update.reviewState = record.reviewState;
  }

  if (
    Object.hasOwn(record, "reviewedSource") &&
    typeof record.reviewedSource === "string"
  ) {
    update.reviewedSource = record.reviewedSource;
  }

  if (Object.hasOwn(record, "tags") && Array.isArray(record.tags)) {
    update.tags = record.tags.filter((tag): tag is string => {
      return typeof tag === "string";
    });
  }

  return { ids, update };
}

function isLedgerEntryCategorySource(
  value: unknown,
): value is NonNullable<LedgerEntryCategoryRestoreEntry["categorySource"]> {
  return value === "system_rule" || value === "user_rule" || value === "manual";
}

export function readLedgerEntryCategoryRestoreEntries(
  body: unknown,
): readonly LedgerEntryCategoryRestoreEntry[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [];
  }

  const record = body as Record<string, unknown>;

  if (!Array.isArray(record.entries)) {
    return [];
  }

  return record.entries
    .filter((entry): entry is Record<string, unknown> => {
      return !!entry && typeof entry === "object" && !Array.isArray(entry);
    })
    .flatMap((entry) => {
      if (typeof entry.id !== "string") {
        return [];
      }

      const restoreEntry: LedgerEntryCategoryRestoreEntry = { id: entry.id };

      if (typeof entry.categoryId === "string") {
        restoreEntry.categoryId = entry.categoryId;
      }

      if (typeof entry.categoryName === "string") {
        restoreEntry.categoryName = entry.categoryName;
      }

      if (isLedgerEntryCategorySource(entry.categorySource)) {
        restoreEntry.categorySource = entry.categorySource;
      }

      if (typeof entry.categoryRuleId === "string") {
        restoreEntry.categoryRuleId = entry.categoryRuleId;
      }

      if (typeof entry.categoryRuleVersion === "string") {
        restoreEntry.categoryRuleVersion = entry.categoryRuleVersion;
      }

      return [restoreEntry];
    });
}

export function readLedgerEntrySplitPlanUpdate(
  body: unknown,
): LedgerEntrySplitPlanUpdate {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  const record = body as Record<string, unknown>;
  const update: LedgerEntrySplitPlanUpdate = {};

  if (Array.isArray(record.lines)) {
    update.lines = record.lines
      .map((line) => {
        if (!line || typeof line !== "object" || Array.isArray(line)) {
          return undefined;
        }

        const item = line as Record<string, unknown>;
        const category = item.category;
        const amount = item.amount;

        if (typeof category !== "string" || typeof amount !== "number") {
          return undefined;
        }

        return { category, amount };
      })
      .filter((line): line is { category: string; amount: number } => {
        return line !== undefined;
      });
  }

  return update;
}

export function readMonthlyCategoryBudgetInput(
  body: unknown,
): MonthlyCategoryBudgetInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      categoryId: "",
      currencyCode: 980,
      month: "",
      amountLimit: 0,
    };
  }

  const record = body as Record<string, unknown>;

  return {
    categoryId:
      typeof record.categoryId === "string" ? record.categoryId.trim() : "",
    currencyCode:
      typeof record.currencyCode === "number" ? record.currencyCode : 980,
    month: typeof record.month === "string" ? record.month.trim() : "",
    amountLimit:
      typeof record.amountLimit === "number" ? record.amountLimit : 0,
    rollover: record.rollover === true,
  };
}

export function readManualRecurringItemInput(
  body: unknown,
): ManualRecurringItemInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      accountId: "",
      frequency: "monthly",
    };
  }

  const record = body as Record<string, unknown>;
  const frequency =
    record.frequency === "daily" ||
    record.frequency === "weekly" ||
    record.frequency === "monthly" ||
    record.frequency === "quarterly" ||
    record.frequency === "yearly" ||
    record.frequency === "irregular"
      ? record.frequency
      : "monthly";

  return {
    accountId:
      typeof record.accountId === "string" ? record.accountId.trim() : "",
    ...(typeof record.categoryId === "string"
      ? { categoryId: record.categoryId.trim() }
      : {}),
    ...(typeof record.merchantName === "string"
      ? { merchantName: record.merchantName.trim() }
      : {}),
    frequency,
    ...(typeof record.expectedAmountMin === "number"
      ? { expectedAmountMin: record.expectedAmountMin }
      : {}),
    ...(typeof record.expectedAmountMax === "number"
      ? { expectedAmountMax: record.expectedAmountMax }
      : {}),
    ...(typeof record.isActive === "boolean"
      ? { isActive: record.isActive }
      : {}),
    ...(typeof record.startedAt === "string"
      ? { startedAt: record.startedAt.trim() }
      : {}),
  };
}
