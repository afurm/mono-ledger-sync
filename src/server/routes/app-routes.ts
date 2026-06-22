import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import type { LedgerSource } from "../../core/index.js";
import { DomainError } from "../../domain/index.js";
import type {
  MonobankAdapter,
  MonobankRateLimitState,
} from "../../monobank/index.js";
import type { SqliteLedgerDb } from "../../sqlite/index.js";
import type {
  LedgerQueryService,
  LedgerWriteService,
  LocalAppSettings,
} from "../../storage/index.js";
import type {
  MonobankTokenStoreFallbackReason,
  MonobankTokenStorePersistence,
  MonobankTokenStoreStorage,
} from "../../security/index.js";

interface LocalApiAccessBinding {
  localOnly: boolean;
  host: string;
  authentication: "none" | "passcode";
}

interface LocalApiWebhookSettings {
  enabled: boolean;
  path: string;
  host: string;
  port: number;
  url: string;
}

interface LocalApiMonobankClientInfoSummary {
  clientId: string;
  name: string;
  accounts: number;
  jars: number;
  masked: true;
}

interface LocalApiMonobankTokenStatus {
  profile: string;
  hasToken: boolean;
  storage: MonobankTokenStoreStorage;
  persistence: MonobankTokenStorePersistence;
  fallbackReason?: MonobankTokenStoreFallbackReason;
  clientInfo?: LocalApiMonobankClientInfoSummary;
}

type LocalApiMonobankTokenOperationResult = LocalApiMonobankTokenStatus & {
  error?: string;
  message?: string;
  upstreamStatus?: number;
};

interface LocalAppRouteServices {
  profile: string;
  source: LedgerSource;
  dataDir: string;
  databasePath: string;
  db: SqliteLedgerDb;
  adapter: MonobankAdapter;
  queryService: LedgerQueryService;
  writeService: LedgerWriteService;
}

interface LocalApiStorageInfo {
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
  backups: readonly {
    path: string;
    modifiedAt: string;
    bytes: number;
  }[];
  latestBackupPath?: string;
  latestBackupAt?: string;
  lastCompactAt?: string;
}

interface LocalAppRoutesOptions {
  apiPrefix: string;
  architecture: {
    ui: string;
    server: string;
    storage: string;
  };
  framework: string;
  version: string;
  profile: string;
  now: () => number;
  localApiAccess: LocalApiAccessBinding;
  getServices: () => Promise<LocalAppRouteServices>;
  getMonobankToken: () => string | undefined;
  saveMonobankToken: (
    token: string,
    profile: string,
  ) => Promise<LocalApiMonobankTokenOperationResult>;
  recheckMonobankToken: (
    profile: string,
  ) => Promise<LocalApiMonobankTokenOperationResult>;
  removeMonobankToken: () => Promise<LocalApiMonobankTokenStatus>;
  setSource: (source: LedgerSource) => Promise<void>;
  restoreLocalDatabaseFromBackup: (
    backupPath: string,
  ) => Promise<LocalApiStorageInfo>;
  getMonobankTokenStoreStatus: (
    profile: string,
  ) => Promise<
    Pick<
      LocalApiMonobankTokenStatus,
      "storage" | "persistence" | "fallbackReason"
    >
  >;
  localWebhookRoutePath: string;
  resolveWebhookSettings: () => Omit<
    LocalApiWebhookSettings,
    "enabled" | "path"
  >;
  monobankRateLimitState: MonobankRateLimitState;
  interruptStaleRunningSyncRuns: (
    db: SqliteLedgerDb,
    profile: string,
    nowMs: number,
  ) => Promise<number>;
  withLocalAppSettingsDefaults: (
    profile: string,
    source: LedgerSource,
    settings: LocalAppSettings | undefined,
  ) => LocalAppSettings;
  readLocalAppSettingsUpdate: (
    body: unknown,
  ) => Omit<LocalAppSettings, "profile" | "updatedAt">;
  backupDirectory: (dataDir: string) => string;
  backupFileName: (profile: string, timestamp: string) => string;
  isValidProfileBackupPath: (
    backupPath: string,
    services: LocalAppRouteServices,
  ) => boolean;
  readStorageInfo: (
    services: LocalAppRouteServices,
  ) => Promise<LocalApiStorageInfo>;
}

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
    "settings",
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
      required: ["schedule"],
      properties: {
        lastSyncedAt: { type: "string" },
        nextSyncAllowedAt: { type: "number" },
        schedule: { enum: ["manual", "hourly", "daily", "app_start"] },
      },
    },
    settings: {
      type: "object",
      additionalProperties: true,
    },
  },
} as const;

const appSettingsBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    syncSchedule: { enum: ["manual", "hourly", "daily", "app_start"] },
    excludedAccountIds: {
      type: "array",
      maxItems: 100,
      items: { type: "string", minLength: 1, maxLength: 200 },
    },
    exportDirectory: { type: "string", maxLength: 2000 },
    budgetWarningThreshold: { type: "integer", minimum: 1, maximum: 100 },
    rawStatementRetentionDays: { type: "integer", minimum: 0, maximum: 3650 },
  },
} as const;

const localDataDeletionBodySchema = {
  type: "object",
  required: ["confirmProfile", "confirmDatabasePath"],
  additionalProperties: false,
  properties: {
    confirmProfile: { type: "string", minLength: 1 },
    confirmDatabasePath: { type: "string", minLength: 1 },
    ledgerData: { type: "boolean" },
    token: { type: "boolean" },
  },
} as const;

const storageRestoreBodySchema = {
  type: "object",
  required: ["backupPath", "confirmProfile", "confirmDatabasePath"],
  additionalProperties: false,
  properties: {
    backupPath: { type: "string", minLength: 1 },
    confirmProfile: { type: "string", minLength: 1 },
    confirmDatabasePath: { type: "string", minLength: 1 },
  },
} as const;

const objectResponseSchema = {
  type: "object",
  additionalProperties: true,
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

const localApiErrorResponseSchema = {
  type: "object",
  required: ["error", "message"],
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    upstreamStatus: { type: "number" },
  },
} as const;

function createHealthResponseSchema(options: LocalAppRoutesOptions) {
  return {
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
      version: { const: options.version },
      framework: { const: options.framework },
      apiPrefix: { const: options.apiPrefix },
      architecture: {
        type: "object",
        required: ["ui", "server", "storage"],
        properties: {
          ui: { const: options.architecture.ui },
          server: { const: options.architecture.server },
          storage: { const: options.architecture.storage },
        },
      },
    },
  } as const;
}

export function registerLocalAppRoutes(
  app: FastifyInstance,
  options: LocalAppRoutesOptions,
): void {
  async function readAppConfig() {
    const services = await options.getServices();
    await options.interruptStaleRunningSyncRuns(
      services.db,
      services.profile,
      options.now(),
    );
    const monobankToken = options.getMonobankToken();
    const tokenStoreStatus = await options.getMonobankTokenStoreStatus(
      services.profile,
    );
    const settings = options.withLocalAppSettingsDefaults(
      services.profile,
      services.source,
      await services.db.getLocalAppSettings(services.profile),
    );
    const syncRuns = await services.db.listSyncRuns(services.profile, 1);
    const lastSuccessfulRun = syncRuns.find((run) => run.status === "success");
    const lastSyncedAt = lastSuccessfulRun?.startedAt;
    const nextSyncAllowedAt = options.monobankRateLimitState.getNextAllowedAt(
      "personal",
      Date.now(),
    );
    const personalEverCalled =
      options.monobankRateLimitState.getNextAllowedAt(
        "personal",
        Number.NEGATIVE_INFINITY,
      ) > Number.NEGATIVE_INFINITY;

    return {
      profile: services.profile,
      source: services.source,
      dataDir: services.dataDir,
      databasePath: services.databasePath,
      localOnly: options.localApiAccess.localOnly,
      access: options.localApiAccess,
      token: {
        profile: services.profile,
        hasToken: monobankToken !== undefined,
        ...tokenStoreStatus,
      },
      settings,
      webhook: {
        enabled: true,
        path: options.localWebhookRoutePath,
        ...options.resolveWebhookSettings(),
      },
      sync: {
        schedule: settings.syncSchedule ?? "manual",
        ...(lastSyncedAt !== undefined ? { lastSyncedAt } : {}),
        ...(personalEverCalled ? { nextSyncAllowedAt } : {}),
      },
    };
  }

  app.get(
    `${options.apiPrefix}/health`,
    {
      schema: {
        response: {
          200: createHealthResponseSchema(options),
        },
      },
    },
    async () => ({
      status: "ok",
      localOnly: options.localApiAccess.localOnly,
      version: options.version,
      framework: options.framework,
      apiPrefix: options.apiPrefix,
      architecture: options.architecture,
    }),
  );

  app.get(
    `${options.apiPrefix}/app/config`,
    {
      schema: {
        response: {
          200: appConfigResponseSchema,
        },
      },
    },
    async () => readAppConfig(),
  );

  app.post(
    `${options.apiPrefix}/app/workspace`,
    {
      schema: {
        response: {
          200: appConfigResponseSchema,
        },
      },
    },
    async () => {
      const services = await options.getServices();

      await services.db.migrate();
      await services.db.updateLocalAppSettings(services.profile, {
        source: services.source,
      });

      return readAppConfig();
    },
  );

  app.post(
    `${options.apiPrefix}/app/source`,
    {
      schema: {
        body: appSourceBodySchema,
        response: {
          200: appConfigResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { source: LedgerSource };

      try {
        await options.setSource(body.source);
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

  app.patch(
    `${options.apiPrefix}/app/settings`,
    {
      schema: {
        body: appSettingsBodySchema,
        response: {
          200: appConfigResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const services = await options.getServices();

      try {
        await services.db.updateLocalAppSettings(services.profile, {
          ...options.readLocalAppSettingsUpdate(request.body),
          source: services.source,
        });

        return readAppConfig();
      } catch (error) {
        reply.code(400);

        return {
          error: "invalid_app_settings",
          message:
            error instanceof Error
              ? error.message
              : "App settings could not be updated.",
        };
      }
    },
  );

  app.get(
    `${options.apiPrefix}/app/storage`,
    {
      schema: {
        response: {
          200: objectResponseSchema,
        },
      },
    },
    async () => {
      const services = await options.getServices();

      return options.readStorageInfo(services);
    },
  );

  app.post(
    `${options.apiPrefix}/app/storage/backup`,
    {
      schema: {
        response: {
          200: objectResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const services = await options.getServices();
      const createdAt = new Date().toISOString();
      const backupsDir = options.backupDirectory(services.dataDir);
      const backupPath = path.join(
        backupsDir,
        options.backupFileName(services.profile, createdAt),
      );

      try {
        await services.db.checkpoint();
        await mkdir(backupsDir, { recursive: true });
        await copyFile(services.databasePath, backupPath);
        const backupStat = await stat(backupPath);
        await services.db.updateLocalAppSettings(services.profile, {
          lastBackupAt: createdAt,
        });

        return {
          profile: services.profile,
          backupPath,
          databasePath: services.databasePath,
          createdAt,
          bytes: backupStat.size,
        };
      } catch (error) {
        reply.code(400);

        return {
          error: "backup_failed",
          message:
            error instanceof Error ? error.message : "Database backup failed.",
        };
      }
    },
  );

  app.post(
    `${options.apiPrefix}/app/storage/restore`,
    {
      schema: {
        body: storageRestoreBodySchema,
        response: {
          200: objectResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const services = await options.getServices();
      const body = request.body as {
        backupPath: string;
        confirmProfile: string;
        confirmDatabasePath: string;
      };
      const backupPath = path.resolve(body.backupPath);

      if (
        body.confirmProfile !== services.profile ||
        body.confirmDatabasePath !== services.databasePath
      ) {
        reply.code(400);

        return {
          error: "confirmation_required",
          message:
            "Type the exact profile and database path before restoring a backup.",
        };
      }

      if (!options.isValidProfileBackupPath(backupPath, services)) {
        reply.code(400);

        return {
          error: "invalid_backup_path",
          message:
            "Backup restore is limited to current-profile .sqlite files in the managed backup directory.",
        };
      }

      try {
        await stat(backupPath);

        return await options.restoreLocalDatabaseFromBackup(backupPath);
      } catch (error) {
        reply.code(400);

        return {
          error: "restore_failed",
          message:
            error instanceof Error
              ? error.message
              : "Database backup could not be restored.",
        };
      }
    },
  );

  app.post(
    `${options.apiPrefix}/app/storage/compact`,
    {
      schema: {
        response: {
          200: objectResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const services = await options.getServices();

      try {
        await services.db.compact();
        await services.db.updateLocalAppSettings(services.profile, {
          lastCompactAt: new Date().toISOString(),
        });

        return options.readStorageInfo(services);
      } catch (error) {
        reply.code(400);

        return {
          error: "compact_failed",
          message:
            error instanceof Error
              ? error.message
              : "Database compact could not be completed.",
        };
      }
    },
  );

  app.delete(
    `${options.apiPrefix}/app/local-data`,
    {
      schema: {
        body: localDataDeletionBodySchema,
        response: {
          200: objectResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const services = await options.getServices();
      const body = request.body as
        | {
            confirmProfile?: string;
            confirmDatabasePath?: string;
            ledgerData?: boolean;
            token?: boolean;
          }
        | undefined;
      const removeLedgerData = body?.ledgerData === true;
      const removeToken = body?.token === true;

      if (
        body?.confirmProfile !== services.profile ||
        body.confirmDatabasePath !== services.databasePath
      ) {
        reply.code(400);

        return {
          error: "confirmation_required",
          message:
            "Exact profile and database path confirmation is required before deleting local data.",
        };
      }

      if (!removeLedgerData && !removeToken) {
        reply.code(400);

        return {
          error: "invalid_delete_request",
          message: "Choose ledger data, token, or both to delete.",
        };
      }

      const deleted = removeLedgerData
        ? await services.db.clearProfileLedgerData(services.profile)
        : {};

      if (removeToken) {
        await options.removeMonobankToken();
      }

      return {
        profile: services.profile,
        databasePath: services.databasePath,
        tokenRemoved: removeToken,
        ledgerDataDeleted: removeLedgerData,
        deleted,
      };
    },
  );

  app.post(
    `${options.apiPrefix}/app/token`,
    {
      schema: {
        body: monobankTokenBodySchema,
        response: {
          200: monobankTokenResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as
        | { profile?: string; token: string }
        | undefined;
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

      if (body?.profile !== undefined && body.profile !== options.profile) {
        reply.code(400);

        return {
          error: "config_invalid",
          message: `Monobank token profile must match ${options.profile}.`,
        };
      }

      const result = await options.saveMonobankToken(token, options.profile);

      if ("error" in result) {
        reply.code(400);
        return result;
      }

      return result;
    },
  );

  app.delete(
    `${options.apiPrefix}/app/token`,
    {
      schema: {
        response: {
          200: monobankTokenResponseSchema,
        },
      },
    },
    async () => options.removeMonobankToken(),
  );

  app.post(
    `${options.apiPrefix}/app/token/recheck`,
    {
      schema: {
        response: {
          200: monobankTokenResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const result = await options.recheckMonobankToken(options.profile);

      if ("error" in result) {
        reply.code(400);
        return result;
      }

      return result;
    },
  );
}
