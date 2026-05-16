import os from "node:os";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyInstance } from "fastify";
import type inject from "light-my-request";

import {
  createLedgerExport,
  exportPresetNames,
  isExportFormat,
  isExportPreset,
  type ExportFormat,
  type ExportPreset,
} from "../exports/index.js";
import {
  productArchitecture,
  version,
  type LedgerSource,
} from "../core/index.js";
import { DomainError } from "../domain/index.js";
import {
  assertMonobankPersonalWebhookEvent,
  MonobankValidationError,
  createBundledFixtureMonobankAdapter,
  createMonobankHttpAdapter,
  loadMonobankFixtureSet,
  type MonobankAdapter,
  type MonobankClientInfo,
  type MonobankFixtureSet,
  type MonobankPersonalWebhookEvent,
  type MonobankStatementItem,
} from "../monobank/index.js";
import { createSqliteLedgerDb, type SqliteLedgerDb } from "../sqlite/index.js";
import { syncLedgerWithMonobank } from "../sync/index.js";
import {
  ledgerEntrySortDirections,
  ledgerEntrySortFields,
} from "../storage/index.js";
import type {
  LedgerAccount,
  LedgerEntry,
  LedgerEntryAnnotationUpdate,
  LedgerEntrySplitPlanUpdate,
  LedgerEntryPage,
  LedgerEntrySortDirection,
  LedgerEntrySortField,
  LedgerSummary,
  StoredWebhookEvent,
  SyncRun,
} from "../storage/index.js";
import type { SyncLedgerResult } from "../sync/index.js";
import { logStructured } from "../logging/index.js";

export const localApiServerFramework = "fastify";
export const localApiRoutePrefix = "/api";
const localWebhookRoutePath = `${localApiRoutePrefix}/webhooks/monobank`;
const defaultWebhookHost = "127.0.0.1";

const serverModuleDir = path.dirname(fileURLToPath(import.meta.url));
const localWebBuildDir = path.resolve(serverModuleDir, "../web");
const localWebAssetsDir = path.join(localWebBuildDir, "assets");

export interface LocalApiServerOptions {
  host?: "127.0.0.1" | "localhost";
  port?: number;
  profile?: string;
  source?: LedgerSource;
  dataDir?: string;
  openBrowser?: boolean;
  monobankToken?: string;
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
  body: string;
  json(): unknown;
}

export interface LocalApiHealth {
  status: "ok";
  localOnly: true;
  version: typeof version;
  framework: typeof localApiServerFramework;
  apiPrefix: typeof localApiRoutePrefix;
  architecture: typeof productArchitecture;
}

export interface LocalApiWebhookSettings {
  enabled: boolean;
  path: `${typeof localApiRoutePrefix}/webhooks/monobank`;
  host: string;
  port: number;
  url: string;
}

export interface LocalApiAppConfig {
  profile: string;
  source: LedgerSource;
  dataDir: string;
  databasePath: string;
  localOnly: true;
  webhook: LocalApiWebhookSettings;
}

export interface LocalApiFixtureSummary {
  source: "fixture";
  profile: string;
  accounts: number;
  jars: number;
  currencyRates: number;
  statementAccounts: number;
  statementItems: number;
  webhookEvents: number;
  errorStates: number;
}

export interface LocalApiFixtureClientInfo {
  source: "fixture";
  profile: string;
  clientInfo: MonobankClientInfo;
}

export interface LocalApiFixtureStatementsAccount {
  accountId: string;
  items: readonly MonobankStatementItem[];
}

export interface LocalApiFixtureStatements {
  source: "fixture";
  profile: string;
  totalItems: number;
  accounts: readonly LocalApiFixtureStatementsAccount[];
}

interface LocalAppServices {
  profile: string;
  source: LedgerSource;
  dataDir: string;
  databasePath: string;
  db: SqliteLedgerDb;
  adapter: MonobankAdapter;
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
    localOnly: { const: true },
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

const fixtureSummaryResponseSchema = {
  type: "object",
  required: [
    "source",
    "profile",
    "accounts",
    "jars",
    "currencyRates",
    "statementAccounts",
    "statementItems",
    "webhookEvents",
    "errorStates",
  ],
  properties: {
    source: { const: "fixture" },
    profile: { type: "string" },
    accounts: { type: "number" },
    jars: { type: "number" },
    currencyRates: { type: "number" },
    statementAccounts: { type: "number" },
    statementItems: { type: "number" },
    webhookEvents: { type: "number" },
    errorStates: { type: "number" },
  },
} as const;

const fixtureClientInfoResponseSchema = {
  type: "object",
  required: ["source", "profile", "clientInfo"],
  properties: {
    source: { const: "fixture" },
    profile: { type: "string" },
    clientInfo: {
      type: "object",
      additionalProperties: true,
    },
  },
} as const;

const fixtureStatementsResponseSchema = {
  type: "object",
  required: ["source", "profile", "totalItems", "accounts"],
  properties: {
    source: { const: "fixture" },
    profile: { type: "string" },
    totalItems: { type: "number" },
    accounts: {
      type: "array",
      items: {
        type: "object",
        required: ["accountId", "items"],
        properties: {
          accountId: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      },
    },
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
    "webhook",
  ],
  properties: {
    profile: { type: "string" },
    source: { enum: ["fixture", "monobank"] },
    dataDir: { type: "string" },
    databasePath: { type: "string" },
    localOnly: { const: true },
    webhook: {
      type: "object",
      required: ["enabled", "path", "host", "port", "url"],
      properties: {
        enabled: { type: "boolean" },
        path: { const: localWebhookRoutePath },
        host: { type: "string" },
        port: { type: "number" },
        url: { type: "string" },
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
    "currencies",
  ],
  properties: {
    profile: { type: "string" },
    accounts: { type: "number" },
    ledgerEntries: { type: "number" },
    income: { type: "number" },
    expenses: { type: "number" },
    net: { type: "number" },
    currencies: { type: "array", items: { type: "number" } },
    lastSyncedAt: { type: "string" },
  },
} as const;

const ledgerAccountsResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
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
  },
} as const;

function summarizeFixtureSet(
  fixtureSet: MonobankFixtureSet,
  profile: string,
): LocalApiFixtureSummary {
  return {
    source: "fixture",
    profile,
    accounts: fixtureSet.clientInfo.accounts.length,
    jars: fixtureSet.clientInfo.jars?.length ?? 0,
    currencyRates: fixtureSet.currencyRates.length,
    statementAccounts: Object.keys(fixtureSet.statements).length,
    statementItems: Object.values(fixtureSet.statements).reduce(
      (count, statementItems) => count + statementItems.length,
      0,
    ),
    webhookEvents: Object.keys(fixtureSet.webhookEvents ?? {}).length,
    errorStates: Object.keys(fixtureSet.errors ?? {}).length,
  };
}

function fixtureClientInfoResponse(
  fixtureSet: MonobankFixtureSet,
  profile: string,
): LocalApiFixtureClientInfo {
  return {
    source: "fixture",
    profile,
    clientInfo: fixtureSet.clientInfo,
  };
}

function fixtureStatementsResponse(
  fixtureSet: MonobankFixtureSet,
  profile: string,
): LocalApiFixtureStatements {
  const accounts = Object.entries(fixtureSet.statements).map(
    ([accountId, items]) => ({
      accountId,
      items,
    }),
  );

  return {
    source: "fixture",
    profile,
    totalItems: accounts.reduce((count, account) => {
      return count + account.items.length;
    }, 0),
    accounts,
  };
}

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

function resolveSource(options: LocalApiServerOptions): LedgerSource {
  return options.source ?? "fixture";
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
): Promise<LocalAppServices> {
  const profile = resolveProfile(options);
  const source = resolveSource(options);
  const dataDir = resolveDataDir(options);
  const databasePath = resolveLocalLedgerDatabasePath(options);
  const token = resolveMonobankToken(options);
  const adapter =
    source === "fixture"
      ? await createBundledFixtureMonobankAdapter()
      : token === undefined
        ? createMissingMonobankTokenAdapter()
        : createMonobankHttpAdapter({
            token,
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

function renderLocalFixtureOverview(
  fixtureSet: MonobankFixtureSet,
  profile: string,
): string {
  const summary = summarizeFixtureSet(fixtureSet, profile);
  const recentStatementItems = Object.entries(fixtureSet.statements)
    .flatMap(([accountId, items]) => {
      return items.map((item) => ({ accountId, item }));
    })
    .sort((left, right) => right.item.time - left.item.time)
    .slice(0, 8);
  const accountRows = fixtureSet.clientInfo.accounts
    .map((account) => {
      return `<tr>
        <td>${escapeHtml(account.id)}</td>
        <td>${escapeHtml(account.type)}</td>
        <td>${escapeHtml(formatMinorAmount(account.balance, account.currencyCode))}</td>
        <td>${escapeHtml(account.maskedPan?.join(", ") ?? "none")}</td>
      </tr>`;
    })
    .join("");
  const statementRows = recentStatementItems
    .map(({ accountId, item }) => {
      return `<tr>
        <td>${escapeHtml(new Date(item.time * 1000).toISOString().slice(0, 10))}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(accountId)}</td>
        <td class="amount">${escapeHtml(formatMinorAmount(item.amount, item.currencyCode))}</td>
        <td>${item.hold ? "hold" : "posted"}</td>
      </tr>`;
    })
    .join("");

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
        --accent: #eef8f1;
        --danger: #ef4444;
        --warning: #f59e0b;
      }
      * { box-sizing: border-box; }
      html {
        width: 100%;
      }
      body {
        margin: 0;
        background: var(--background);
        color: var(--foreground);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
        line-height: 1.5;
        overflow-x: hidden;
        width: 100%;
      }
      button, input, select {
        font: inherit;
      }
      .shell {
        display: grid;
        grid-template-columns: 236px minmax(0, 1fr);
        min-height: 100vh;
        max-width: 100vw;
      }
      aside {
        border-right: 1px solid var(--border);
        background: var(--surface);
        min-width: 0;
        padding: 22px 14px;
      }
      main {
        min-width: 0;
        max-width: 100vw;
        padding: 24px;
      }
      .brand {
        font-weight: 750;
        font-size: 18px;
        letter-spacing: 0;
        margin: 0 0 22px;
      }
      nav {
        display: grid;
        gap: 4px;
      }
      nav a {
        border-radius: 6px;
        color: var(--muted);
        padding: 8px 10px;
        text-decoration: none;
      }
      nav a.active {
        background: var(--accent);
        color: var(--primary-dark);
        font-weight: 650;
      }
      .sidebar-footer {
        border-top: 1px solid var(--border);
        color: var(--muted);
        font-size: 12px;
        margin-top: 24px;
        padding: 14px 10px 0;
        overflow-wrap: anywhere;
      }
      .sidebar-footer strong {
        color: var(--foreground);
        display: block;
        font-size: 12px;
        margin-bottom: 4px;
      }
      .topbar {
        align-items: center;
        border-bottom: 1px solid var(--border);
        display: flex;
        gap: 16px;
        justify-content: space-between;
        margin: -24px -24px 24px;
        padding: 18px 24px;
      }
      h1, h2, p {
        margin: 0;
      }
      h1 {
        font-size: 24px;
        line-height: 1.15;
        letter-spacing: 0;
      }
      h2 {
        font-size: 16px;
        line-height: 1.25;
        letter-spacing: 0;
        margin-bottom: 10px;
      }
      .muted {
        color: var(--muted);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .button {
        align-items: center;
        background: var(--primary);
        border: 1px solid var(--primary);
        border-radius: 6px;
        color: #fff;
        cursor: pointer;
        display: inline-flex;
        font-weight: 650;
        gap: 8px;
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
      .button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1px;
        border: 1px solid var(--border);
        background: var(--border);
        margin-bottom: 24px;
      }
      .metric {
        background: #fff;
        padding: 14px;
      }
      .metric strong {
        display: block;
        font-size: 22px;
        line-height: 1.2;
      }
      .grid {
        display: grid;
        gap: 24px;
        grid-template-columns: minmax(0, 1fr);
      }
      section {
        min-width: 0;
      }
      .panel {
        border: 1px solid var(--border);
        border-radius: 8px;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
      }
      .panel-header {
        align-items: center;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        display: flex;
        gap: 12px;
        justify-content: space-between;
        padding: 10px 12px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border-bottom: 1px solid var(--border);
        padding: 9px 12px;
        text-align: left;
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 12px;
        font-weight: 650;
      }
      tr:last-child td {
        border-bottom: 0;
      }
      .amount {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .negative {
        color: var(--danger);
      }
      .positive {
        color: var(--primary-dark);
      }
      .status {
        border-radius: 999px;
        display: inline-flex;
        font-size: 12px;
        font-weight: 650;
        line-height: 1;
        padding: 5px 8px;
      }
      .status.local {
        background: var(--accent);
        color: var(--primary-dark);
      }
      .status.hold {
        background: #fff7ed;
        color: #9a3412;
      }
      .filters {
        display: grid;
        gap: 8px;
        grid-template-columns: minmax(180px, 1fr) 160px;
      }
      input, select {
        border: 1px solid var(--border);
        border-radius: 6px;
        min-height: 34px;
        padding: 7px 9px;
      }
      .links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .links a {
        color: var(--primary-dark);
      }
      @media (max-width: 840px) {
        .shell {
          grid-template-columns: minmax(0, 1fr);
        }
        aside {
          border-bottom: 1px solid var(--border);
          border-right: 0;
          max-width: 100vw;
          overflow: hidden;
          width: 100%;
        }
        nav {
          display: flex;
          overflow-x: auto;
          max-width: 100%;
          width: 100%;
        }
        nav a {
          flex: 0 0 auto;
          white-space: nowrap;
        }
        main {
          max-width: 100vw;
          padding: 18px;
          width: 100%;
        }
        .topbar {
          align-items: flex-start;
          flex-direction: column;
          margin: -18px -18px 18px;
          padding: 16px 18px;
        }
        .metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .panel {
          max-width: 100%;
          overflow-x: auto;
        }
        .panel-header {
          align-items: flex-start;
          flex-direction: column;
        }
        .panel-header > .muted {
          overflow-wrap: anywhere;
        }
        table {
          min-width: 680px;
        }
        .filters {
          grid-template-columns: 1fr;
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <p class="brand">mono-ledger-sync</p>
        <nav aria-label="Primary">
          <a class="active" href="#overview">Overview</a>
          <a href="#transactions">Transactions</a>
          <a href="#rules">Rules & Mappings</a>
          <a href="#sync">Sync & Webhooks</a>
          <a href="#accounts">Accounts</a>
          <a href="#exports">Exports</a>
          <a href="#logs">Logs</a>
          <a href="#settings">Settings</a>
          <a href="#help">Help</a>
        </nav>
        <div class="sidebar-footer">
          <strong>Local database</strong>
          <span id="database-path">loading</span>
        </div>
      </aside>
      <main>
        <div class="topbar">
          <div>
            <h1>Local ledger</h1>
            <p class="muted" id="profile-label">Profile ${escapeHtml(summary.profile)} · fixture source · local only</p>
          </div>
          <div class="actions">
            <button class="button" id="sync-button" type="button">Sync fixture</button>
            <a class="button secondary" href="/api/exports/ledger?format=csv">Export CSV</a>
            <span class="status local" id="sync-status">ready</span>
          </div>
        </div>

        <section class="metrics" aria-label="Ledger summary">
          <div class="metric"><strong id="metric-accounts">${summary.accounts}</strong><span>accounts</span></div>
          <div class="metric"><strong id="metric-entries">${summary.statementItems}</strong><span>transactions</span></div>
          <div class="metric"><strong id="metric-income">0.00</strong><span>income</span></div>
          <div class="metric"><strong id="metric-expenses">0.00</strong><span>expenses</span></div>
        </section>

        <div class="grid">
          <section id="transactions">
            <div class="panel">
              <div class="panel-header">
                <h2>Transactions</h2>
                <div class="filters">
                  <input id="search" type="search" placeholder="Search transactions">
                  <select id="account-filter">
                    <option value="">All accounts</option>
                  </select>
                </div>
              </div>
              <table>
                <thead>
                  <tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th>Amount</th><th>Status</th></tr>
                </thead>
                <tbody id="ledger-rows">
                  ${statementRows}
                </tbody>
              </table>
            </div>
          </section>

          <section id="accounts">
            <div class="panel">
              <div class="panel-header">
                <h2>Accounts</h2>
                <span class="muted">fixture-account-uah-main</span>
              </div>
              <table>
                <thead><tr><th>Account</th><th>Type</th><th>Balance</th><th>Masked PAN</th></tr></thead>
                <tbody id="account-rows">${accountRows}</tbody>
              </table>
            </div>
          </section>

          <section id="exports">
            <div class="panel">
              <div class="panel-header">
                <h2>Exports</h2>
                <div class="links">
                  <a href="/api/exports/ledger?format=csv">CSV</a>
                  <a href="/api/exports/ledger?format=json">JSON</a>
                  <a href="/api/exports/ledger?format=jsonl">JSONL</a>
                  <a href="/api/fixtures/client-info">/api/fixtures/client-info</a>
                  <a href="/api/fixtures/statements">/api/fixtures/statements</a>
                  <a href="/api/fixtures/summary">/api/fixtures/summary</a>
                  <a href="/api/health">/api/health</a>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
    <script>
      const escapeHtml = (value) => {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      };
      const currencyLabel = (code) => {
        if (code === 980) return "UAH";
        if (code === 978) return "EUR";
        if (code === 840) return "USD";
        return String(code);
      };
      const formatAmount = (amount, currencyCode) => {
        return (amount / 100).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }) + " " + currencyLabel(currencyCode);
      };
      const state = {
        accounts: [],
        accountId: "",
        search: "",
        bootstrapped: false
      };

      async function api(path, options) {
        const response = await fetch(path, options);
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      }

      function renderSummary(summary) {
        document.querySelector("#metric-accounts").textContent = summary.accounts;
        document.querySelector("#metric-entries").textContent = summary.ledgerEntries;
        document.querySelector("#metric-income").textContent =
          (summary.income / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
        document.querySelector("#metric-expenses").textContent =
          (summary.expenses / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
      }

      function renderConfig(config) {
        document.querySelector("#database-path").textContent = config.databasePath;
        document.querySelector("#profile-label").textContent =
          "Profile " + config.profile + " · " + config.source + " source · local only";
      }

      function renderAccounts(accounts) {
        state.accounts = accounts;
        document.querySelector("#account-filter").innerHTML =
          '<option value="">All accounts</option>' +
          accounts.map((account) => {
            return '<option value="' + escapeHtml(account.id) + '">' + escapeHtml(account.id) + '</option>';
          }).join("");
        document.querySelector("#account-rows").innerHTML = accounts.map((account) => {
          return '<tr><td>' + escapeHtml(account.id) + '</td><td>' + escapeHtml(account.type) + '</td><td>' +
            escapeHtml(formatAmount(account.balance, account.currencyCode)) + '</td><td>' +
            escapeHtml((account.maskedPan || ["none"]).join(", ")) + '</td></tr>';
        }).join("");
      }

      function renderTransactions(page) {
        document.querySelector("#ledger-rows").innerHTML = page.entries.map((entry) => {
          const amountClass = entry.amount < 0 ? "negative" : "positive";
          const status = entry.hold ? '<span class="status hold">hold</span>' : "posted";
          return '<tr><td>' + new Date(entry.time * 1000).toISOString().slice(0, 10) +
            '</td><td>' + escapeHtml(entry.description) + '</td><td>' +
            escapeHtml(entry.categoryName || "Uncategorized") + '</td><td>' + escapeHtml(entry.accountId) +
            '</td><td class="amount ' + amountClass + '">' +
            escapeHtml(formatAmount(entry.amount, entry.currencyCode)) + '</td><td>' + status + '</td></tr>';
        }).join("");
      }

      async function refresh() {
        const params = new URLSearchParams();
        if (state.accountId) params.set("accountId", state.accountId);
        if (state.search) params.set("search", state.search);
        let summary = await api("/api/ledger/summary");
        if (!state.bootstrapped && summary.ledgerEntries === 0) {
          state.bootstrapped = true;
          document.querySelector("#sync-status").textContent = "syncing";
          await api("/api/sync/run", { method: "POST" });
          summary = await api("/api/ledger/summary");
          document.querySelector("#sync-status").textContent = "synced";
        }
        const [config, accounts, transactions] = await Promise.all([
          api("/api/app/config"),
          api("/api/ledger/accounts"),
          api("/api/ledger/transactions?" + params.toString())
        ]);
        renderConfig(config);
        renderSummary(summary);
        renderAccounts(accounts);
        renderTransactions(transactions);
      }

      document.querySelector("#sync-button").addEventListener("click", async () => {
        const button = document.querySelector("#sync-button");
        const status = document.querySelector("#sync-status");
        button.disabled = true;
        status.textContent = "syncing";
        try {
          await api("/api/sync/run", { method: "POST" });
          await refresh();
          status.textContent = "synced";
        } catch {
          status.textContent = "failed";
        } finally {
          button.disabled = false;
        }
      });
      document.querySelector("#account-filter").addEventListener("change", (event) => {
        state.accountId = event.target.value;
        refresh();
      });
      document.querySelector("#search").addEventListener("input", (event) => {
        state.search = event.target.value;
        window.clearTimeout(window.__ledgerSearchTimer);
        window.__ledgerSearchTimer = window.setTimeout(refresh, 180);
      });
      refresh().catch(() => undefined);
    </script>
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

function registerLocalApiRoutes(
  app: FastifyInstance,
  options: LocalApiServerOptions,
  getServices: () => Promise<LocalAppServices>,
  resolveWebhookSettings: () => Omit<
    LocalApiWebhookSettings,
    "enabled" | "path"
  >,
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

  function isWebhookRateLimited(profile: string, accountId: string): boolean {
    const key = `${profile}:${accountId}`;
    const current = now();
    const state = webhookRateLimitState.get(key);

    if (!state || current - state.windowStart >= webhookRateLimitWindowMs) {
      webhookRateLimitState.set(key, {
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

  app.get("/", async (_request, reply): Promise<string> => {
    const builtWebIndex = await readBuiltWebIndex();

    if (builtWebIndex) {
      reply.type("text/html; charset=utf-8");

      return builtWebIndex;
    }

    const fixtureSet = await loadMonobankFixtureSet();

    reply.type("text/html; charset=utf-8");

    return renderLocalFixtureOverview(fixtureSet, resolveProfile(options));
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
      localOnly: true,
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
    async (): Promise<LocalApiAppConfig> => {
      const services = await getServices();

      return {
        profile: services.profile,
        source: services.source,
        dataDir: services.dataDir,
        databasePath: services.databasePath,
        localOnly: true,
        webhook: {
          enabled: true,
          path: localWebhookRoutePath,
          ...resolveWebhookSettings(),
        },
      };
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

      return services.db.getLedgerSummary(services.profile);
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

      return services.db.listAccounts(services.profile);
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

      return services.db.listLedgerEntries(entryQuery);
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

      const entry = await services.db.updateLedgerEntryAnnotation(
        services.profile,
        id,
        readLedgerEntryAnnotationUpdate(request.body),
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

      const entry = await services.db.updateLedgerEntrySplitPlan(
        services.profile,
        id,
        readLedgerEntrySplitPlanUpdate(request.body),
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
      if (
        resolveSource(options) === "monobank" &&
        !resolveMonobankToken(options)
      ) {
        reply.code(400);

        return {
          error: "auth_required",
          message:
            "Monobank source is configured, but no token is provided. Set MONOBANK_TOKEN or pass monobankToken.",
        };
      }

      const services = await getServices();
      const syncAbortController = new AbortController();
      const handleInterrupt = (): void => {
        syncAbortController.abort();
      };

      process.on("SIGINT", handleInterrupt);
      process.on("SIGTERM", handleInterrupt);

      try {
        return await syncLedgerWithMonobank({
          profile: services.profile,
          source: services.source,
          adapter: services.adapter,
          db: services.db,
          signal: syncAbortController.signal,
        });
      } finally {
        process.off("SIGINT", handleInterrupt);
        process.off("SIGTERM", handleInterrupt);
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

      return services.db.listSyncRuns(services.profile);
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

      return services.db.listWebhookEvents(services.profile, 20);
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
          const logOptions =
            options.logSink === undefined ? {} : { logger: options.logSink };

          logStructured(
            "warn",
            "Rejected malformed webhook payload",
            {
              route: `${localApiRoutePrefix}/webhooks/monobank`,
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
        isWebhookRateLimited(services.profile, typedWebhookEvent.data.account)
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
    `${localApiRoutePrefix}/fixtures/summary`,
    {
      schema: {
        response: {
          200: fixtureSummaryResponseSchema,
        },
      },
    },
    async (): Promise<LocalApiFixtureSummary> => {
      const fixtureSet = await loadMonobankFixtureSet();

      return summarizeFixtureSet(fixtureSet, resolveProfile(options));
    },
  );

  app.get(
    `${localApiRoutePrefix}/fixtures/client-info`,
    {
      schema: {
        response: {
          200: fixtureClientInfoResponseSchema,
        },
      },
    },
    async (): Promise<LocalApiFixtureClientInfo> => {
      const fixtureSet = await loadMonobankFixtureSet();

      return fixtureClientInfoResponse(fixtureSet, resolveProfile(options));
    },
  );

  app.get(
    `${localApiRoutePrefix}/fixtures/statements`,
    {
      schema: {
        response: {
          200: fixtureStatementsResponseSchema,
        },
      },
    },
    async (): Promise<LocalApiFixtureStatements> => {
      const fixtureSet = await loadMonobankFixtureSet();

      return fixtureStatementsResponse(fixtureSet, resolveProfile(options));
    },
  );
}

export function createLocalApiServer(
  options: LocalApiServerOptions = {},
): LocalApiServer {
  const app = Fastify({
    logger: false,
  });
  let url: string | undefined;
  let servicesPromise: Promise<LocalAppServices> | undefined;
  let webhookPort = options.port ?? 0;
  let webhookHost: NonNullable<LocalApiServerOptions["host"]> =
    options.host ?? defaultWebhookHost;

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
    if (
      parsedUrl.hostname === "127.0.0.1" ||
      parsedUrl.hostname === "localhost"
    ) {
      webhookHost = parsedUrl.hostname;
    }

    return {
      host: webhookHost,
      port: webhookPort,
      url: `${parsedUrl.protocol}//${webhookHost}:${webhookPort}${localWebhookRoutePath}`,
    };
  }

  function getServices(): Promise<LocalAppServices> {
    servicesPromise ??= createServices(options);

    return servicesPromise;
  }

  registerLocalApiRoutes(app, options, getServices, resolveWebhookSettings);

  return {
    get url() {
      return url;
    },
    apiPrefix: localApiRoutePrefix,
    async listen() {
      url = await app.listen({
        host: options.host ?? defaultWebhookHost,
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
