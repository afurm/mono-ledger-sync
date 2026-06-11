import { stat } from "node:fs/promises";

import { redactSensitiveText } from "../privacy/index.js";
import { version, productArchitecture } from "../core/index.js";
import type {
  AccountBalance,
  SyncRun,
  StoredWebhookEvent,
  SyncRunStatus,
} from "../domain/index.js";
import type { SqliteLedgerDb } from "../sqlite/index.js";
import type { MonobankTokenStore } from "../security/index.js";
import type { LedgerQueryService } from "../storage/index.js";
import type {
  MonobankTokenStoreStatus,
  MonobankTokenStoreStorage,
  MonobankTokenStorePersistence,
} from "../security/index.js";

export type { MonobankTokenStoreStatus };

export type SecureStorageBackend = "keychain" | "secret-service" | "session";

export interface DiagnosticsSecureStorage {
  available: boolean;
  platform: NodeJS.Platform;
  backend: SecureStorageBackend;
  reason?: string;
}

export interface DiagnosticsDatabase {
  integrity: "ok" | "error";
  integrityError?: string;
  filePath: string;
  fileSize: number;
  lastModified: string;
}

export interface DiagnosticsStaleCursor {
  accountId: string;
  lastSuccessfulAt: string | null;
  ageHours: number;
}

export interface DiagnosticsSync {
  /** Profile-wide last successful sync timestamp, or null if never. */
  lastSuccessfulAt: string | null;
  /** Hours since the last successful sync, or null if there is none. */
  ageHours: number | null;
  /** Per-account staleness report; mirrors lastSuccessfulAt for all accounts
   *  because SyncRun does not yet store a per-account cursor. */
  staleCursors: readonly DiagnosticsStaleCursor[];
}

export interface DiagnosticsWebhooks {
  pending: number;
  processed: number;
  failed: number;
  ignored: number;
  duplicate: number;
}

export interface DiagnosticsDuplicates {
  last24h: number;
  sinceFirstRun: number;
}

export interface DiagnosticsToken {
  present: boolean;
  storage: "secure" | "session";
  persistence: "persistent" | "session";
  fallbackReason?: string;
}

export interface DiagnosticsSnapshot {
  schemaVersion: string;
  profile: string;
  source: "fixture" | "monobank";
  version: typeof version;
  architecture: typeof productArchitecture;
  generatedAt: string;
  secureStorage: DiagnosticsSecureStorage;
  database: DiagnosticsDatabase;
  sync: DiagnosticsSync;
  webhooks: DiagnosticsWebhooks;
  duplicates: DiagnosticsDuplicates;
  token: DiagnosticsToken;
}

export interface SupportBundleSnapshot extends DiagnosticsSnapshot {
  /** Always true on support bundle responses. */
  supportBundle: true;
  /** Token field is omitted on support bundles; this flag confirms it. */
  tokenRedacted: true;
}

export interface CollectDiagnosticsTokenStatus {
  hasToken: boolean;
  storage: MonobankTokenStoreStorage;
  persistence: MonobankTokenStorePersistence;
  fallbackReason?: string;
}

export interface CollectDiagnosticsOptions {
  db: SqliteLedgerDb;
  queryService: LedgerQueryService;
  monobankTokenStore: MonobankTokenStore;
  profile: string;
  source: "fixture" | "monobank";
  databasePath: string;
  tokenStatus: CollectDiagnosticsTokenStatus;
  now?: () => Date;
  staleCursorHours?: number;
  schemaVersion?: string;
}

export const DIAGNOSTICS_SCHEMA_VERSION = "1";
const STALE_CURSOR_HOURS_DEFAULT = 24;

function backendForPlatform(platform: NodeJS.Platform): SecureStorageBackend {
  if (platform === "darwin") return "keychain";
  if (platform === "linux") return "secret-service";
  return "session";
}

async function collectDatabaseMetadata(
  databasePath: string,
  db: SqliteLedgerDb,
): Promise<DiagnosticsDatabase> {
  let integrity: "ok" | "error" = "ok";
  let integrityErrorMessage: string | undefined;
  let fileSize = 0;
  let lastModified = new Date(0).toISOString();

  try {
    const dbInfo = await db.getDatabaseInfo();
    integrity = dbInfo.integrityCheck === "ok" ? "ok" : "error";
    if (integrity === "error") {
      integrityErrorMessage = dbInfo.integrityCheck;
    }
  } catch (error) {
    integrity = "error";
    integrityErrorMessage =
      error instanceof Error ? error.message : "unknown integrity error";
  }

  try {
    const fileStat = await stat(databasePath);
    fileSize = fileStat.size;
    lastModified = fileStat.mtime.toISOString();
  } catch {
    // File may not exist yet; defaults already populated.
  }

  const result: DiagnosticsDatabase = {
    integrity,
    filePath: databasePath,
    fileSize,
    lastModified,
  };
  if (integrityErrorMessage !== undefined) {
    result.integrityError = integrityErrorMessage;
  }
  return result;
}

async function collectSecureStorage(
  monobankTokenStore: MonobankTokenStore,
  profile: string,
): Promise<DiagnosticsSecureStorage> {
  const platform = process.platform;
  const backend = backendForPlatform(platform);
  const status = await monobankTokenStore.getStatus?.(profile);

  if (status === undefined) {
    return { available: false, platform, backend, reason: "no_status_probe" };
  }

  if (status.storage === "session") {
    return {
      available: false,
      platform,
      backend,
      reason: status.fallbackReason ?? "secure_storage_unavailable",
    };
  }

  return { available: true, platform, backend };
}

function isSuccessLike(status: SyncRunStatus): boolean {
  return status === "success" || status === "partial";
}

function collectSyncState(
  runs: readonly SyncRun[],
  accounts: readonly AccountBalance[],
  now: Date,
  staleCursorHours: number,
): DiagnosticsSync {
  let lastSuccessfulAt: string | null = null;
  for (const run of runs) {
    if (!isSuccessLike(run.status)) continue;
    if (run.finishedAt === undefined) continue;
    if (lastSuccessfulAt === null || run.finishedAt > lastSuccessfulAt) {
      lastSuccessfulAt = run.finishedAt;
    }
  }

  const ageHours: number | null =
    lastSuccessfulAt === null
      ? null
      : (now.getTime() - new Date(lastSuccessfulAt).getTime()) /
        (1000 * 60 * 60);

  const staleCursors: DiagnosticsStaleCursor[] = [];
  for (const account of accounts) {
    if (
      lastSuccessfulAt === null ||
      ageHours === null ||
      ageHours > staleCursorHours
    ) {
      staleCursors.push({
        accountId: account.accountId,
        lastSuccessfulAt,
        ageHours: ageHours ?? Number.POSITIVE_INFINITY,
      });
    }
  }

  return { lastSuccessfulAt, ageHours, staleCursors };
}

function collectWebhooks(
  events: readonly StoredWebhookEvent[],
  now: Date,
): { webhooks: DiagnosticsWebhooks; duplicates: DiagnosticsDuplicates } {
  const counters: DiagnosticsWebhooks = {
    pending: 0,
    processed: 0,
    failed: 0,
    ignored: 0,
    duplicate: 0,
  };
  let duplicatesLast24h = 0;
  const last24hMs = now.getTime() - 24 * 60 * 60 * 1000;

  for (const event of events) {
    if (event.status === "pending") counters.pending += 1;
    else if (event.status === "processed") counters.processed += 1;
    else if (event.status === "failed") counters.failed += 1;
    else if (event.status === "ignored") counters.ignored += 1;
    else if (event.status === "duplicate") {
      counters.duplicate += 1;
      const receivedAtMs = new Date(event.receivedAt).getTime();
      if (Number.isFinite(receivedAtMs) && receivedAtMs >= last24hMs) {
        duplicatesLast24h += 1;
      }
    }
  }

  return {
    webhooks: counters,
    duplicates: {
      last24h: duplicatesLast24h,
      sinceFirstRun: counters.duplicate,
    },
  };
}

function buildTokenSnapshot(
  tokenStatus: CollectDiagnosticsTokenStatus,
): DiagnosticsToken {
  const result: DiagnosticsToken = {
    present: tokenStatus.hasToken,
    storage: tokenStatus.storage,
    persistence: tokenStatus.persistence,
  };
  if (tokenStatus.fallbackReason !== undefined) {
    result.fallbackReason = tokenStatus.fallbackReason;
  }
  return result;
}

/**
 * Pure aggregation entry point: collect a diagnostics snapshot.
 * All data sources are passed in; this function performs no I/O of its own.
 * Used by the route handler and by tests.
 */
export async function collectDiagnostics(
  options: CollectDiagnosticsOptions,
): Promise<DiagnosticsSnapshot> {
  const now = options.now?.() ?? new Date();
  const staleCursorHours =
    options.staleCursorHours ?? STALE_CURSOR_HOURS_DEFAULT;

  const [database, secureStorage, accounts, runs, events] = await Promise.all([
    collectDatabaseMetadata(options.databasePath, options.db),
    collectSecureStorage(options.monobankTokenStore, options.profile),
    options.queryService
      .getAccountBalances(options.profile)
      .catch(() => [] as readonly AccountBalance[]),
    options.queryService
      .listSyncRuns(options.profile, 200)
      .catch(() => [] as readonly SyncRun[]),
    options.queryService
      .listWebhookEvents(options.profile, 5000)
      .catch(() => [] as readonly StoredWebhookEvent[]),
  ]);

  const { webhooks, duplicates } = collectWebhooks(events, now);
  const sync = collectSyncState(runs, accounts, now, staleCursorHours);

  return {
    schemaVersion: options.schemaVersion ?? DIAGNOSTICS_SCHEMA_VERSION,
    profile: options.profile,
    source: options.source,
    version,
    architecture: productArchitecture,
    generatedAt: now.toISOString(),
    secureStorage,
    database,
    sync,
    webhooks,
    duplicates,
    token: buildTokenSnapshot(options.tokenStatus),
  };
}

/**
 * Build a redacted support bundle from a diagnostics snapshot. Strips the
 * `token` field and runs the full payload through the privacy redactor as a
 * belt-and-braces guarantee against leaked bytes.
 */
export function toSupportBundle(
  snapshot: DiagnosticsSnapshot,
): SupportBundleSnapshot {
  const { token: _token, ...rest } = snapshot;
  void _token;
  const json = JSON.stringify({
    ...rest,
    supportBundle: true,
    tokenRedacted: true,
  });
  const redacted = redactSensitiveText(json);
  return JSON.parse(redacted) as SupportBundleSnapshot;
}

/**
 * Convenience: aggregate + redact in one call.
 */
export async function collectSupportBundle(
  options: CollectDiagnosticsOptions,
): Promise<SupportBundleSnapshot> {
  const snapshot = await collectDiagnostics(options);
  return toSupportBundle(snapshot);
}
