import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import {
  createLedgerExport,
  createLocalConfigurationExport,
  exportPresetNames,
  isExportFormat,
  isExportPreset,
  parseLocalConfigurationImport,
  type ExportFormat,
  type ExportPreset,
} from "../../exports/index.js";
import type {
  LedgerEntry,
  LocalAppSettings,
  LocalExportRecord,
} from "../../storage/index.js";
import {
  localApiErrorResponseSchema,
  objectResponseSchema,
  readBooleanQuery,
  readNumberQuery,
  readStringQuery,
  type LocalApiRouteContext,
} from "./shared.js";

interface ExportRoutesContext extends LocalApiRouteContext {
  withLocalAppSettingsDefaults: (
    profile: string,
    source: "fixture" | "monobank",
    settings: LocalAppSettings | undefined,
  ) => LocalAppSettings;
}

const ledgerExportQuerySchema = {
  type: "object",
  properties: {
    format: { type: "string" },
    preset: { type: "string" },
    from: { type: "integer", minimum: 0 },
    to: { type: "integer", minimum: 0 },
    accountId: { type: "string" },
    categoryId: { type: "string" },
    merchantName: { type: "string" },
    status: { type: "string", enum: ["hold", "posted"] },
    reviewState: {
      type: "string",
      enum: ["needs_review", "reviewed", "ignored"],
    },
    currencyCode: { type: "integer", minimum: 1 },
    amountMin: { type: "integer" },
    amountMax: { type: "integer" },
    tag: { type: "string" },
    includeExcludedAccounts: { type: "boolean" },
    destination: { enum: ["browser_download", "local_folder"] },
  },
} as const;

const ledgerExportBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: ledgerExportQuerySchema.properties,
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

function readLedgerExportRequest(
  profile: string,
  value: Record<string, unknown>,
): {
  request: {
    profile: string;
    format?: ExportFormat;
    preset?: ExportPreset;
    from?: number;
    to?: number;
    accountIds?: readonly string[];
    categoryIds?: readonly string[];
    merchantName?: string;
    status?: "hold" | "posted";
    reviewState?: LedgerEntry["reviewState"];
    currencyCode?: number;
    amountMin?: number;
    amountMax?: number;
    tag?: string;
    includeExcludedAccounts?: boolean;
  };
  error?: { code: string; message: string };
} {
  const format = readStringQuery(value.format);
  const preset = readStringQuery(value.preset);
  const from = readNumberQuery(value.from);
  const to = readNumberQuery(value.to);
  const accountId = readStringQuery(value.accountId);
  const categoryId = readStringQuery(value.categoryId);
  const merchantName = readStringQuery(value.merchantName);
  const status = readStringQuery(value.status);
  const reviewState = readStringQuery(value.reviewState);
  const currencyCode = readNumberQuery(value.currencyCode);
  const amountMin = readNumberQuery(value.amountMin);
  const amountMax = readNumberQuery(value.amountMax);
  const tag = readStringQuery(value.tag);
  const includeExcludedAccounts = readBooleanQuery(
    value.includeExcludedAccounts,
  );

  if (format && (!isExportFormat(format) || format === "sqlite")) {
    return {
      request: { profile },
      error: {
        code: "unsupported_export_format",
        message: "Supported export formats: csv, json, jsonl, journal-csv",
      },
    };
  }

  if (preset && !isExportPreset(preset)) {
    return {
      request: { profile },
      error: {
        code: "unsupported_export_preset",
        message: `Supported export presets: ${exportPresetNames.join(", ")}`,
      },
    };
  }

  return {
    request: {
      profile,
      ...(format ? { format: format as ExportFormat } : {}),
      ...(preset ? { preset: preset as ExportPreset } : {}),
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(accountId ? { accountIds: [accountId] } : {}),
      ...(categoryId ? { categoryIds: [categoryId] } : {}),
      ...(merchantName ? { merchantName } : {}),
      ...(status === "hold" || status === "posted" ? { status } : {}),
      ...(reviewState === "needs_review" ||
      reviewState === "reviewed" ||
      reviewState === "ignored"
        ? { reviewState }
        : {}),
      ...(currencyCode !== undefined ? { currencyCode } : {}),
      ...(amountMin !== undefined ? { amountMin } : {}),
      ...(amountMax !== undefined ? { amountMax } : {}),
      ...(tag ? { tag } : {}),
      ...(includeExcludedAccounts === true ? { includeExcludedAccounts } : {}),
    },
  };
}

function localExportRecord(
  profile: string,
  ledgerExport: Awaited<ReturnType<typeof createLedgerExport>>,
  destination: LocalExportRecord["destination"],
  filePath?: string,
): LocalExportRecord {
  const completedAt = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    profile,
    format: ledgerExport.format,
    ...(ledgerExport.preset ? { preset: ledgerExport.preset } : {}),
    filters: ledgerExport.filters,
    rowCount: ledgerExport.rowCount,
    destination,
    ...(filePath === undefined ? {} : { filePath }),
    status: "success",
    createdAt: completedAt,
    completedAt,
  };
}

export function registerExportRoutes(
  app: FastifyInstance,
  context: ExportRoutesContext,
): void {
  app.get(
    `${context.apiPrefix}/exports/ledger`,
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
      const services = await context.getServices();
      const { request: exportRequest, error } = readLedgerExportRequest(
        services.profile,
        request.query as Record<string, unknown>,
      );

      if (error !== undefined) {
        reply.code(400);
        return {
          error: error.code,
          message: error.message,
        };
      }

      const ledgerExport = await createLedgerExport(services.db, exportRequest);
      await services.db.recordLocalExport(
        localExportRecord(services.profile, ledgerExport, "browser_download"),
      );

      reply.header("content-type", ledgerExport.contentType);
      reply.header(
        "content-disposition",
        `attachment; filename="${ledgerExport.fileName}"`,
      );

      return ledgerExport.body;
    },
  );

  app.post(
    `${context.apiPrefix}/exports/ledger`,
    {
      schema: {
        body: ledgerExportBodySchema,
        response: {
          200: objectResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<LocalExportRecord | { error: string; message: string }> => {
      const services = await context.getServices();
      const settings = context.withLocalAppSettingsDefaults(
        services.profile,
        services.source,
        await services.db.getLocalAppSettings(services.profile),
      );
      const { request: exportRequest, error } = readLedgerExportRequest(
        services.profile,
        (request.body ?? {}) as Record<string, unknown>,
      );

      if (error !== undefined) {
        reply.code(400);
        return {
          error: error.code,
          message: error.message,
        };
      }

      if (!settings.exportDirectory) {
        reply.code(400);
        return {
          error: "export_directory_required",
          message:
            "Set a local export directory in Settings before saving exports to a folder.",
        };
      }

      try {
        const ledgerExport = await createLedgerExport(
          services.db,
          exportRequest,
        );
        await mkdir(settings.exportDirectory, { recursive: true });
        const filePath = path.join(
          settings.exportDirectory,
          ledgerExport.fileName,
        );
        await writeFile(filePath, ledgerExport.body, "utf8");
        const record = localExportRecord(
          services.profile,
          ledgerExport,
          "local_folder",
          filePath,
        );

        await services.db.recordLocalExport(record);

        return record;
      } catch (error) {
        reply.code(400);
        return {
          error: "export_failed",
          message:
            error instanceof Error ? error.message : "Export could not be run.",
        };
      }
    },
  );

  app.get(
    `${context.apiPrefix}/exports/history`,
    {
      schema: {
        response: {
          200: { type: "array", items: objectResponseSchema },
        },
      },
    },
    async (): Promise<readonly LocalExportRecord[]> => {
      const services = await context.getServices();

      return services.db.listLocalExports(services.profile, 20);
    },
  );

  app.get(
    `${context.apiPrefix}/exports/local-configuration`,
    {
      schema: {
        response: {
          200: { type: "string" },
        },
      },
    },
    async (_request, reply) => {
      const services = await context.getServices();
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
    `${context.apiPrefix}/imports/local-configuration`,
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
      const services = await context.getServices();

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
