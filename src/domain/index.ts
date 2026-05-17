export const ledgerEntrySortFields = [
  "time",
  "merchant",
  "amount",
  "account",
  "category",
  "status",
] as const;

export type LedgerEntrySortField = (typeof ledgerEntrySortFields)[number];

export const ledgerEntrySortDirections = ["asc", "desc"] as const;

export type LedgerEntrySortDirection =
  (typeof ledgerEntrySortDirections)[number];

export const domainErrorCategories = [
  "auth",
  "rate_limit",
  "validation",
  "network",
  "storage",
  "migration",
  "config",
  "privacy",
  "internal",
] as const;

export type DomainErrorCategory = (typeof domainErrorCategories)[number];

export const domainErrorCodes = [
  "auth_required",
  "token_invalid",
  "rate_limit_exceeded",
  "validation_failed",
  "request_invalid",
  "network_unreachable",
  "storage_corrupted",
  "migration_failed",
  "config_invalid",
  "privacy_violation",
  "internal_error",
] as const;

export type DomainErrorCode = (typeof domainErrorCodes)[number];

export const domainErrorCodeCategories: Readonly<
  Record<DomainErrorCode, DomainErrorCategory>
> = {
  auth_required: "auth",
  token_invalid: "auth",
  rate_limit_exceeded: "rate_limit",
  validation_failed: "validation",
  request_invalid: "validation",
  network_unreachable: "network",
  storage_corrupted: "storage",
  migration_failed: "migration",
  config_invalid: "config",
  privacy_violation: "privacy",
  internal_error: "internal",
};

export interface DomainErrorDescriptor {
  code: DomainErrorCode;
  category: DomainErrorCategory;
  details?: Record<string, unknown>;
}

export interface LocalAppSettings {
  profile: string;
  source?: "fixture" | "monobank";
  updatedAt: string;
}

export interface LocalAppSettingsUpdate {
  source?: "fixture" | "monobank";
}

export function domainErrorCategoryForCode(
  code: DomainErrorCode,
): DomainErrorCategory {
  return domainErrorCodeCategories[code];
}

export function createDomainErrorDescriptor(
  code: DomainErrorCode,
  details?: Record<string, unknown>,
): DomainErrorDescriptor {
  return {
    code,
    category: domainErrorCategoryForCode(code),
    ...(details ? { details } : {}),
  };
}

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: DomainErrorCode,
    readonly category: DomainErrorCategory,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const syncRunStatuses = [
  "queued",
  "running",
  "success",
  "partial",
  "failed",
] as const;

export type SyncRunStatus = (typeof syncRunStatuses)[number];

export const localActivityEventTypes = [
  "sync_run",
  "ledger_write",
  "webhook_delivery",
  "export",
  "report_refresh",
  "rule_application",
  "warning",
  "error",
] as const;

export type LocalActivityEventType = (typeof localActivityEventTypes)[number];

export const localActivityEventSeverities = [
  "info",
  "success",
  "partial",
  "warning",
  "error",
] as const;

export type LocalActivityEventSeverity =
  (typeof localActivityEventSeverities)[number];

export const webhookEventStatuses = [
  "pending",
  "processed",
  "duplicate",
  "ignored",
  "failed",
] as const;

export type WebhookEventStatus = (typeof webhookEventStatuses)[number];

export interface LocalActivityEvent {
  id: string;
  profile?: string;
  type: LocalActivityEventType;
  title: string;
  details: string;
  timestamp: string;
  severity: LocalActivityEventSeverity;
  source: string;
  referenceId?: string;
  correlationId?: string;
}

export type LedgerSource = "fixture" | "monobank";

export interface Profile {
  id: string;
  name?: string;
  createdAt: string;
}

export interface MonobankAccount {
  id: string;
  sendId?: string;
  currencyCode: number;
  cashbackType?: string;
  balance: number;
  creditLimit: number;
  type: string;
  maskedPan?: readonly string[];
  iban?: string;
}

export interface MonobankJar {
  id: string;
  sendId?: string;
  title: string;
  description: string;
  currencyCode: number;
  balance: number;
  goal: number;
}

export interface MonobankManagedClient {
  clientId: string;
  tin?: number;
  name: string;
  accounts: readonly MonobankAccount[];
}

export interface MonobankClientInfo {
  clientId: string;
  name: string;
  webHookUrl?: string;
  permissions?: string;
  accounts: readonly MonobankAccount[];
  jars?: readonly MonobankJar[];
  managedClients?: readonly MonobankManagedClient[];
}

export interface MonobankStatementItem {
  id?: string;
  time: number;
  description: string;
  mcc: number;
  originalMcc: number;
  amount: number;
  operationAmount: number;
  currencyCode: number;
  commissionRate: number;
  cashbackAmount: number;
  balance: number;
  hold: boolean;
  comment?: string;
  receiptId?: string;
  invoiceId?: string;
  counterEdrpou?: string;
  counterIban?: string;
  counterName?: string;
}

export interface MonobankCurrencyRate {
  currencyCodeA: number;
  currencyCodeB: number;
  date: number;
  rateBuy?: number;
  rateSell?: number;
  rateCross?: number;
}

export interface StatementWindow {
  accountId: string;
  from: number;
  to: number;
}

export interface MonobankStatementItemWebhookEvent {
  type: "StatementItem";
  data: {
    account: string;
    statementItem: MonobankStatementItem;
  };
}

export type MonobankPersonalWebhookEvent = MonobankStatementItemWebhookEvent;

export interface MonobankErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  retryAfterSeconds?: number;
}

export interface MonobankRawEvent {
  id: string;
  profile: string;
  accountId: string;
  type: string;
  statementItemId?: string;
  source: string;
  payloadJson: string;
  receivedAt: string;
  processedAt?: string;
}

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

export interface LedgerCashflowSummary {
  month: string;
  from: string;
  to: string;
  income: number;
  expenses: number;
  net: number;
}

export interface LedgerJar {
  id: string;
  title: string;
  description: string;
  currencyCode: number;
  balance: number;
  goal: number;
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
  note?: string;
  tags?: readonly string[];
  splitPlan?: readonly {
    category: string;
    amount: number;
  }[];
  rawStatementItemId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LedgerEntryAnnotationUpdate {
  note?: string;
  tags?: readonly string[];
}

export interface LedgerEntrySplitPlanUpdate {
  lines?: readonly {
    category: string;
    amount: number;
  }[];
}

export interface Tag {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LedgerEntryQuery {
  profile: string;
  accountId?: string;
  categoryId?: string;
  merchantName?: string;
  tag?: string;
  status?: "hold" | "posted";
  amountMin?: number;
  amountMax?: number;
  search?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
  sortBy?: LedgerEntrySortField;
  sortDirection?: LedgerEntrySortDirection;
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
  monthToDate: LedgerCashflowSummary;
  currencies: readonly number[];
  lastSyncedAt?: string;
  oldestSyncCursorUpdatedAt?: string;
}

export interface SyncCursor {
  profile: string;
  accountId: string;
  source: LedgerSource;
  statementFrom: number;
  statementTo: number;
  updatedAt: string;
}

export interface SyncRun {
  id: string;
  profile: string;
  source: LedgerSource;
  status: SyncRunStatus;
  startedAt: string;
  finishedAt?: string;
  apiCalls: number;
  windowsFetched: number;
  itemsSeen: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsSkipped: number;
  rateLimited: number;
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
  status: WebhookEventStatus;
  processedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  description?: string;
  isSystem?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CategoryRule {
  id: string;
  categoryId: string;
  name: string;
  priority: number;
  matchType: "condition" | "fallback";
  merchantContains?: string;
  descriptionContains?: string;
  mcc?: number;
  amountDirection?: "income" | "expense" | "any";
  isSystem?: boolean;
  isEnabled?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Merchant {
  id: string;
  name: string;
  normalizedName: string;
  firstSeenAt: number;
  lastSeenAt: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Budget {
  id: string;
  profile: string;
  categoryId: string;
  currencyCode: number;
  periodStart: string;
  periodEnd: string;
  amountLimit: number;
  rollover: boolean;
  includeInflows?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetPeriod {
  id: string;
  profile: string;
  budgetId: string;
  periodStart: string;
  periodEnd: string;
  plannedAmount: number;
  actualAmount?: number;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface RecurringItem {
  id: string;
  profile: string;
  accountId: string;
  categoryId?: string;
  merchantName?: string;
  frequency:
    | "daily"
    | "weekly"
    | "monthly"
    | "quarterly"
    | "yearly"
    | "irregular";
  expectedAmountMin?: number;
  expectedAmountMax?: number;
  isActive: boolean;
  startedAt?: string;
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
}
