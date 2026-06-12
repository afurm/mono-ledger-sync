import os from "node:os";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyInstance } from "fastify";
import type inject from "light-my-request";

import {
  createLedgerExport,
  createLocalConfigurationExport,
  exportPresetNames,
  isExportFormat,
  isExportPreset,
  parseLocalConfigurationImport,
  type ExportFormat,
  type ExportPreset,
} from "../exports/index.js";
import {
  collectDiagnostics,
  collectSupportBundle,
  type CollectDiagnosticsTokenStatus,
  type DiagnosticsSnapshot,
  type SupportBundleSnapshot,
} from "./diagnostics.js";
import {
  isLedgerSource,
  productArchitecture,
  version,
  type LedgerSource,
} from "../core/index.js";
import { DomainError } from "../domain/index.js";
import {
  assertMonobankPersonalWebhookEvent,
  createBundledFixtureMonobankAdapter,
  createMonobankHttpAdapter,
  createMonobankRateLimitState,
  MonobankApiError,
  MonobankValidationError,
  type MonobankAdapter,
  type MonobankPersonalWebhookEvent,
  type MonobankRateLimitState,
} from "../monobank/index.js";
import { createSqliteLedgerDb, type SqliteLedgerDb } from "../sqlite/index.js";
import {
  createProcessSignalAbortController,
  syncLedgerWithMonobank,
} from "../sync/index.js";
import {
  ledgerEntrySortDirections,
  ledgerEntrySortFields,
  createLedgerQueryService,
  createLedgerWriteService,
  type LedgerQueryService,
  type LedgerWriteService,
  type MonthlyCategoryBudgetInput,
} from "../storage/index.js";
import type {
  Category,
  CategoryRule,
  BalanceProjectionReport,
  CategoryTrendReport,
  BudgetProgress,
  CashflowReport,
  LedgerAccount,
  LedgerCategorySpending,
  LedgerEntry,
  LedgerEntryAnnotationUpdate,
  LedgerEntryBulkEditUpdate,
  LedgerEntryCategoryRestoreEntry,
  LedgerEntrySplitPlanUpdate,
  LedgerEntryPage,
  LedgerEntrySortDirection,
  LedgerEntrySortField,
  LedgerJar,
  SavingsGoalProgress,
  LedgerSummary,
  MerchantCleanupRule,
  MerchantTrendReport,
  MissedRecurringPayment,
  MonthlySpendingReport,
  NetWorthTrend,
  RecurringCalendarEvent,
  RecurringDetectionCandidate,
  RecurringDetectionDecisionResult,
  SavingsRateReport,
  SubscriptionIncreaseAlert,
  UpcomingRecurringPayment,
  StoredWebhookEvent,
  SyncRun,
} from "../storage/index.js";
import type { SyncLedgerResult } from "../sync/index.js";
import { logStructured } from "../logging/index.js";
import {
  createDefaultMonobankTokenStore,
  type MonobankTokenStore,
  type MonobankTokenStoreFallbackReason,
  type MonobankTokenStorePersistence,
  type MonobankTokenStoreStorage,
} from "../security/index.js";

export const localApiServerFramework = "fastify";
export const localApiRoutePrefix = "/api";
export const defaultLocalApiHost = "127.0.0.1";
const localApiLocalHosts = [defaultLocalApiHost, "localhost"] as const;
export type LocalApiHost = (typeof localApiLocalHosts)[number];
export type LocalApiAccessAuthentication = "none" | "passcode";
const defaultWebhookPathEntropyBytes = 16;
const localApiAccessPasscodeHeader = "x-mono-ledger-sync-passcode";
const localApiAccessBasicRealm = "mono-ledger-sync";
const webhookRouteIdPrefix = `${localApiRoutePrefix}/webhooks/monobank-`;
type LocalWebhookRoutePath =
  `${typeof localApiRoutePrefix}/webhooks/monobank-${string}`;

function createWebhookRoutePath(): LocalWebhookRoutePath {
  const pathId = crypto
    .randomBytes(defaultWebhookPathEntropyBytes)
    .toString("hex");

  return `${webhookRouteIdPrefix}${pathId}`;
}

function isLocalApiHost(host: string): host is LocalApiHost {
  return localApiLocalHosts.includes(host as LocalApiHost);
}

export function resolveLocalApiHost(host: string | undefined): LocalApiHost {
  const normalizedHost = host?.trim() || defaultLocalApiHost;

  if (isLocalApiHost(normalizedHost)) {
    return normalizedHost;
  }

  throw new DomainError(
    "Local API host must be 127.0.0.1 or localhost until external binding is protected by authentication.",
    "config_invalid",
    "config",
    { field: "host", host: normalizedHost, localOnly: true },
  );
}

function resolveLocalApiAccessPasscode(
  options: Pick<LocalApiServerOptions, "accessPasscode">,
): string | undefined {
  const optionPasscode = options.accessPasscode?.trim();

  if (optionPasscode) {
    return optionPasscode;
  }

  const envPasscode = process.env.MONO_LEDGER_SYNC_ACCESS_PASSCODE?.trim();

  return envPasscode || undefined;
}

export function resolveLocalApiAccessBinding(
  options: Pick<LocalApiServerOptions, "host" | "accessPasscode"> = {},
): LocalApiAccessBinding {
  const host = options.host?.trim() || defaultLocalApiHost;

  if (isLocalApiHost(host)) {
    return {
      localOnly: true,
      host,
      authentication: "none",
    };
  }

  if (resolveLocalApiAccessPasscode(options) === undefined) {
    throw new DomainError(
      "External Local API binding requires MONO_LEDGER_SYNC_ACCESS_PASSCODE or accessPasscode.",
      "config_invalid",
      "config",
      { field: "accessPasscode", host, localOnly: false },
    );
  }

  return {
    localOnly: false,
    host,
    authentication: "passcode",
  };
}

interface LocalApiAccessControl extends LocalApiAccessBinding {
  passcode?: string;
}

function resolveLocalApiAccessControl(
  options: Pick<LocalApiServerOptions, "host" | "accessPasscode">,
): LocalApiAccessControl {
  const binding = resolveLocalApiAccessBinding(options);
  const passcode = resolveLocalApiAccessPasscode(options);

  return passcode === undefined ? binding : { ...binding, passcode };
}

function constantTimeStringEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function readHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readBasicAuthPasscode(
  authorization: string | undefined,
): string | undefined {
  if (!authorization?.startsWith("Basic ")) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString(
      "utf8",
    );
    const separator = decoded.indexOf(":");

    return separator === -1 ? undefined : decoded.slice(separator + 1);
  } catch {
    return undefined;
  }
}

function requestHasAccessPasscode(
  headers: Record<string, string | string[] | undefined>,
  passcode: string,
): boolean {
  const headerPasscode = readHeaderValue(headers[localApiAccessPasscodeHeader]);
  const basicPasscode = readBasicAuthPasscode(
    readHeaderValue(headers.authorization),
  );

  return [headerPasscode, basicPasscode].some(
    (candidate) =>
      candidate !== undefined && constantTimeStringEquals(candidate, passcode),
  );
}

const serverModuleDir = path.dirname(fileURLToPath(import.meta.url));
const localWebBuildDir = path.resolve(serverModuleDir, "../web");
const localWebAssetsDir = path.join(localWebBuildDir, "assets");

export interface LocalApiServerOptions {
  host?: string;
  port?: number;
  accessPasscode?: string;
  profile?: string;
  source?: LedgerSource;
  dataDir?: string;
  openBrowser?: boolean;
  monobankToken?: string;
  monobankBaseUrl?: string;
  monobankTokenStore?: MonobankTokenStore;
  monobankTokenProbeAdapter?: MonobankAdapter;
  validateMonobankTokenOnSave?: boolean;
  now?: () => number;
  webhookRateLimitMaxRequests?: number;
  webhookRateLimitWindowMs?: number;
  logSink?: (line: string) => void;
}

export interface LocalApiServer {
  readonly url: string | undefined;
  readonly apiPrefix: typeof localApiRoutePrefix;
  listen(): Promise<string>;
  inject(request: LocalApiTestRequest): Promise<LocalApiTestResponse>;
  close(): Promise<void>;
}

export interface LocalApiRouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: `${typeof localApiRoutePrefix}/${string}`;
  auth: "local";
}

export interface LocalApiTestRequest {
  method: LocalApiRouteDefinition["method"];
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface LocalApiTestResponse {
  statusCode: number;
  headers: Record<string, string | string[] | number | undefined>;
  body: string;
  json(): unknown;
}

export interface LocalApiHealth {
  status: "ok";
  localOnly: boolean;
  version: typeof version;
  framework: typeof localApiServerFramework;
  apiPrefix: typeof localApiRoutePrefix;
  architecture: typeof productArchitecture;
}

export interface LocalApiWebhookSettings {
  enabled: boolean;
  path: LocalWebhookRoutePath;
  host: string;
  port: number;
  url: string;
}

export interface LocalApiAccessBinding {
  localOnly: boolean;
  host: string;
  authentication: LocalApiAccessAuthentication;
}

interface LocalApiMonobankTokenStatus {
  profile: string;
  hasToken: boolean;
  storage: MonobankTokenStoreStorage;
  persistence: MonobankTokenStorePersistence;
  fallbackReason?: MonobankTokenStoreFallbackReason;
  clientInfo?: LocalApiMonobankClientInfoSummary;
}

export interface LocalApiMonobankClientInfoSummary {
  clientId: string;
  name: string;
  accounts: number;
  jars: number;
  masked: true;
}

export interface LocalApiAppConfigSyncState {
  lastSyncedAt?: string;
  nextSyncAllowedAt?: number;
}

export interface LocalApiAppConfig {
  profile: string;
  source: LedgerSource;
  dataDir: string;
  databasePath: string;
  localOnly: boolean;
  access: LocalApiAccessBinding;
  webhook: LocalApiWebhookSettings;
  token: LocalApiMonobankTokenStatus;
  sync: LocalApiAppConfigSyncState;
}

interface LocalAppServices {
  profile: string;
  source: LedgerSource;
  dataDir: string;
  databasePath: string;
  db: SqliteLedgerDb;
  adapter: MonobankAdapter;
  queryService: LedgerQueryService;
  writeService: LedgerWriteService;
}

const healthResponseSchema = {
  type: "object",
  required: [
    "status",
    "localOnly",
    "version",
    "framework",
    "apiPrefix",
    "architecture",
  ],
  properties: {
    status: { const: "ok" },
    localOnly: { type: "boolean" },
    version: { const: version },
    framework: { const: localApiServerFramework },
    apiPrefix: { const: localApiRoutePrefix },
    architecture: {
      type: "object",
      required: ["ui", "server", "storage"],
      properties: {
        ui: { const: productArchitecture.ui },
        server: { const: productArchitecture.server },
        storage: { const: productArchitecture.storage },
      },
    },
  },
} as const;

const diagnosticsResponseSchema = {
  type: "object",
  required: [
    "schemaVersion",
    "profile",
    "source",
    "version",
    "architecture",
    "generatedAt",
    "secureStorage",
    "database",
    "sync",
    "webhooks",
    "duplicates",
    "token",
  ],
  properties: {
    schemaVersion: { type: "string" },
    profile: { type: "string" },
    source: { enum: ["fixture", "monobank"] },
    version: { type: "string" },
    architecture: { type: "object" },
    generatedAt: { type: "string" },
    secureStorage: {
      type: "object",
      required: ["available", "platform", "backend"],
      properties: {
        available: { type: "boolean" },
        platform: { type: "string" },
        backend: { enum: ["keychain", "secret-service", "session"] },
        reason: { type: "string" },
      },
    },
    database: {
      type: "object",
      required: ["integrity", "filePath", "fileSize", "lastModified"],
      properties: {
        integrity: { enum: ["ok", "error"] },
        integrityError: { type: "string" },
        filePath: { type: "string" },
        fileSize: { type: "number" },
        lastModified: { type: "string" },
      },
    },
    sync: {
      type: "object",
      required: ["lastSuccessfulAt", "ageHours", "staleCursors"],
      properties: {
        lastSuccessfulAt: { type: ["string", "null"] },
        ageHours: { type: ["number", "null"] },
        staleCursors: { type: "array" },
      },
    },
    webhooks: {
      type: "object",
      required: ["pending", "processed", "failed", "ignored", "duplicate"],
      properties: {
        pending: { type: "number" },
        processed: { type: "number" },
        failed: { type: "number" },
        ignored: { type: "number" },
        duplicate: { type: "number" },
      },
    },
    duplicates: {
      type: "object",
      required: ["last24h", "sinceFirstRun"],
      properties: {
        last24h: { type: "number" },
        sinceFirstRun: { type: "number" },
      },
    },
    token: {
      type: "object",
      required: ["present", "storage", "persistence"],
      properties: {
        present: { type: "boolean" },
        storage: { enum: ["secure", "session"] },
        persistence: { enum: ["persistent", "session"] },
        fallbackReason: { type: "string" },
      },
    },
  },
} as const;

const supportBundleResponseSchema = {
  ...diagnosticsResponseSchema,
  required: [
    ...diagnosticsResponseSchema.required.filter((k) => k !== "token"),
    "supportBundle",
    "tokenRedacted",
  ],
  properties: {
    ...diagnosticsResponseSchema.properties,
    supportBundle: { const: true },
    tokenRedacted: { const: true },
  },
} as const;

const appConfigResponseSchema = {
  type: "object",
  required: [
    "profile",
    "source",
    "dataDir",
    "databasePath",
    "localOnly",
    "access",
    "webhook",
    "token",
    "sync",
  ],
  properties: {
    profile: { type: "string" },
    source: { enum: ["fixture", "monobank"] },
    dataDir: { type: "string" },
    databasePath: { type: "string" },
    localOnly: { type: "boolean" },
    access: {
      type: "object",
      required: ["localOnly", "host", "authentication"],
      additionalProperties: false,
      properties: {
        localOnly: { type: "boolean" },
        host: { type: "string" },
        authentication: { enum: ["none", "passcode"] },
      },
    },
    webhook: {
      type: "object",
      required: ["enabled", "path", "host", "port", "url"],
      properties: {
        enabled: { type: "boolean" },
        path: {
          type: "string",
          pattern: "^/api/webhooks/monobank-[a-f0-9]{32}$",
        },
        host: { type: "string" },
        port: { type: "number" },
        url: { type: "string" },
      },
    },
    token: {
      type: "object",
      required: ["profile", "hasToken", "storage", "persistence"],
      properties: {
        profile: { type: "string" },
        hasToken: { type: "boolean" },
        storage: { enum: ["secure", "session"] },
        persistence: { enum: ["persistent", "session"] },
        fallbackReason: {
          enum: ["secure_storage_unavailable", "secure_storage_write_failed"],
        },
      },
    },
    sync: {
      type: "object",
      properties: {
        lastSyncedAt: { type: "string" },
        nextSyncAllowedAt: { type: "number" },
      },
    },
  },
} as const;

const monobankTokenBodySchema = {
  type: "object",
  required: ["token"],
  properties: {
    profile: { type: "string" },
    token: { type: "string" },
  },
  additionalProperties: false,
} as const;

const appSourceBodySchema = {
  type: "object",
  required: ["source"],
  properties: {
    source: { enum: ["fixture", "monobank"] },
  },
  additionalProperties: false,
} as const;

const monobankTokenResponseSchema = {
  type: "object",
  required: ["profile", "hasToken", "storage", "persistence"],
  properties: {
    profile: { type: "string" },
    hasToken: { type: "boolean" },
    storage: { enum: ["secure", "session"] },
    persistence: { enum: ["persistent", "session"] },
    fallbackReason: {
      enum: ["secure_storage_unavailable", "secure_storage_write_failed"],
    },
    clientInfo: {
      type: "object",
      required: ["clientId", "name", "accounts", "jars", "masked"],
      properties: {
        clientId: { type: "string" },
        name: { type: "string" },
        accounts: { type: "number" },
        jars: { type: "number" },
        masked: { const: true },
      },
    },
  },
} as const;

const ledgerSummaryResponseSchema = {
  type: "object",
  required: [
    "profile",
    "accounts",
    "ledgerEntries",
    "income",
    "expenses",
    "net",
    "monthToDate",
    "currencies",
  ],
  properties: {
    profile: { type: "string" },
    accounts: { type: "number" },
    ledgerEntries: { type: "number" },
    income: { type: "number" },
    expenses: { type: "number" },
    net: { type: "number" },
    monthToDate: {
      type: "object",
      required: ["month", "from", "to", "income", "expenses", "net"],
      properties: {
        month: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        income: { type: "number" },
        expenses: { type: "number" },
        net: { type: "number" },
      },
    },
    currencies: { type: "array", items: { type: "number" } },
    lastSyncedAt: { type: "string" },
    oldestSyncCursorUpdatedAt: { type: "string" },
  },
} as const;

const netWorthTrendResponseSchema = {
  type: "object",
  required: ["enabled", "points"],
  properties: {
    enabled: { type: "boolean" },
    reason: { type: "string" },
    points: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
      },
    },
  },
} as const;

const ledgerAccountsResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const ledgerJarsResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const ledgerCategoriesResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const ledgerCategoryRulesResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const merchantCleanupRulesResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const ledgerCategorySpendingResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const cashflowReportQuerySchema = {
  type: "object",
  properties: {
    months: { type: "integer", minimum: 1 },
  },
} as const;

const cashflowReportResponseSchema = {
  type: "object",
  additionalProperties: true,
} as const;

const savingsRateReportQuerySchema = {
  type: "object",
  properties: {
    months: { type: "integer", minimum: 1 },
  },
} as const;

const savingsRateReportResponseSchema = {
  type: "object",
  additionalProperties: true,
} as const;

const balanceProjectionReportQuerySchema = {
  type: "object",
  properties: {
    days: { type: "integer", minimum: 1 },
  },
} as const;

const balanceProjectionReportResponseSchema = {
  type: "object",
  additionalProperties: true,
} as const;

const categoryTrendReportQuerySchema = {
  type: "object",
  properties: {
    months: { type: "integer", minimum: 1 },
  },
} as const;

const categoryTrendReportResponseSchema = {
  type: "object",
  additionalProperties: true,
} as const;

const merchantTrendReportQuerySchema = {
  type: "object",
  properties: {
    months: { type: "integer", minimum: 1 },
  },
} as const;

const merchantTrendReportResponseSchema = {
  type: "object",
  additionalProperties: true,
} as const;

const monthlySpendingReportQuerySchema = {
  type: "object",
  properties: {
    month: { type: "string" },
  },
} as const;

const monthlySpendingReportResponseSchema = {
  type: "object",
  additionalProperties: true,
} as const;

const upcomingRecurringPaymentsResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const missedRecurringPaymentsQuerySchema = {
  type: "object",
  properties: {
    asOf: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  },
  additionalProperties: false,
} as const;

const missedRecurringPaymentsResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const subscriptionIncreaseAlertsQuerySchema = {
  type: "object",
  properties: {
    asOf: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  },
  additionalProperties: false,
} as const;

const subscriptionIncreaseAlertsResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const recurringDetectionCandidatesResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const recurringDetectionDecisionParamsSchema = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const;

const recurringDetectionDecisionResponseSchema = {
  type: "object",
  additionalProperties: true,
} as const;

const recurringCalendarQuerySchema = {
  type: "object",
  properties: {
    from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  },
  additionalProperties: false,
} as const;

const recurringCalendarResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const budgetProgressResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const savingsGoalProgressResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const monthlyCategoryBudgetBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["categoryId", "month", "amountLimit"],
  properties: {
    categoryId: { type: "string", minLength: 1, maxLength: 80 },
    month: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
    amountLimit: { type: "number", exclusiveMinimum: 0 },
    currencyCode: { type: "number", minimum: 1 },
    rollover: { type: "boolean" },
  },
} as const;

const deleteMonthlyBudgetParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 },
  },
} as const;

const ledgerEntriesPageResponseSchema = {
  type: "object",
  required: ["entries", "total", "limit", "offset"],
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
      },
    },
    total: { type: "number" },
    limit: { type: "number" },
    offset: { type: "number" },
  },
} as const;

const ledgerEntryAnnotationBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    note: { type: "string", maxLength: 2000 },
    tags: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 40 },
    },
  },
} as const;

const ledgerEntriesBulkEditBodySchema = {
  type: "object",
  required: ["ids"],
  additionalProperties: false,
  minProperties: 2,
  properties: {
    ids: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: { type: "string", minLength: 1, maxLength: 200 },
    },
    categoryId: { type: "string", minLength: 1, maxLength: 120 },
    merchantName: { type: "string", minLength: 1, maxLength: 200 },
    tags: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 40 },
    },
  },
} as const;

const ledgerEntryCategoryRestoreBodySchema = {
  type: "object",
  required: ["entries"],
  additionalProperties: false,
  properties: {
    entries: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        required: ["id"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 200 },
          categoryId: { type: "string", minLength: 1, maxLength: 120 },
          categoryName: { type: "string", minLength: 1, maxLength: 200 },
          categorySource: {
            type: "string",
            enum: ["system_rule", "user_rule", "manual"],
          },
          categoryRuleId: { type: "string", minLength: 1, maxLength: 200 },
          categoryRuleVersion: {
            type: "string",
            minLength: 1,
            maxLength: 120,
          },
        },
      },
    },
  },
} as const;

const ledgerEntrySplitPlanLineSchema = {
  type: "object",
  required: ["category", "amount"],
  additionalProperties: false,
  properties: {
    category: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      pattern: "^(?!\\s*$).+",
    },
    amount: { type: "integer" },
  },
} as const;

const ledgerEntrySplitPlanBodySchema = {
  type: "object",
  required: ["lines"],
  additionalProperties: false,
  properties: {
    lines: {
      type: "array",
      maxItems: 20,
      items: ledgerEntrySplitPlanLineSchema,
    },
  },
} as const;

const syncRunResponseSchema = {
  type: "object",
  required: [
    "id",
    "profile",
    "source",
    "status",
    "startedAt",
    "apiCalls",
    "windowsFetched",
    "itemsSeen",
    "itemsInserted",
    "itemsUpdated",
    "itemsSkipped",
    "rateLimited",
  ],
  properties: {
    id: { type: "string" },
    profile: { type: "string" },
    source: { enum: ["fixture", "monobank"] },
    status: {
      enum: ["queued", "running", "success", "partial", "failed"],
    },
    startedAt: { type: "string" },
    finishedAt: { type: "string" },
    apiCalls: { type: "number" },
    windowsFetched: { type: "number" },
    itemsSeen: { type: "number" },
    itemsInserted: { type: "number" },
    itemsUpdated: { type: "number" },
    itemsSkipped: { type: "number" },
    rateLimited: { type: "number" },
  },
} as const;

const syncWriteStatsResponseSchema = {
  type: "object",
  required: ["inserted", "updated", "skipped"],
  properties: {
    inserted: { type: "number" },
    updated: { type: "number" },
    skipped: { type: "number" },
  },
} as const;

const syncRunResultResponseSchema = {
  type: "object",
  required: ["run", "accounts", "dryRun", "stats", "summary"],
  properties: {
    run: syncRunResponseSchema,
    accounts: {
      type: "array",
      items: {
        type: "object",
        required: [
          "accountId",
          "from",
          "to",
          "windowsFetched",
          "itemsSeen",
          "writeStats",
        ],
        properties: {
          accountId: { type: "string" },
          from: { type: "number" },
          to: { type: "number" },
          windowsFetched: { type: "number" },
          itemsSeen: { type: "number" },
          writeStats: syncWriteStatsResponseSchema,
        },
      },
    },
    dryRun: { type: "boolean" },
    stats: {
      type: "object",
      required: [
        "apiCalls",
        "windowsFetched",
        "itemsSeen",
        "itemsInserted",
        "itemsUpdated",
        "itemsSkipped",
        "rateLimited",
      ],
      properties: {
        apiCalls: { type: "number" },
        windowsFetched: { type: "number" },
        itemsSeen: { type: "number" },
        itemsInserted: { type: "number" },
        itemsUpdated: { type: "number" },
        itemsSkipped: { type: "number" },
        rateLimited: { type: "number" },
      },
    },
    summary: ledgerSummaryResponseSchema,
  },
} as const;

const syncRunsResponseSchema = {
  type: "array",
  items: syncRunResponseSchema,
} as const;

const localApiErrorResponseSchema = {
  type: "object",
  required: ["error", "message"],
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    upstreamStatus: { type: "number" },
  },
} as const;

const webhookEventResponseSchema = {
  type: "object",
  required: ["id", "profile", "accountId", "type", "receivedAt"],
  properties: {
    id: { type: "string" },
    profile: { type: "string" },
    accountId: { type: "string" },
    type: { type: "string" },
    statementItemId: { type: "string" },
    status: {
      type: "string",
      enum: ["pending", "processed", "duplicate", "ignored", "failed"],
    },
    receivedAt: { type: "string" },
    processedAt: { type: "string" },
  },
} as const;

const defaultWebhookRateLimitMaxRequests = 30;
const defaultWebhookRateLimitWindowMs = 60_000;

const webhookEventsResponseSchema = {
  type: "array",
  items: webhookEventResponseSchema,
} as const;

const webhookAcceptedResponseSchema = {
  type: "object",
  required: ["accepted", "pullRequired", "event"],
  properties: {
    accepted: { const: true },
    pullRequired: { const: true },
    event: webhookEventResponseSchema,
  },
} as const;

const webhookValidationResponseSchema = {
  type: "string",
} as const;

const ledgerEntriesQuerySchema = {
  type: "object",
  properties: {
    accountId: { type: "string" },
    categoryId: { type: "string" },
    merchantName: { type: "string" },
    status: { type: "string", enum: ["hold", "posted"] },
    amountMin: { type: "integer" },
    amountMax: { type: "integer" },
    search: { type: "string" },
    from: { type: "integer", minimum: 0 },
    to: { type: "integer", minimum: 0 },
    limit: { type: "integer", minimum: 1 },
    offset: { type: "integer", minimum: 0 },
    sortBy: { type: "string", enum: [...ledgerEntrySortFields] },
    sortDirection: { type: "string", enum: [...ledgerEntrySortDirections] },
  },
} as const;

const ledgerExportQuerySchema = {
  type: "object",
  properties: {
    format: { type: "string" },
    preset: { type: "string" },
    from: { type: "integer", minimum: 0 },
    to: { type: "integer", minimum: 0 },
    accountId: { type: "string" },
    categoryId: { type: "string" },
    tag: { type: "string" },
  },
} as const;

const localConfigurationImportBodySchema = {
  type: "object",
  additionalProperties: true,
} as const;

const localConfigurationImportResponseSchema = {
  type: "object",
  required: ["imported"],
  properties: {
    imported: {
      type: "object",
      required: [
        "categories",
        "categoryRules",
        "budgets",
        "budgetPeriods",
        "tags",
      ],
      properties: {
        categories: { type: "number" },
        categoryRules: { type: "number" },
        budgets: { type: "number" },
        budgetPeriods: { type: "number" },
        tags: { type: "number" },
      },
    },
  },
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function currencyLabel(currencyCode: number): string {
  switch (currencyCode) {
    case 840:
      return "USD";
    case 978:
      return "EUR";
    case 980:
      return "UAH";
    default:
      return String(currencyCode);
  }
}

function formatMinorAmount(amount: number, currencyCode: number): string {
  const normalizedAmount = amount / 100;

  return `${normalizedAmount.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} ${currencyLabel(currencyCode)}`;
}

function resolveProfile(options: LocalApiServerOptions): string {
  return options.profile?.trim() || "default";
}

function resolveConfiguredSource(
  options: LocalApiServerOptions,
): LedgerSource | undefined {
  if (options.source !== undefined) {
    return options.source;
  }

  const envSource = process.env.MONO_LEDGER_SYNC_SOURCE?.trim();

  if (!envSource) {
    return undefined;
  }

  if (!isLedgerSource(envSource)) {
    throw new DomainError(
      "MONO_LEDGER_SYNC_SOURCE must be fixture or monobank.",
      "config_invalid",
      "config",
      { field: "MONO_LEDGER_SYNC_SOURCE" },
    );
  }

  return envSource;
}

function resolveSource(options: LocalApiServerOptions): LedgerSource {
  return resolveConfiguredSource(options) ?? "monobank";
}

function resolveDataDir(options: LocalApiServerOptions): string {
  return (
    options.dataDir ??
    process.env.MONO_LEDGER_SYNC_DATA_DIR ??
    path.join(os.homedir(), ".mono-ledger-sync")
  );
}

function resolveMonobankToken(
  options: LocalApiServerOptions,
): string | undefined {
  if (options.monobankToken !== undefined) {
    const normalized = options.monobankToken.trim();

    return normalized || undefined;
  }

  const envToken = process.env.MONOBANK_TOKEN?.trim();

  return envToken || undefined;
}

function resolveMonobankBaseUrl(
  options: LocalApiServerOptions,
): string | undefined {
  const envBaseUrl = process.env.MONOBANK_BASE_URL?.trim();
  const normalizedEnv = envBaseUrl || undefined;
  const normalizedOption = options.monobankBaseUrl?.trim();

  return normalizedOption || normalizedEnv;
}

function createMissingMonobankTokenAdapter(): MonobankAdapter {
  const createError = (): DomainError =>
    new DomainError(
      "Monobank source is configured, but no token is provided. Set MONOBANK_TOKEN or pass monobankToken.",
      "auth_required",
      "auth",
      { source: "monobank" },
    );

  async function throwOnUse(): Promise<never> {
    throw createError();
  }

  return {
    async getClientInfo() {
      return throwOnUse();
    },
    async getStatement() {
      return throwOnUse();
    },
    async getCurrency() {
      return throwOnUse();
    },
    async setWebhook() {
      return throwOnUse();
    },
  };
}

function safeProfileFileName(profile: string): string {
  return profile.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

export function resolveLocalLedgerDatabasePath(
  options: LocalApiServerOptions = {},
): string {
  const profile = resolveProfile(options);
  const fileName = `${safeProfileFileName(profile) || "default"}.sqlite`;

  return path.join(resolveDataDir(options), fileName);
}

async function createServices(
  options: LocalApiServerOptions,
  source: LedgerSource,
  monobankToken: string | undefined,
  monobankBaseUrl: string | undefined,
  monobankRateLimitState: MonobankRateLimitState,
): Promise<LocalAppServices> {
  const profile = resolveProfile(options);
  const dataDir = resolveDataDir(options);
  const databasePath = resolveLocalLedgerDatabasePath(options);
  const adapter =
    source === "fixture"
      ? await createBundledFixtureMonobankAdapter()
      : monobankToken === undefined
        ? createMissingMonobankTokenAdapter()
        : createMonobankHttpAdapter({
            token: monobankToken,
            ...(monobankBaseUrl === undefined
              ? {}
              : { baseUrl: monobankBaseUrl }),
            rateLimitState: monobankRateLimitState,
          });
  const db = createSqliteLedgerDb({
    filePath: databasePath,
    profile,
  });

  await db.migrate();

  return {
    profile,
    source,
    dataDir,
    databasePath,
    db,
    adapter,
    queryService: createLedgerQueryService({ db, defaultProfile: profile }),
    writeService: createLedgerWriteService({ db, defaultProfile: profile }),
  };
}

function readNumberQuery(value: unknown): number | undefined {
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

function readStringQuery(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return readStringQuery(value[0]);
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  return value;
}

function readUtcDateQuery(value: unknown, field: string): Date | undefined {
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

function isLedgerEntrySortField(
  value: string | undefined,
): value is LedgerEntrySortField {
  return ledgerEntrySortFields.includes(value as LedgerEntrySortField);
}

function isLedgerEntrySortDirection(
  value: string | undefined,
): value is LedgerEntrySortDirection {
  return ledgerEntrySortDirections.includes(value as LedgerEntrySortDirection);
}

function readLedgerEntryAnnotationUpdate(
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

function readLedgerEntryBulkEditUpdate(body: unknown): {
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

function readLedgerEntryCategoryRestoreEntries(
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

function readLedgerEntrySplitPlanUpdate(
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

function readMonthlyCategoryBudgetInput(
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

function renderLocalApiBootstrap(profile: string): string {
  const escapedProfile = escapeHtml(profile);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>mono-ledger-sync</title>
    <style>
      :root {
        color-scheme: light;
        --background: #ffffff;
        --foreground: #111722;
        --muted: #5c626b;
        --border: #dfe4ec;
        --primary: #05962f;
        --primary-dark: #047827;
        --surface: #f7f9fb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--background);
        color: var(--foreground);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
        line-height: 1.5;
      }
      main {
        display: grid;
        gap: 16px;
        margin: 0 auto;
        max-width: 720px;
        min-height: 100vh;
        padding: 32px 20px;
        place-content: center;
      }
      h1, p { margin: 0; }
      h1 {
        font-size: 28px;
        letter-spacing: 0;
        line-height: 1.1;
      }
      .panel {
        border: 1px solid var(--border);
        border-radius: 8px;
        display: grid;
        gap: 12px;
        padding: 18px;
      }
      .muted { color: var(--muted); }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .button {
        align-items: center;
        border: 1px solid var(--primary);
        border-radius: 6px;
        color: #fff;
        background: var(--primary);
        display: inline-flex;
        font-weight: 650;
        justify-content: center;
        min-height: 34px;
        padding: 7px 12px;
        text-decoration: none;
      }
      .button.secondary {
        background: #fff;
        border-color: var(--border);
        color: var(--foreground);
      }
      code {
        background: var(--surface);
        border-radius: 4px;
        padding: 2px 5px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="panel">
        <p class="muted">Profile ${escapedProfile}</p>
        <h1>Local Monobank ledger API is running</h1>
        <p class="muted">The production web bundle was not found in this build output. Start the Vite web client or run the production build to load the full app. Data routes are served from the local API and sync uses the saved Monobank token.</p>
        <div class="actions">
          <a class="button" href="https://api.monobank.ua/" target="_blank" rel="noopener noreferrer">Get Monobank token</a>
          <a class="button secondary" href="/api/app/config">Open app config JSON</a>
          <a class="button secondary" href="/api/health">Open health JSON</a>
        </div>
      </div>
    </main>
  </body>
</html>`;
}

function contentTypeForAsset(filePath: string): string {
  switch (path.extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".ico":
      return "image/x-icon";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

async function readBuiltWebIndex(): Promise<string | undefined> {
  try {
    return await readFile(path.join(localWebBuildDir, "index.html"), "utf8");
  } catch {
    return undefined;
  }
}

async function readBuiltWebAsset(
  assetPath: string,
): Promise<{ body: Buffer; contentType: string } | undefined> {
  const resolvedPath = path.resolve(localWebAssetsDir, assetPath);

  if (!resolvedPath.startsWith(`${localWebAssetsDir}${path.sep}`)) {
    return undefined;
  }

  try {
    return {
      body: await readFile(resolvedPath),
      contentType: contentTypeForAsset(resolvedPath),
    };
  } catch {
    return undefined;
  }
}

function requestPathname(url: string): string {
  return new URL(url, "http://local").pathname;
}

function requestCanBypassAccessGuard(
  method: string,
  url: string,
  localWebhookRoutePath: LocalWebhookRoutePath,
): boolean {
  return method === "POST" && requestPathname(url) === localWebhookRoutePath;
}

function registerLocalApiAccessGuard(
  app: FastifyInstance,
  access: LocalApiAccessControl,
  localWebhookRoutePath: LocalWebhookRoutePath,
): void {
  if (access.authentication === "none") {
    return;
  }

  const passcode = access.passcode;

  if (passcode === undefined) {
    throw new DomainError(
      "External Local API binding requires an access passcode.",
      "config_invalid",
      "config",
      { field: "accessPasscode", host: access.host, localOnly: false },
    );
  }

  app.addHook("onRequest", async (request, reply) => {
    if (
      requestCanBypassAccessGuard(
        request.method,
        request.url,
        localWebhookRoutePath,
      )
    ) {
      return;
    }

    if (requestHasAccessPasscode(request.headers, passcode)) {
      return;
    }

    reply
      .code(401)
      .header(
        "www-authenticate",
        `Basic realm="${localApiAccessBasicRealm}", charset="UTF-8"`,
      )
      .send({
        error: "access_auth_required",
        message: "Local API access passcode is required.",
      });
  });
}

function registerLocalApiRoutes(
  app: FastifyInstance,
  options: LocalApiServerOptions,
  localApiAccess: LocalApiAccessBinding,
  getServices: () => Promise<LocalAppServices>,
  getMonobankToken: () => string | undefined,
  saveMonobankToken: (
    token: string,
    profile: string,
  ) => Promise<LocalApiMonobankTokenStatus>,
  recheckMonobankToken: (
    profile: string,
  ) => Promise<LocalApiMonobankTokenStatus>,
  removeMonobankToken: () => Promise<LocalApiMonobankTokenStatus>,
  setSource: (source: LedgerSource) => Promise<void>,
  getMonobankTokenStoreStatus: (
    profile: string,
  ) => Promise<
    Pick<
      LocalApiMonobankTokenStatus,
      "storage" | "persistence" | "fallbackReason"
    >
  >,
  localWebhookRoutePath: LocalWebhookRoutePath,
  resolveWebhookSettings: () => Omit<
    LocalApiWebhookSettings,
    "enabled" | "path"
  >,
  monobankRateLimitState: MonobankRateLimitState,
): void {
  const now = options.now ?? (() => Date.now());
  const webhookRateLimitWindowMs =
    options.webhookRateLimitWindowMs ?? defaultWebhookRateLimitWindowMs;
  const webhookRateLimitMaxRequests =
    options.webhookRateLimitMaxRequests ?? defaultWebhookRateLimitMaxRequests;
  const webhookRateLimitState = new Map<
    string,
    { windowStart: number; requestCount: number }
  >();
  const malformedWebhookRateLimitState = new Map<
    string,
    { windowStart: number; requestCount: number }
  >();

  function isWebhookRateLimited(
    stateByKey: Map<string, { windowStart: number; requestCount: number }>,
    key: string,
  ): boolean {
    const current = now();
    const state = stateByKey.get(key);

    if (!state || current - state.windowStart >= webhookRateLimitWindowMs) {
      stateByKey.set(key, {
        windowStart: current,
        requestCount: 1,
      });

      return false;
    }

    if (state.requestCount >= webhookRateLimitMaxRequests) {
      return true;
    }

    state.requestCount += 1;

    return false;
  }

  function isMalformedWebhookRateLimited(profile: string, ip: string): boolean {
    return isWebhookRateLimited(
      malformedWebhookRateLimitState,
      `${profile}:malformed:${ip}`,
    );
  }

  function isWebhookAccountRateLimited(
    profile: string,
    accountId: string,
  ): boolean {
    return isWebhookRateLimited(
      webhookRateLimitState,
      `${profile}:account:${accountId}`,
    );
  }

  function webhookDeliveryMetadata(
    headers: Record<string, unknown>,
    ip: string,
  ): Record<string, string> {
    const readHeader = (
      value: string | string[] | undefined,
    ): string | undefined => {
      if (!value) {
        return undefined;
      }

      return Array.isArray(value) ? value[0] : value;
    };

    const metadata: Record<string, string> = {};
    const deliveryId =
      readHeader(
        headers["x-monobank-delivery-id"] as string | string[] | undefined,
      ) ??
      readHeader(
        headers["x-monobank-webhook-id"] as string | string[] | undefined,
      ) ??
      readHeader(headers["x-request-id"] as string | string[] | undefined);

    if (deliveryId !== undefined) {
      metadata.deliveryId = deliveryId;
    }

    const userAgent = readHeader(
      headers["user-agent"] as string | string[] | undefined,
    );

    if (userAgent !== undefined) {
      metadata.userAgent = userAgent;
    }

    if (ip) {
      metadata.sourceIp = ip;
    }

    return metadata;
  }

  async function readAppConfig(): Promise<LocalApiAppConfig> {
    const services = await getServices();
    const monobankToken = getMonobankToken();
    const tokenStoreStatus = await getMonobankTokenStoreStatus(
      services.profile,
    );
    const syncRuns = await services.db.listSyncRuns(services.profile, 1);
    const lastSuccessfulRun = syncRuns.find((run) => run.status === "success");
    const lastSyncedAt = lastSuccessfulRun?.startedAt;
    const nextSyncAllowedAt = monobankRateLimitState.getNextAllowedAt(
      "personal",
      Date.now(),
    );
    const personalEverCalled =
      monobankRateLimitState.getNextAllowedAt(
        "personal",
        Number.NEGATIVE_INFINITY,
      ) > Number.NEGATIVE_INFINITY;

    return {
      profile: services.profile,
      source: services.source,
      dataDir: services.dataDir,
      databasePath: services.databasePath,
      localOnly: localApiAccess.localOnly,
      access: localApiAccess,
      token: {
        profile: services.profile,
        hasToken: monobankToken !== undefined,
        ...tokenStoreStatus,
      },
      webhook: {
        enabled: true,
        path: localWebhookRoutePath,
        ...resolveWebhookSettings(),
      },
      sync: {
        ...(lastSyncedAt !== undefined ? { lastSyncedAt } : {}),
        ...(personalEverCalled ? { nextSyncAllowedAt } : {}),
      },
    };
  }

  app.get("/", async (_request, reply): Promise<string> => {
    const builtWebIndex = await readBuiltWebIndex();

    if (builtWebIndex) {
      reply.type("text/html; charset=utf-8");

      return builtWebIndex;
    }

    reply.type("text/html; charset=utf-8");

    return renderLocalApiBootstrap(resolveProfile(options));
  });

  app.get("/assets/*", async (request, reply): Promise<Buffer | void> => {
    const params = request.params as { "*": string };
    const asset = await readBuiltWebAsset(params["*"]);

    if (!asset) {
      reply.code(404).send();
      return;
    }

    reply.type(asset.contentType);

    return asset.body;
  });

  app.get("/favicon.ico", async (_request, reply): Promise<void> => {
    reply.code(204).send();
  });

  app.get(
    `${localApiRoutePrefix}/health`,
    {
      schema: {
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async (): Promise<LocalApiHealth> => ({
      status: "ok",
      localOnly: localApiAccess.localOnly,
      version,
      framework: localApiServerFramework,
      apiPrefix: localApiRoutePrefix,
      architecture: productArchitecture,
    }),
  );

  app.get(
    `${localApiRoutePrefix}/app/config`,
    {
      schema: {
        response: {
          200: appConfigResponseSchema,
        },
      },
    },
    async (): Promise<LocalApiAppConfig> => readAppConfig(),
  );

  app.post(
    `${localApiRoutePrefix}/app/workspace`,
    {
      schema: {
        response: {
          200: appConfigResponseSchema,
        },
      },
    },
    async (): Promise<LocalApiAppConfig> => {
      const services = await getServices();

      await services.db.migrate();
      await services.db.updateLocalAppSettings(services.profile, {
        source: services.source,
      });

      return readAppConfig();
    },
  );

  app.post(
    `${localApiRoutePrefix}/app/source`,
    {
      schema: {
        body: appSourceBodySchema,
        response: {
          200: appConfigResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<LocalApiAppConfig | { error: string; message: string }> => {
      const body = request.body as { source: LedgerSource };

      try {
        await setSource(body.source);
        return readAppConfig();
      } catch (error) {
        if (error instanceof DomainError) {
          reply.code(400);
          return {
            error: error.code,
            message: error.message,
          };
        }

        throw error;
      }
    },
  );

  app.post(
    `${localApiRoutePrefix}/app/token`,
    {
      schema: {
        body: monobankTokenBodySchema,
        response: {
          200: monobankTokenResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      LocalApiMonobankTokenStatus | { error: string; message: string }
    > => {
      const body = request.body as
        | { profile?: string; token: string }
        | undefined;
      const profile = resolveProfile(options);
      const token = body?.token?.trim();

      if (token === undefined || token.length === 0) {
        reply.code(400);

        return {
          error: "invalid_token",
          message: "Monobank token must be a non-empty string.",
        };
      }

      if (/\s/.test(token)) {
        reply.code(400);

        return {
          error: "invalid_token",
          message: "Monobank token must not contain whitespace.",
        };
      }

      if (body?.profile !== undefined && body.profile !== profile) {
        reply.code(400);

        return {
          error: "config_invalid",
          message: `Monobank token profile must match ${profile}.`,
        };
      }

      const result = await saveMonobankToken(token, profile);

      if ("error" in result) {
        reply.code(400);
        return result;
      }

      return result;
    },
  );

  app.delete(
    `${localApiRoutePrefix}/app/token`,
    {
      schema: {
        response: {
          200: monobankTokenResponseSchema,
        },
      },
    },
    async (): Promise<LocalApiMonobankTokenStatus> => removeMonobankToken(),
  );

  app.post(
    `${localApiRoutePrefix}/app/token/recheck`,
    {
      schema: {
        response: {
          200: monobankTokenResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      _request,
      reply,
    ): Promise<
      LocalApiMonobankTokenStatus | { error: string; message: string }
    > => {
      const profile = resolveProfile(options);
      const result = await recheckMonobankToken(profile);

      if ("error" in result) {
        reply.code(400);
        return result;
      }

      return result;
    },
  );

  app.patch(
    `${localApiRoutePrefix}/ledger/budgets/monthly/:id/close`,
    {
      schema: {
        params: deleteMonthlyBudgetParamsSchema,
        response: {
          200: { type: "object", additionalProperties: true },
          400: localApiErrorResponseSchema,
          404: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<BudgetProgress | { error: string; message: string }> => {
      const services = await getServices();
      const params = request.params as { id?: string };
      const budgetPeriodId = params.id?.trim() ?? "";

      if (!budgetPeriodId) {
        reply.code(400);

        return {
          error: "invalid_budget",
          message: "Budget period ID is required.",
        };
      }

      try {
        const progress = await services.writeService.closeMonthlyBudgetPeriod(
          budgetPeriodId,
          services.profile,
        );

        if (progress === undefined) {
          reply.code(404);

          return {
            error: "budget_not_found",
            message: "Monthly budget period could not be found.",
          };
        }

        return progress;
      } catch (error) {
        reply.code(400);

        return {
          error: "invalid_budget",
          message:
            error instanceof Error
              ? error.message
              : "Monthly budget period could not be closed.",
        };
      }
    },
  );

  app.patch(
    `${localApiRoutePrefix}/ledger/budgets/monthly/:id/reopen`,
    {
      schema: {
        params: deleteMonthlyBudgetParamsSchema,
        response: {
          200: { type: "object", additionalProperties: true },
          400: localApiErrorResponseSchema,
          404: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<BudgetProgress | { error: string; message: string }> => {
      const services = await getServices();
      const params = request.params as { id?: string };
      const budgetPeriodId = params.id?.trim() ?? "";

      if (!budgetPeriodId) {
        reply.code(400);

        return {
          error: "invalid_budget",
          message: "Budget period ID is required.",
        };
      }

      try {
        const progress = await services.writeService.reopenMonthlyBudgetPeriod(
          budgetPeriodId,
          services.profile,
        );

        if (progress === undefined) {
          reply.code(404);

          return {
            error: "budget_not_found",
            message: "Monthly budget period could not be found.",
          };
        }

        return progress;
      } catch (error) {
        reply.code(400);

        return {
          error: "invalid_budget",
          message:
            error instanceof Error
              ? error.message
              : "Monthly budget period could not be reopened.",
        };
      }
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/summary`,
    {
      schema: {
        response: {
          200: ledgerSummaryResponseSchema,
        },
      },
    },
    async (): Promise<LedgerSummary> => {
      const services = await getServices();

      return services.queryService.getLedgerSummary(services.profile);
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/net-worth-trend`,
    {
      schema: {
        response: {
          200: netWorthTrendResponseSchema,
        },
      },
    },
    async (): Promise<NetWorthTrend> => {
      const services = await getServices();

      return services.queryService.getNetWorthTrend(services.profile);
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/accounts`,
    {
      schema: {
        response: {
          200: ledgerAccountsResponseSchema,
        },
      },
    },
    async (): Promise<readonly LedgerAccount[]> => {
      const services = await getServices();

      return services.queryService.listAccounts(services.profile);
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/jars`,
    {
      schema: {
        response: {
          200: ledgerJarsResponseSchema,
        },
      },
    },
    async (): Promise<readonly LedgerJar[]> => {
      const services = await getServices();

      return services.queryService.listJars(services.profile);
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/savings-goal-progress`,
    {
      schema: {
        response: {
          200: savingsGoalProgressResponseSchema,
        },
      },
    },
    async (): Promise<readonly SavingsGoalProgress[]> => {
      const services = await getServices();

      return services.queryService.listSavingsGoalProgress(services.profile);
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/categories`,
    {
      schema: {
        response: {
          200: ledgerCategoriesResponseSchema,
        },
      },
    },
    async (): Promise<readonly Category[]> => {
      const services = await getServices();

      return services.queryService.listCategories(services.profile);
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/category-rules`,
    {
      schema: {
        response: {
          200: ledgerCategoryRulesResponseSchema,
        },
      },
    },
    async (): Promise<readonly CategoryRule[]> => {
      const services = await getServices();

      return services.queryService.listCategoryRules(services.profile);
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/merchant-cleanup-rules`,
    {
      schema: {
        response: {
          200: merchantCleanupRulesResponseSchema,
        },
      },
    },
    async (): Promise<readonly MerchantCleanupRule[]> => {
      const services = await getServices();

      return services.queryService.listMerchantCleanupRules(services.profile);
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/category-spending`,
    {
      schema: {
        response: {
          200: ledgerCategorySpendingResponseSchema,
        },
      },
    },
    async (): Promise<readonly LedgerCategorySpending[]> => {
      const services = await getServices();

      return services.queryService.listCategorySpending(services.profile);
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/reports/monthly-spending`,
    {
      schema: {
        querystring: monthlySpendingReportQuerySchema,
        response: {
          200: monthlySpendingReportResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | MonthlySpendingReport
      | {
          error: string;
          message: string;
        }
    > => {
      const services = await getServices();
      const query = request.query as Record<string, string | string[]>;
      const month = readStringQuery(query.month);

      try {
        return await services.queryService.getMonthlySpendingReport(
          services.profile,
          month,
        );
      } catch (error) {
        reply.code(400);

        return {
          error: "invalid_monthly_spending_report_query",
          message:
            error instanceof Error
              ? error.message
              : "Monthly spending report could not be generated.",
        };
      }
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/reports/cashflow`,
    {
      schema: {
        querystring: cashflowReportQuerySchema,
        response: {
          200: cashflowReportResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | CashflowReport
      | {
          error: string;
          message: string;
        }
    > => {
      const services = await getServices();
      const query = request.query as Record<string, string | string[]>;
      const months = readNumberQuery(query.months);

      try {
        return await services.queryService.getCashflowReport(
          services.profile,
          months,
        );
      } catch (error) {
        reply.code(400);

        return {
          error: "invalid_cashflow_report_query",
          message:
            error instanceof Error
              ? error.message
              : "Cashflow report could not be generated.",
        };
      }
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/reports/savings-rate`,
    {
      schema: {
        querystring: savingsRateReportQuerySchema,
        response: {
          200: savingsRateReportResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | SavingsRateReport
      | {
          error: string;
          message: string;
        }
    > => {
      const services = await getServices();
      const query = request.query as Record<string, string | string[]>;
      const months = readNumberQuery(query.months);

      try {
        return await services.queryService.getSavingsRateReport(
          services.profile,
          months,
        );
      } catch (error) {
        reply.code(400);

        return {
          error: "invalid_savings_rate_report_query",
          message:
            error instanceof Error
              ? error.message
              : "Savings rate report could not be generated.",
        };
      }
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/reports/balance-projection`,
    {
      schema: {
        querystring: balanceProjectionReportQuerySchema,
        response: {
          200: balanceProjectionReportResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | BalanceProjectionReport
      | {
          error: string;
          message: string;
        }
    > => {
      const services = await getServices();
      const query = request.query as Record<string, string | string[]>;
      const days = readNumberQuery(query.days);

      try {
        return await services.queryService.getBalanceProjectionReport(
          services.profile,
          days,
        );
      } catch (error) {
        reply.code(400);

        return {
          error: "invalid_balance_projection_report_query",
          message:
            error instanceof Error
              ? error.message
              : "Balance projection report could not be generated.",
        };
      }
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/reports/category-trends`,
    {
      schema: {
        querystring: categoryTrendReportQuerySchema,
        response: {
          200: categoryTrendReportResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | CategoryTrendReport
      | {
          error: string;
          message: string;
        }
    > => {
      const services = await getServices();
      const query = request.query as Record<string, string | string[]>;
      const months = readNumberQuery(query.months);

      try {
        return await services.queryService.getCategoryTrendReport(
          services.profile,
          months,
        );
      } catch (error) {
        reply.code(400);

        return {
          error: "invalid_category_trend_report_query",
          message:
            error instanceof Error
              ? error.message
              : "Category trend report could not be generated.",
        };
      }
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/reports/merchant-trends`,
    {
      schema: {
        querystring: merchantTrendReportQuerySchema,
        response: {
          200: merchantTrendReportResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | MerchantTrendReport
      | {
          error: string;
          message: string;
        }
    > => {
      const services = await getServices();
      const query = request.query as Record<string, string | string[]>;
      const months = readNumberQuery(query.months);

      try {
        return await services.queryService.getMerchantTrendReport(
          services.profile,
          months,
        );
      } catch (error) {
        reply.code(400);

        return {
          error: "invalid_merchant_trend_report_query",
          message:
            error instanceof Error
              ? error.message
              : "Merchant trend report could not be generated.",
        };
      }
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/upcoming-recurring-payments`,
    {
      schema: {
        response: {
          200: upcomingRecurringPaymentsResponseSchema,
        },
      },
    },
    async (): Promise<readonly UpcomingRecurringPayment[]> => {
      const services = await getServices();

      return services.queryService.listUpcomingRecurringPayments(
        services.profile,
      );
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/missed-recurring-payments`,
    {
      schema: {
        querystring: missedRecurringPaymentsQuerySchema,
        response: {
          200: missedRecurringPaymentsResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | readonly MissedRecurringPayment[]
      | {
          error: string;
          message: string;
        }
    > => {
      const query = request.query as Record<string, string | string[]>;

      try {
        const asOf = readUtcDateQuery(query.asOf, "asOf");
        const services = await getServices();

        return await services.queryService.listMissedRecurringPayments(
          services.profile,
          asOf,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Missed recurring payment query is invalid.";

        if (!/^asOf must /.test(message)) {
          throw error;
        }

        reply.code(400);

        return {
          error: "invalid_missed_recurring_payments_query",
          message,
        };
      }
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/subscription-increase-alerts`,
    {
      schema: {
        querystring: subscriptionIncreaseAlertsQuerySchema,
        response: {
          200: subscriptionIncreaseAlertsResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | readonly SubscriptionIncreaseAlert[]
      | {
          error: string;
          message: string;
        }
    > => {
      const query = request.query as Record<string, string | string[]>;

      try {
        const asOf = readUtcDateQuery(query.asOf, "asOf");
        const services = await getServices();

        return await services.queryService.listSubscriptionIncreaseAlerts(
          services.profile,
          asOf,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Subscription increase alert query is invalid.";

        if (!/^asOf must /.test(message)) {
          throw error;
        }

        reply.code(400);

        return {
          error: "invalid_subscription_increase_alerts_query",
          message,
        };
      }
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/recurring-detections`,
    {
      schema: {
        response: {
          200: recurringDetectionCandidatesResponseSchema,
        },
      },
    },
    async (): Promise<readonly RecurringDetectionCandidate[]> => {
      const services = await getServices();

      return services.queryService.detectRecurringTransactions(
        services.profile,
      );
    },
  );

  app.post(
    `${localApiRoutePrefix}/ledger/recurring-detections/:id/confirm`,
    {
      schema: {
        params: recurringDetectionDecisionParamsSchema,
        response: {
          200: recurringDetectionDecisionResponseSchema,
          400: localApiErrorResponseSchema,
          404: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | RecurringDetectionDecisionResult
      | {
          error: string;
          message: string;
        }
    > => {
      const params = request.params as { id?: string };
      const candidateId = params.id?.trim() ?? "";

      try {
        const services = await getServices();

        return await services.writeService.confirmRecurringDetection(
          candidateId,
          services.profile,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Recurring detection candidate could not be confirmed.";

        if (/was not found/.test(message)) {
          reply.code(404);

          return {
            error: "recurring_detection_not_found",
            message,
          };
        }

        reply.code(400);

        return {
          error: "invalid_recurring_detection_decision",
          message,
        };
      }
    },
  );

  app.post(
    `${localApiRoutePrefix}/ledger/recurring-detections/:id/ignore`,
    {
      schema: {
        params: recurringDetectionDecisionParamsSchema,
        response: {
          200: recurringDetectionDecisionResponseSchema,
          400: localApiErrorResponseSchema,
          404: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | RecurringDetectionDecisionResult
      | {
          error: string;
          message: string;
        }
    > => {
      const params = request.params as { id?: string };
      const candidateId = params.id?.trim() ?? "";

      try {
        const services = await getServices();

        return await services.writeService.ignoreRecurringDetection(
          candidateId,
          services.profile,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Recurring detection candidate could not be ignored.";

        if (/was not found/.test(message)) {
          reply.code(404);

          return {
            error: "recurring_detection_not_found",
            message,
          };
        }

        reply.code(400);

        return {
          error: "invalid_recurring_detection_decision",
          message,
        };
      }
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/recurring-calendar`,
    {
      schema: {
        querystring: recurringCalendarQuerySchema,
        response: {
          200: recurringCalendarResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | readonly RecurringCalendarEvent[]
      | {
          error: string;
          message: string;
        }
    > => {
      const query = request.query as Record<string, string | string[]>;

      try {
        const from = readUtcDateQuery(query.from, "from");
        const to = readUtcDateQuery(query.to, "to");
        const services = await getServices();

        return await services.queryService.listRecurringCalendar(
          services.profile,
          from,
          to,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Recurring calendar range is invalid.";

        if (!/^(from|to) must |^Recurring calendar range /.test(message)) {
          throw error;
        }

        reply.code(400);

        return {
          error: "invalid_recurring_calendar_range",
          message,
        };
      }
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/budget-progress`,
    {
      schema: {
        response: {
          200: budgetProgressResponseSchema,
        },
      },
    },
    async (): Promise<readonly BudgetProgress[]> => {
      const services = await getServices();

      return services.queryService.listBudgetProgress(services.profile);
    },
  );

  app.post(
    `${localApiRoutePrefix}/ledger/budgets/monthly`,
    {
      schema: {
        body: monthlyCategoryBudgetBodySchema,
        response: {
          200: { type: "object", additionalProperties: true },
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<BudgetProgress | { error: string; message: string }> => {
      const services = await getServices();

      try {
        return await services.writeService.createMonthlyCategoryBudget(
          readMonthlyCategoryBudgetInput(request.body),
          services.profile,
        );
      } catch (error) {
        reply.code(400);

        return {
          error: "invalid_budget",
          message:
            error instanceof Error
              ? error.message
              : "Monthly category budget could not be created.",
        };
      }
    },
  );

  app.delete(
    `${localApiRoutePrefix}/ledger/budgets/monthly/:id`,
    {
      schema: {
        params: deleteMonthlyBudgetParamsSchema,
        response: {
          200: {
            type: "object",
            required: ["deleted"],
            properties: {
              deleted: { type: "boolean" },
            },
          },
          400: localApiErrorResponseSchema,
          404: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<{ deleted: true } | { error: string; message: string }> => {
      const services = await getServices();
      const params = request.params as { id?: string };
      const budgetPeriodId = params.id?.trim() ?? "";

      if (!budgetPeriodId) {
        reply.code(400);

        return {
          error: "invalid_budget",
          message: "Budget period ID is required.",
        };
      }

      try {
        const deleted = await services.writeService.deleteMonthlyCategoryBudget(
          budgetPeriodId,
          services.profile,
        );

        if (!deleted) {
          reply.code(404);

          return {
            error: "budget_not_found",
            message: "Monthly budget period could not be found.",
          };
        }

        return { deleted: true };
      } catch (error) {
        reply.code(400);

        return {
          error: "invalid_budget",
          message:
            error instanceof Error
              ? error.message
              : "Monthly category budget could not be deleted.",
        };
      }
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/transactions`,
    {
      schema: {
        querystring: ledgerEntriesQuerySchema,
        response: {
          200: ledgerEntriesPageResponseSchema,
        },
      },
    },
    async (request): Promise<LedgerEntryPage> => {
      const services = await getServices();
      const query = request.query as Record<string, string | string[]>;
      const entryQuery = {
        profile: services.profile,
      };
      const accountId = readStringQuery(query.accountId);
      const categoryId = readStringQuery(query.categoryId);
      const merchantName = readStringQuery(query.merchantName);
      const status = readStringQuery(query.status);
      const amountMin = readNumberQuery(query.amountMin);
      const amountMax = readNumberQuery(query.amountMax);
      const search = readStringQuery(query.search);
      const from = readNumberQuery(query.from);
      const to = readNumberQuery(query.to);
      const limit = readNumberQuery(query.limit);
      const offset = readNumberQuery(query.offset);
      const sortBy = readStringQuery(query.sortBy);
      const sortDirection = readStringQuery(query.sortDirection);

      if (accountId) {
        Object.assign(entryQuery, { accountId });
      }

      if (categoryId) {
        Object.assign(entryQuery, { categoryId });
      }

      if (merchantName) {
        Object.assign(entryQuery, { merchantName });
      }

      if (status === "hold" || status === "posted") {
        Object.assign(entryQuery, { status });
      }

      if (amountMin !== undefined) {
        Object.assign(entryQuery, { amountMin });
      }

      if (amountMax !== undefined) {
        Object.assign(entryQuery, { amountMax });
      }

      if (search) {
        Object.assign(entryQuery, { search });
      }

      if (from !== undefined) {
        Object.assign(entryQuery, { from });
      }

      if (to !== undefined) {
        Object.assign(entryQuery, { to });
      }

      if (limit !== undefined) {
        Object.assign(entryQuery, { limit });
      }

      if (offset !== undefined) {
        Object.assign(entryQuery, { offset });
      }

      if (isLedgerEntrySortField(sortBy)) {
        Object.assign(entryQuery, { sortBy });
      }

      if (isLedgerEntrySortDirection(sortDirection)) {
        Object.assign(entryQuery, { sortDirection });
      }

      return services.queryService.listLedgerEntries(entryQuery);
    },
  );

  app.patch(
    `${localApiRoutePrefix}/ledger/transactions/bulk-edit`,
    {
      schema: {
        body: ledgerEntriesBulkEditBodySchema,
        response: {
          200: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
      },
    },
    async (request): Promise<readonly LedgerEntry[]> => {
      const services = await getServices();
      const { ids, update } = readLedgerEntryBulkEditUpdate(request.body);

      return services.writeService.updateTransactionsBulk(
        ids,
        update,
        services.profile,
      );
    },
  );

  app.patch(
    `${localApiRoutePrefix}/ledger/transactions/category-restore`,
    {
      schema: {
        body: ledgerEntryCategoryRestoreBodySchema,
        response: {
          200: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
      },
    },
    async (request): Promise<readonly LedgerEntry[]> => {
      const services = await getServices();
      const entries = readLedgerEntryCategoryRestoreEntries(request.body);

      return services.writeService.restoreTransactionCategories(
        entries,
        services.profile,
      );
    },
  );

  app.patch(
    `${localApiRoutePrefix}/ledger/transactions/:id/annotation`,
    {
      schema: {
        body: ledgerEntryAnnotationBodySchema,
        response: {
          200: { type: "object", additionalProperties: true },
          404: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<LedgerEntry | { error: string; message: string }> => {
      const services = await getServices();
      const params = request.params as { id?: string };
      const id = params.id?.trim();

      if (!id) {
        reply.code(404);
        return {
          error: "not_found",
          message: "Transaction was not found",
        };
      }

      const entry = await services.writeService.updateTransactionAnnotation(
        id,
        readLedgerEntryAnnotationUpdate(request.body),
        services.profile,
      );

      if (!entry) {
        reply.code(404);
        return {
          error: "not_found",
          message: "Transaction was not found",
        };
      }

      return entry;
    },
  );

  app.patch(
    `${localApiRoutePrefix}/ledger/transactions/:id/split-plan`,
    {
      schema: {
        body: ledgerEntrySplitPlanBodySchema,
        response: {
          200: { type: "object", additionalProperties: true },
          404: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<LedgerEntry | { error: string; message: string }> => {
      const services = await getServices();
      const params = request.params as { id?: string };
      const id = params.id?.trim();

      if (!id) {
        reply.code(404);
        return {
          error: "not_found",
          message: "Transaction was not found",
        };
      }

      const entry = await services.writeService.updateTransactionSplitPlan(
        id,
        readLedgerEntrySplitPlanUpdate(request.body),
        services.profile,
      );

      if (!entry) {
        reply.code(404);
        return {
          error: "not_found",
          message: "Transaction was not found",
        };
      }

      return entry;
    },
  );

  app.post(
    `${localApiRoutePrefix}/sync/run`,
    {
      schema: {
        response: {
          200: syncRunResultResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      _request,
      reply,
    ): Promise<SyncLedgerResult | { error: string; message: string }> => {
      const services = await getServices();
      const monobankToken = getMonobankToken();

      if (services.source === "monobank" && monobankToken === undefined) {
        reply.code(400);

        return {
          error: "auth_required",
          message:
            "Monobank source is configured, but no token is provided. Set MONOBANK_TOKEN or pass monobankToken.",
        };
      }

      const syncAbortController = createProcessSignalAbortController();

      try {
        return await syncLedgerWithMonobank({
          profile: services.profile,
          source: services.source,
          adapter: services.adapter,
          db: services.db,
          signal: syncAbortController.signal,
        });
      } finally {
        syncAbortController.dispose();
      }
    },
  );

  app.get(
    `${localApiRoutePrefix}/sync/runs`,
    {
      schema: {
        response: {
          200: syncRunsResponseSchema,
        },
      },
    },
    async (): Promise<readonly SyncRun[]> => {
      const services = await getServices();

      return services.queryService.listSyncRuns(services.profile);
    },
  );

  app.get(
    `${localApiRoutePrefix}/webhooks/events`,
    {
      schema: {
        response: {
          200: webhookEventsResponseSchema,
        },
      },
    },
    async (): Promise<readonly StoredWebhookEvent[]> => {
      const services = await getServices();

      return services.queryService.listWebhookEvents(services.profile, 20);
    },
  );

  app.get(
    localWebhookRoutePath,
    {
      schema: {
        response: {
          200: webhookValidationResponseSchema,
        },
      },
    },
    async (): Promise<string> => "ok",
  );

  app.post(
    localWebhookRoutePath,
    {
      schema: {
        response: {
          200: webhookAcceptedResponseSchema,
          400: localApiErrorResponseSchema,
          429: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | {
          accepted: true;
          pullRequired: true;
          event: StoredWebhookEvent;
        }
      | { error: string; message: string }
    > => {
      const services = await getServices();
      const webhookEvent = request.body;

      try {
        assertMonobankPersonalWebhookEvent(webhookEvent, "request.body");
      } catch (error) {
        if (error instanceof MonobankValidationError) {
          if (isMalformedWebhookRateLimited(services.profile, request.ip)) {
            reply.code(429);

            return {
              error: "webhook_rate_limit_exceeded",
              message:
                "Webhook endpoint rate limit exceeded. Retry with a short delay.",
            };
          }

          const logOptions =
            options.logSink === undefined ? {} : { logger: options.logSink };

          logStructured(
            "warn",
            "Rejected malformed webhook payload",
            {
              route: localWebhookRoutePath,
              path: error.path,
              expected: error.expected,
            },
            logOptions,
          );

          reply.code(400);

          return {
            error: "invalid_webhook_payload",
            message: "Webhook payload is malformed.",
          };
        }

        throw error;
      }

      const typedWebhookEvent = webhookEvent as MonobankPersonalWebhookEvent;

      if (
        isWebhookAccountRateLimited(
          services.profile,
          typedWebhookEvent.data.account,
        )
      ) {
        reply.code(429);

        return {
          error: "webhook_rate_limit_exceeded",
          message:
            "Webhook endpoint rate limit exceeded. Retry with a short delay.",
        };
      }

      const event = await services.db.recordWebhookEvent(
        typedWebhookEvent,
        undefined,
        webhookDeliveryMetadata(
          request.headers as Record<string, unknown>,
          request.ip,
        ),
      );

      return {
        accepted: true,
        pullRequired: true,
        event,
      };
    },
  );

  app.get(
    `${localApiRoutePrefix}/exports/ledger`,
    {
      schema: {
        querystring: ledgerExportQuerySchema,
        response: {
          200: { type: "string" },
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const services = await getServices();
      const query = request.query as Record<string, string | string[]>;
      const format = readStringQuery(query.format);
      const preset = readStringQuery(query.preset);
      const from = readNumberQuery(query.from);
      const to = readNumberQuery(query.to);
      const accountId = readStringQuery(query.accountId);
      const categoryId = readStringQuery(query.categoryId);

      if (format && (!isExportFormat(format) || format === "sqlite")) {
        reply.code(400);
        return {
          error: "unsupported_export_format",
          message: "Supported export formats: csv, json, jsonl, journal-csv",
        };
      }

      if (preset && !isExportPreset(preset)) {
        reply.code(400);
        return {
          error: "unsupported_export_preset",
          message: `Supported export presets: ${exportPresetNames.join(", ")}`,
        };
      }

      const ledgerExport = await createLedgerExport(services.db, {
        profile: services.profile,
        ...(format ? { format: format as ExportFormat } : {}),
        ...(preset ? { preset: preset as ExportPreset } : {}),
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
        ...(accountId ? { accountIds: [accountId] } : {}),
        ...(categoryId ? { categoryIds: [categoryId] } : {}),
        ...(readStringQuery(query.tag)
          ? { tag: readStringQuery(query.tag)! }
          : {}),
      });

      reply.header("content-type", ledgerExport.contentType);
      reply.header(
        "content-disposition",
        `attachment; filename="${ledgerExport.fileName}"`,
      );

      return ledgerExport.body;
    },
  );

  app.get(
    `${localApiRoutePrefix}/exports/local-configuration`,
    {
      schema: {
        response: {
          200: { type: "string" },
        },
      },
    },
    async (_request, reply) => {
      const services = await getServices();
      const configurationExport = await createLocalConfigurationExport(
        services.db,
        {
          profile: services.profile,
        },
      );

      reply.header("content-type", configurationExport.contentType);
      reply.header(
        "content-disposition",
        `attachment; filename="${configurationExport.fileName}"`,
      );

      return configurationExport.body;
    },
  );

  app.post(
    `${localApiRoutePrefix}/imports/local-configuration`,
    {
      schema: {
        body: localConfigurationImportBodySchema,
        response: {
          200: localConfigurationImportResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const services = await getServices();

      try {
        const configuration = parseLocalConfigurationImport(request.body);
        const imported = await services.db.importLocalConfiguration(
          services.profile,
          configuration,
        );

        return {
          imported,
        };
      } catch (error) {
        reply.code(400);
        return {
          error: "invalid_local_configuration_import",
          message: error instanceof Error ? error.message : "Invalid import",
        };
      }
    },
  );
}

export function createLocalApiServer(
  options: LocalApiServerOptions = {},
): LocalApiServer {
  const localApiAccessControl = resolveLocalApiAccessControl(options);
  const { passcode: _passcode, ...localApiAccess } = localApiAccessControl;
  const localApiHost = localApiAccess.host;
  const app = Fastify({
    logger: false,
  });
  let url: string | undefined;
  let servicesPromise: Promise<LocalAppServices> | undefined;
  let monobankToken = resolveMonobankToken(options);
  let monobankTokenSource: "runtime" | "store" | undefined =
    monobankToken === undefined ? undefined : "runtime";
  const shouldLoadStoredMonobankToken =
    options.monobankToken === undefined &&
    (process.env.MONOBANK_TOKEN === undefined ||
      process.env.MONOBANK_TOKEN.trim() === "");
  const monobankTokenStore =
    options.monobankTokenStore ?? createDefaultMonobankTokenStore();
  const monobankBaseUrl = resolveMonobankBaseUrl(options);
  const monobankRateLimitState: MonobankRateLimitState =
    createMonobankRateLimitState();
  const configuredSource = resolveConfiguredSource(options);
  let source = configuredSource ?? "monobank";
  let storedSettingsLoadPromise: Promise<void> | undefined;
  const localWebhookRoutePath = createWebhookRoutePath();
  let webhookPort = options.port ?? 0;
  let webhookHost = localApiHost;

  async function buildDiagnosticsTokenStatus(
    services: LocalAppServices,
  ): Promise<CollectDiagnosticsTokenStatus> {
    const profile = services.profile;
    const token = await monobankTokenStore.getToken(profile);
    const status = (await monobankTokenStore.getStatus?.(profile)) ?? {
      storage: token === undefined ? ("session" as const) : ("secure" as const),
      persistence:
        token === undefined ? ("session" as const) : ("persistent" as const),
    };
    const result: CollectDiagnosticsTokenStatus = {
      hasToken: token !== undefined,
      storage: status.storage,
      persistence: status.persistence,
    };
    if (status.fallbackReason !== undefined) {
      result.fallbackReason = status.fallbackReason;
    }
    return result;
  }

  function resolveWebhookSettings(): Omit<
    LocalApiWebhookSettings,
    "enabled" | "path"
  > {
    if (url === undefined) {
      return {
        host: webhookHost,
        port: webhookPort,
        url: `http://${webhookHost}:${webhookPort}${localWebhookRoutePath}`,
      };
    }

    const parsedUrl = new URL(url);
    const parsedPort = Number(parsedUrl.port);

    if (Number.isFinite(parsedPort) && parsedPort > 0) {
      webhookPort = parsedPort;
    }
    webhookHost = parsedUrl.hostname || webhookHost;

    return {
      host: webhookHost,
      port: webhookPort,
      url: `${parsedUrl.protocol}//${webhookHost}:${webhookPort}${localWebhookRoutePath}`,
    };
  }

  async function loadStoredSettings(): Promise<void> {
    storedSettingsLoadPromise ??= (async () => {
      if (configuredSource !== undefined) {
        if (shouldLoadStoredMonobankToken && monobankToken === undefined) {
          monobankToken = await monobankTokenStore.getToken(
            resolveProfile(options),
          );
          monobankTokenSource =
            monobankToken === undefined ? undefined : "store";
        }

        return;
      }

      const profile = resolveProfile(options);
      const db = createSqliteLedgerDb({
        filePath: resolveLocalLedgerDatabasePath(options),
        profile,
      });

      try {
        await db.migrate();
        const settings = await db.getLocalAppSettings(profile);

        if (settings?.source === "monobank") {
          source = settings.source;
        }

        if (shouldLoadStoredMonobankToken && monobankToken === undefined) {
          monobankToken = await monobankTokenStore.getToken(profile);
          monobankTokenSource =
            monobankToken === undefined ? undefined : "store";
        }
      } finally {
        await db.close();
      }
    })();

    return storedSettingsLoadPromise;
  }

  async function persistSource(nextSource: LedgerSource): Promise<void> {
    if (servicesPromise !== undefined) {
      const services = await servicesPromise;
      await services.db.updateLocalAppSettings(services.profile, {
        source: nextSource,
      });
      return;
    }

    const profile = resolveProfile(options);
    const db = createSqliteLedgerDb({
      filePath: resolveLocalLedgerDatabasePath(options),
      profile,
    });

    try {
      await db.migrate();
      await db.updateLocalAppSettings(profile, { source: nextSource });
    } finally {
      await db.close();
    }
  }

  async function getServices(): Promise<LocalAppServices> {
    await loadStoredSettings();
    servicesPromise ??= createServices(
      options,
      source,
      monobankToken,
      monobankBaseUrl,
      monobankRateLimitState,
    );

    return servicesPromise;
  }

  function getMonobankToken(): string | undefined {
    return monobankToken;
  }

  function runtimeMonobankTokenStatus(): Pick<
    LocalApiMonobankTokenStatus,
    "storage" | "persistence"
  > {
    return {
      storage: "session",
      persistence: "session",
    };
  }

  function unknownMonobankTokenStoreStatus(): Pick<
    LocalApiMonobankTokenStatus,
    "storage" | "persistence"
  > {
    return {
      storage: "session",
      persistence: "session",
    };
  }

  async function removeMonobankToken(): Promise<LocalApiMonobankTokenStatus> {
    const profile = resolveProfile(options);

    await monobankTokenStore.deleteToken(profile);
    monobankToken = undefined;
    monobankTokenSource = undefined;
    await rebuildServices();
    await keepMonobankSourceOnTokenDelete();
    const tokenStoreStatus = await getMonobankTokenStoreStatus(profile);

    return {
      profile,
      hasToken: false,
      ...tokenStoreStatus,
    };
  }

  async function recheckMonobankToken(profile: string): Promise<
    LocalApiMonobankTokenStatus & {
      clientInfo?: LocalApiMonobankClientInfoSummary;
      error?: string;
      message?: string;
      upstreamStatus?: number;
    }
  > {
    const token = monobankToken ?? (await monobankTokenStore.getToken(profile));

    if (token === undefined) {
      return {
        profile,
        hasToken: false,
        storage: "session",
        persistence: "session",
        error: "no_token",
        message: "No Monobank token is saved for this profile.",
      };
    }

    const probe = options.monobankTokenProbeAdapter
      ? options.monobankTokenProbeAdapter
      : createMonobankHttpAdapter({
          token,
          ...(options.monobankBaseUrl !== undefined
            ? { baseUrl: options.monobankBaseUrl }
            : {}),
          rateLimitState: monobankRateLimitState,
        });

    try {
      const clientInfo = await probe.getClientInfo();
      const tokenStoreStatus = await getMonobankTokenStoreStatus(profile);
      const storage = tokenStoreStatus.storage;
      const persistence = tokenStoreStatus.persistence;
      const fallbackReason = tokenStoreStatus.fallbackReason;

      logStructured(
        "info",
        "Monobank client-info re-checked against the live API.",
        {
          profile,
          accountCount: clientInfo.accounts.length,
          jarCount: clientInfo.jars?.length ?? 0,
          clientId: clientInfo.clientId,
        },
        {
          secrets: [token],
          ...(options.logSink !== undefined ? { logger: options.logSink } : {}),
        },
      );

      return {
        profile,
        hasToken: true,
        storage,
        persistence,
        ...(fallbackReason !== undefined ? { fallbackReason } : {}),
        clientInfo: {
          clientId: clientInfo.clientId,
          name: clientInfo.name,
          accounts: clientInfo.accounts.length,
          jars: clientInfo.jars?.length ?? 0,
          masked: true,
        },
      };
    } catch (error) {
      const upstreamStatus =
        error instanceof MonobankApiError
          ? error.response.statusCode
          : undefined;
      const upstreamMessage =
        error instanceof MonobankApiError
          ? error.response.message
          : error instanceof Error
            ? error.message
            : "Monobank personal API probe failed.";

      logStructured(
        "warn",
        "Monobank client-info re-check failed against the live API.",
        {
          profile,
          ...(upstreamStatus !== undefined ? { upstreamStatus } : {}),
        },
        {
          secrets: [token],
          ...(options.logSink !== undefined ? { logger: options.logSink } : {}),
        },
      );

      const tokenStoreStatus = await getMonobankTokenStoreStatus(profile);
      const storage = tokenStoreStatus.storage;
      const persistence = tokenStoreStatus.persistence;
      const fallbackReason = tokenStoreStatus.fallbackReason;

      return {
        profile,
        hasToken: true,
        storage,
        persistence,
        ...(fallbackReason !== undefined ? { fallbackReason } : {}),
        error: "monobank_token_invalid",
        message: upstreamMessage,
        ...(upstreamStatus !== undefined ? { upstreamStatus } : {}),
      };
    }
  }

  async function saveMonobankToken(
    token: string,
    profile: string,
  ): Promise<
    LocalApiMonobankTokenStatus & {
      clientInfo?: LocalApiMonobankClientInfoSummary;
      error?: string;
      message?: string;
      upstreamStatus?: number;
    }
  > {
    if (options.validateMonobankTokenOnSave !== false) {
      const probe = options.monobankTokenProbeAdapter
        ? options.monobankTokenProbeAdapter
        : createMonobankHttpAdapter({
            token,
            ...(options.monobankBaseUrl !== undefined
              ? { baseUrl: options.monobankBaseUrl }
              : {}),
            rateLimitState: monobankRateLimitState,
          });

      try {
        const clientInfo = await probe.getClientInfo();
        const tokenStoreStatus = await getMonobankTokenStoreStatus(profile);
        const storage = tokenStoreStatus.storage;
        const persistence = tokenStoreStatus.persistence;
        const fallbackReason = tokenStoreStatus.fallbackReason;
        const status: LocalApiMonobankTokenStatus & {
          clientInfo: LocalApiMonobankClientInfoSummary;
        } = {
          profile,
          hasToken: false,
          storage,
          persistence,
          ...(fallbackReason !== undefined ? { fallbackReason } : {}),
          clientInfo: {
            clientId: clientInfo.clientId,
            name: clientInfo.name,
            accounts: clientInfo.accounts.length,
            jars: clientInfo.jars?.length ?? 0,
            masked: true,
          },
        };

        await monobankTokenStore.setToken(profile, token);
        monobankToken = token;
        monobankTokenSource = "store";
        await rebuildServices();
        await autoPromoteSourceOnTokenSave();

        logStructured(
          "info",
          "Monobank token saved after live client-info probe.",
          {
            profile,
            accountCount: clientInfo.accounts.length,
            jarCount: clientInfo.jars?.length ?? 0,
            clientId: clientInfo.clientId,
          },
          {
            secrets: [token],
            ...(options.logSink !== undefined
              ? { logger: options.logSink }
              : {}),
          },
        );

        return { ...status, hasToken: true };
      } catch (error) {
        const upstreamStatus =
          error instanceof MonobankApiError
            ? error.response.statusCode
            : undefined;
        const upstreamMessage =
          error instanceof MonobankApiError
            ? error.response.message
            : error instanceof Error
              ? error.message
              : "Monobank personal API probe failed.";

        logStructured(
          "warn",
          "Monobank token was not saved because the live client-info probe failed.",
          {
            profile,
            ...(upstreamStatus !== undefined ? { upstreamStatus } : {}),
          },
          {
            secrets: [token],
            ...(options.logSink !== undefined
              ? { logger: options.logSink }
              : {}),
          },
        );

        return {
          profile,
          hasToken: false,
          storage: "session",
          persistence: "session",
          error: "monobank_token_invalid",
          message: upstreamMessage,
          ...(upstreamStatus !== undefined ? { upstreamStatus } : {}),
        };
      }
    }

    await monobankTokenStore.setToken(profile, token);
    monobankToken = token;
    monobankTokenSource = "store";
    await rebuildServices();
    await autoPromoteSourceOnTokenSave();
    const tokenStoreStatus = await getMonobankTokenStoreStatus(profile);

    return {
      profile,
      hasToken: true,
      ...tokenStoreStatus,
    };
  }

  async function rebuildServices(): Promise<void> {
    if (servicesPromise === undefined) {
      return;
    }

    const services = await servicesPromise;
    await services.db.close();
    servicesPromise = undefined;
  }

  async function autoPromoteSourceOnTokenSave(): Promise<void> {
    if (source === "monobank") {
      return;
    }
    await updateSource("monobank");
  }

  async function keepMonobankSourceOnTokenDelete(): Promise<void> {
    if (configuredSource !== undefined || source === "monobank") {
      return;
    }

    await updateSource("monobank");
  }

  async function updateSource(nextSource: LedgerSource): Promise<void> {
    if (nextSource === "fixture" && configuredSource !== "fixture") {
      throw new DomainError(
        "Fixture source is only available when explicitly configured for development.",
        "config_invalid",
        "config",
        { source: nextSource },
      );
    }

    if (source === nextSource) {
      await persistSource(nextSource);
      return;
    }

    source = nextSource;
    await persistSource(nextSource);
    await rebuildServices();
  }

  async function getMonobankTokenStoreStatus(
    profile: string,
  ): Promise<
    Pick<
      LocalApiMonobankTokenStatus,
      "storage" | "persistence" | "fallbackReason"
    >
  > {
    if (monobankTokenSource === "runtime") {
      return Promise.resolve(runtimeMonobankTokenStatus());
    }

    return (
      (await monobankTokenStore.getStatus?.(profile)) ??
      unknownMonobankTokenStoreStatus()
    );
  }

  registerLocalApiAccessGuard(
    app,
    localApiAccessControl,
    localWebhookRoutePath,
  );

  registerLocalApiRoutes(
    app,
    options,
    localApiAccess,
    getServices,
    getMonobankToken,
    saveMonobankToken,
    recheckMonobankToken,
    removeMonobankToken,
    updateSource,
    getMonobankTokenStoreStatus,
    localWebhookRoutePath,
    resolveWebhookSettings,
    monobankRateLimitState,
  );

  app.get(
    `${localApiRoutePrefix}/app/diagnostics`,
    {
      schema: {
        response: {
          200: diagnosticsResponseSchema,
        },
      },
    },
    async (): Promise<DiagnosticsSnapshot> => {
      const services = await getServices();
      const tokenStatus = await buildDiagnosticsTokenStatus(services);
      return collectDiagnostics({
        db: services.db,
        queryService: services.queryService,
        monobankTokenStore,
        profile: services.profile,
        source: services.source,
        databasePath: services.databasePath,
        tokenStatus,
      });
    },
  );

  app.get(
    `${localApiRoutePrefix}/app/diagnostics/support-bundle`,
    {
      schema: {
        response: {
          200: supportBundleResponseSchema,
        },
      },
    },
    async (): Promise<SupportBundleSnapshot> => {
      const services = await getServices();
      const tokenStatus = await buildDiagnosticsTokenStatus(services);
      return collectSupportBundle({
        db: services.db,
        queryService: services.queryService,
        monobankTokenStore,
        profile: services.profile,
        source: services.source,
        databasePath: services.databasePath,
        tokenStatus,
      });
    },
  );

  return {
    get url() {
      return url;
    },
    apiPrefix: localApiRoutePrefix,
    async listen() {
      url = await app.listen({
        host: localApiHost,
        port: options.port ?? 0,
      });

      resolveWebhookSettings();

      return url;
    },
    async inject(request) {
      const injectOptions: inject.InjectOptions = {
        method: request.method,
        url: request.url,
      };

      if (request.headers) {
        injectOptions.headers = request.headers;
      }

      if (request.body !== undefined) {
        injectOptions.payload =
          request.body === null
            ? "null"
            : (request.body as inject.InjectPayload);
      }

      const response = await app.inject(injectOptions);

      return {
        statusCode: response.statusCode,
        headers: response.headers,
        body: response.body,
        json: () => response.json(),
      };
    },
    async close() {
      await app.close();

      if (servicesPromise) {
        const services = await servicesPromise;
        await services.db.close();
      }
    },
  };
}
