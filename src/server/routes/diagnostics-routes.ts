import type { FastifyInstance } from "fastify";

import {
  collectDiagnostics,
  collectSupportBundle,
  type CollectDiagnosticsTokenStatus,
  type DiagnosticsSnapshot,
  type SupportBundleSnapshot,
} from "../diagnostics.js";
import type { MonobankTokenStore } from "../../security/index.js";
import type { LocalApiRouteContext, LocalApiRouteServices } from "./shared.js";

interface DiagnosticsRoutesContext extends LocalApiRouteContext {
  monobankTokenStore: MonobankTokenStore;
  buildDiagnosticsTokenStatus: (
    services: LocalApiRouteServices,
  ) => Promise<CollectDiagnosticsTokenStatus>;
}

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
        backend: {
          enum: ["keychain", "credential-manager", "secret-service", "session"],
        },
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
    ...diagnosticsResponseSchema.required.filter((key) => key !== "token"),
    "supportBundle",
    "tokenRedacted",
  ],
  properties: {
    ...diagnosticsResponseSchema.properties,
    supportBundle: { const: true },
    tokenRedacted: { const: true },
  },
} as const;

export function registerDiagnosticsRoutes(
  app: FastifyInstance,
  context: DiagnosticsRoutesContext,
): void {
  app.get(
    `${context.apiPrefix}/app/diagnostics`,
    {
      schema: {
        response: {
          200: diagnosticsResponseSchema,
        },
      },
    },
    async (): Promise<DiagnosticsSnapshot> => {
      const services = await context.getServices();
      const tokenStatus = await context.buildDiagnosticsTokenStatus(services);
      return collectDiagnostics({
        db: services.db,
        queryService: services.queryService,
        monobankTokenStore: context.monobankTokenStore,
        profile: services.profile,
        source: services.source,
        databasePath: services.databasePath,
        tokenStatus,
      });
    },
  );

  app.get(
    `${context.apiPrefix}/app/diagnostics/support-bundle`,
    {
      schema: {
        response: {
          200: supportBundleResponseSchema,
        },
      },
    },
    async (): Promise<SupportBundleSnapshot> => {
      const services = await context.getServices();
      const tokenStatus = await context.buildDiagnosticsTokenStatus(services);
      return collectSupportBundle({
        db: services.db,
        queryService: services.queryService,
        monobankTokenStore: context.monobankTokenStore,
        profile: services.profile,
        source: services.source,
        databasePath: services.databasePath,
        tokenStatus,
      });
    },
  );
}
