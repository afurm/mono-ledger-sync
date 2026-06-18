import os from "node:os";
import crypto from "node:crypto";
import { copyFile, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyInstance } from "fastify";
import type inject from "light-my-request";

import type { CollectDiagnosticsTokenStatus } from "./diagnostics.js";
import { registerDiagnosticsRoutes } from "./routes/diagnostics-routes.js";
import { registerLocalAppRoutes } from "./routes/app-routes.js";
import { registerExportRoutes } from "./routes/export-routes.js";
import { registerLedgerRoutes } from "./routes/ledger-routes.js";
import { registerRecurringRoutes } from "./routes/recurring-routes.js";
import { registerReportRoutes } from "./routes/report-routes.js";
import { registerSyncRoutes } from "./routes/sync-routes.js";
import { registerTransactionRoutes } from "./routes/transaction-routes.js";
import { registerLocalWebRoutes } from "./routes/web-routes.js";
import { registerWebhookRoutes } from "./routes/webhook-routes.js";
import {
  isLedgerSource,
  productArchitecture,
  version,
  type LedgerSource,
} from "../core/index.js";
import { DomainError } from "../domain/index.js";
import {
  createBundledFixtureMonobankAdapter,
  createMonobankHttpAdapter,
  createMonobankRateLimitState,
  MonobankApiError,
  type MonobankAdapter,
  type MonobankRateLimitState,
} from "../monobank/index.js";
import { createSqliteLedgerDb, type SqliteLedgerDb } from "../sqlite/index.js";
import {
  createLedgerQueryService,
  createLedgerWriteService,
  type LedgerQueryService,
  type LedgerWriteService,
} from "../storage/index.js";
import type { LocalAppSettings } from "../storage/index.js";
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
const localWebStaticAssetNames = new Set(["favicon.ico", "favicon.svg"]);

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
  schedule: NonNullable<LocalAppSettings["syncSchedule"]>;
}

export interface LocalApiStorageInfo {
  profile: string;
  dataDir: string;
  databasePath: string;
  databaseBytes: number;
  databaseModifiedAt?: string;
  integrityCheck: string;
  pageCount: number;
  pageSize: number;
  migrations: readonly string[];
  accounts: number;
  ledgerEntries: number;
  syncRuns: number;
  webhookEvents: number;
  backupDirectory: string;
  backups: readonly LocalApiBackupFile[];
  latestBackupPath?: string;
  latestBackupAt?: string;
  lastCompactAt?: string;
}

export interface LocalApiBackupFile {
  path: string;
  modifiedAt: string;
  bytes: number;
}

export interface LocalApiBackupResult {
  profile: string;
  backupPath: string;
  databasePath: string;
  createdAt: string;
  bytes: number;
}

export interface LocalApiLocalDataDeletionResult {
  profile: string;
  databasePath: string;
  tokenRemoved: boolean;
  ledgerDataDeleted: boolean;
  deleted: Record<string, number>;
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
  settings: LocalAppSettings;
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

const defaultWebhookRateLimitMaxRequests = 30;
const defaultWebhookRateLimitWindowMs = 60_000;
const staleRunningSyncRunTimeoutMs = 30 * 60 * 1000;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
  await interruptStaleRunningSyncRuns(
    db,
    profile,
    options.now?.() ?? Date.now(),
  );

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

function staleRunningSyncRunReason(timeoutMs: number): string {
  const timeoutMinutes = Math.round(timeoutMs / 60_000);

  return `Marked interrupted because this sync run stayed running for more than ${timeoutMinutes} minutes. The local process likely stopped before it could finish.`;
}

async function interruptStaleRunningSyncRuns(
  db: SqliteLedgerDb,
  profile: string,
  nowMs: number,
): Promise<number> {
  const interruptedAt = new Date(nowMs).toISOString();
  const staleBefore = new Date(
    nowMs - staleRunningSyncRunTimeoutMs,
  ).toISOString();

  return db.interruptStaleSyncRuns(
    profile,
    staleBefore,
    interruptedAt,
    staleRunningSyncRunReason(staleRunningSyncRunTimeoutMs),
  );
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

function withLocalAppSettingsDefaults(
  profile: string,
  source: LedgerSource,
  settings: LocalAppSettings | undefined,
): LocalAppSettings {
  return {
    profile,
    source: settings?.source ?? source,
    syncSchedule: settings?.syncSchedule ?? "manual",
    excludedAccountIds: settings?.excludedAccountIds ?? [],
    ...(settings?.exportDirectory === undefined
      ? {}
      : { exportDirectory: settings.exportDirectory }),
    budgetWarningThreshold: settings?.budgetWarningThreshold ?? 80,
    rawStatementRetentionDays: settings?.rawStatementRetentionDays ?? 90,
    ...(settings?.lastBackupAt === undefined
      ? {}
      : { lastBackupAt: settings.lastBackupAt }),
    ...(settings?.lastCompactAt === undefined
      ? {}
      : { lastCompactAt: settings.lastCompactAt }),
    updatedAt: settings?.updatedAt ?? new Date(0).toISOString(),
  };
}

function readLocalAppSettingsUpdate(
  body: unknown,
): Omit<LocalAppSettings, "profile" | "updatedAt"> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  const record = body as Record<string, unknown>;
  const update: Omit<LocalAppSettings, "profile" | "updatedAt"> = {};

  if (isSyncSchedule(record.syncSchedule)) {
    update.syncSchedule = record.syncSchedule;
  }

  if (Array.isArray(record.excludedAccountIds)) {
    update.excludedAccountIds = [
      ...new Set(
        record.excludedAccountIds
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ];
  }

  if (typeof record.exportDirectory === "string") {
    update.exportDirectory = record.exportDirectory.trim();
  }

  if (
    typeof record.budgetWarningThreshold === "number" &&
    Number.isInteger(record.budgetWarningThreshold)
  ) {
    update.budgetWarningThreshold = record.budgetWarningThreshold;
  }

  if (
    typeof record.rawStatementRetentionDays === "number" &&
    Number.isInteger(record.rawStatementRetentionDays) &&
    record.rawStatementRetentionDays >= 0
  ) {
    update.rawStatementRetentionDays = record.rawStatementRetentionDays;
  }

  return update;
}

function backupDirectory(dataDir: string): string {
  return path.join(dataDir, "backups");
}

function backupFileName(profile: string, timestamp: string): string {
  const safeProfile = profile.replace(/[^a-z0-9._-]+/gi, "-") || "default";
  const safeTimestamp = timestamp.replace(/[:.]/g, "-");

  return `mono-ledger-${safeProfile}-${safeTimestamp}.sqlite`;
}

async function listBackupFiles(
  directory: string,
): Promise<readonly LocalApiBackupFile[]> {
  let entries: string[];

  try {
    entries = await readdir(directory);
  } catch {
    return [];
  }

  const backupFiles = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".sqlite"))
      .map(async (entry) => {
        const backupPath = path.join(directory, entry);

        try {
          const info = await stat(backupPath);

          return {
            path: backupPath,
            modifiedAt: info.mtime.toISOString(),
            modifiedTime: info.mtimeMs,
            bytes: info.size,
          };
        } catch {
          return undefined;
        }
      }),
  );

  return backupFiles
    .filter(
      (entry): entry is LocalApiBackupFile & { modifiedTime: number } =>
        entry !== undefined,
    )
    .sort((left, right) => right.modifiedTime - left.modifiedTime)
    .map(({ modifiedTime: _modifiedTime, ...entry }) => entry);
}

function isPathInsideDirectory(filePath: string, directory: string): boolean {
  const relativePath = path.relative(directory, filePath);

  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath)
  );
}

function isValidProfileBackupPath(
  backupPath: string,
  services: LocalAppServices,
): boolean {
  const resolvedBackupPath = path.resolve(backupPath);
  const resolvedBackupDirectory = path.resolve(
    backupDirectory(services.dataDir),
  );
  const profilePrefix = `mono-ledger-${
    safeProfileFileName(services.profile) || "default"
  }-`;

  return (
    isPathInsideDirectory(resolvedBackupPath, resolvedBackupDirectory) &&
    path.basename(resolvedBackupPath).startsWith(profilePrefix) &&
    path.extname(resolvedBackupPath) === ".sqlite"
  );
}

async function readStorageInfo(
  services: LocalAppServices,
): Promise<LocalApiStorageInfo> {
  const [dbInfo, settings, databaseStat, backups] = await Promise.all([
    services.db.getDatabaseInfo(services.profile),
    services.db.getLocalAppSettings(services.profile),
    stat(services.databasePath).catch(() => undefined),
    listBackupFiles(backupDirectory(services.dataDir)),
  ]);
  const latestBackup = backups[0];

  return {
    profile: services.profile,
    dataDir: services.dataDir,
    databasePath: services.databasePath,
    databaseBytes: databaseStat?.size ?? dbInfo.bytes,
    ...(databaseStat === undefined
      ? {}
      : { databaseModifiedAt: databaseStat.mtime.toISOString() }),
    integrityCheck: dbInfo.integrityCheck,
    pageCount: dbInfo.pageCount,
    pageSize: dbInfo.pageSize,
    migrations: dbInfo.migrations,
    accounts: dbInfo.accounts,
    ledgerEntries: dbInfo.ledgerEntries,
    syncRuns: dbInfo.syncRuns,
    webhookEvents: dbInfo.webhookEvents,
    backupDirectory: backupDirectory(services.dataDir),
    backups,
    ...(latestBackup === undefined
      ? {}
      : {
          latestBackupPath: latestBackup.path,
          latestBackupAt: latestBackup.modifiedAt,
        }),
    ...(settings?.lastBackupAt === undefined
      ? {}
      : { latestBackupAt: settings.lastBackupAt }),
    ...(settings?.lastCompactAt === undefined
      ? {}
      : { lastCompactAt: settings.lastCompactAt }),
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

async function readBuiltWebStaticAsset(
  assetPath: string,
): Promise<{ body: Buffer; contentType: string } | undefined> {
  if (!localWebStaticAssetNames.has(assetPath)) {
    return undefined;
  }

  const resolvedPath = path.resolve(localWebBuildDir, assetPath);

  if (!resolvedPath.startsWith(`${localWebBuildDir}${path.sep}`)) {
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
  restoreLocalDatabaseFromBackup: (
    backupPath: string,
  ) => Promise<LocalApiStorageInfo>,
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

  registerLocalWebRoutes(app, {
    profile: resolveProfile(options),
    readBuiltWebIndex,
    readBuiltWebAsset,
    readBuiltWebStaticAsset,
    renderLocalApiBootstrap,
  });

  registerLocalAppRoutes(app, {
    apiPrefix: localApiRoutePrefix,
    architecture: productArchitecture,
    framework: localApiServerFramework,
    version,
    profile: resolveProfile(options),
    now,
    localApiAccess,
    getServices,
    getMonobankToken,
    saveMonobankToken,
    recheckMonobankToken,
    removeMonobankToken,
    setSource,
    restoreLocalDatabaseFromBackup,
    getMonobankTokenStoreStatus,
    localWebhookRoutePath,
    resolveWebhookSettings,
    monobankRateLimitState,
    interruptStaleRunningSyncRuns,
    withLocalAppSettingsDefaults,
    readLocalAppSettingsUpdate,
    backupDirectory,
    backupFileName,
    isValidProfileBackupPath,
    readStorageInfo,
  });

  const routeContext = {
    apiPrefix: localApiRoutePrefix,
    getServices,
  };

  registerLedgerRoutes(app, routeContext);
  registerReportRoutes(app, routeContext);
  registerRecurringRoutes(app, routeContext);
  registerTransactionRoutes(app, routeContext);
  registerSyncRoutes(app, {
    ...routeContext,
    now,
    getMonobankToken,
    interruptStaleRunningSyncRuns,
  });
  registerWebhookRoutes(app, {
    ...routeContext,
    localWebhookRoutePath,
    ...(options.logSink === undefined ? {} : { logSink: options.logSink }),
    isMalformedWebhookRateLimited,
    isWebhookAccountRateLimited,
    webhookDeliveryMetadata,
  });
  registerExportRoutes(app, {
    ...routeContext,
    withLocalAppSettingsDefaults,
  });
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

  async function restoreLocalDatabaseFromBackup(
    backupPath: string,
  ): Promise<LocalApiStorageInfo> {
    const services = await getServices();
    const databasePath = services.databasePath;

    await services.db.close();
    servicesPromise = undefined;
    await copyFile(backupPath, databasePath);

    const restoredServices = await getServices();

    return readStorageInfo(restoredServices);
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
    restoreLocalDatabaseFromBackup,
    getMonobankTokenStoreStatus,
    localWebhookRoutePath,
    resolveWebhookSettings,
    monobankRateLimitState,
  );

  registerDiagnosticsRoutes(app, {
    apiPrefix: localApiRoutePrefix,
    getServices,
    monobankTokenStore,
    buildDiagnosticsTokenStatus,
  });

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
