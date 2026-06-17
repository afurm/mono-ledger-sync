import type { FastifyInstance } from "fastify";

import type { SqliteLedgerDb } from "../../sqlite/index.js";
import {
  createProcessSignalAbortController,
  syncLedgerWithMonobank,
  type SyncLedgerResult,
} from "../../sync/index.js";
import type { SyncRun } from "../../storage/index.js";
import {
  localApiErrorResponseSchema,
  type LocalApiRouteContext,
} from "./shared.js";

interface SyncRoutesContext extends LocalApiRouteContext {
  now: () => number;
  getMonobankToken: () => string | undefined;
  interruptStaleRunningSyncRuns: (
    db: SqliteLedgerDb,
    profile: string,
    nowMs: number,
  ) => Promise<number>;
}

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
      enum: [
        "queued",
        "running",
        "success",
        "partial",
        "failed",
        "interrupted",
      ],
    },
    startedAt: { type: "string" },
    finishedAt: { type: "string" },
    errorMessage: { type: "string" },
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
    summary: {
      type: "object",
      additionalProperties: true,
    },
  },
} as const;

const syncRunsResponseSchema = {
  type: "array",
  items: syncRunResponseSchema,
} as const;

export function registerSyncRoutes(
  app: FastifyInstance,
  context: SyncRoutesContext,
): void {
  app.post(
    `${context.apiPrefix}/sync/run`,
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
      const services = await context.getServices();
      await context.interruptStaleRunningSyncRuns(
        services.db,
        services.profile,
        context.now(),
      );
      const monobankToken = context.getMonobankToken();

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
    `${context.apiPrefix}/sync/runs`,
    {
      schema: {
        response: {
          200: syncRunsResponseSchema,
        },
      },
    },
    async (): Promise<readonly SyncRun[]> => {
      const services = await context.getServices();
      await context.interruptStaleRunningSyncRuns(
        services.db,
        services.profile,
        context.now(),
      );

      return services.queryService.listSyncRuns(services.profile);
    },
  );
}
