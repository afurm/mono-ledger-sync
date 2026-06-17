import type { FastifyInstance } from "fastify";

import {
  ledgerEntrySortDirections,
  ledgerEntrySortFields,
} from "../../storage/index.js";
import type { LedgerEntry, LedgerEntryPage } from "../../storage/index.js";
import {
  isLedgerEntrySortDirection,
  isLedgerEntrySortField,
  localApiErrorResponseSchema,
  readLedgerEntryAnnotationUpdate,
  readLedgerEntryBulkEditUpdate,
  readLedgerEntryCategoryRestoreEntries,
  readLedgerEntrySplitPlanUpdate,
  readNumberQuery,
  readStringQuery,
  type LocalApiRouteContext,
} from "./shared.js";

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
    reviewState: {
      type: "string",
      enum: ["needs_review", "reviewed", "ignored"],
    },
    reviewedSource: { type: "string", minLength: 1, maxLength: 80 },
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

const ledgerEntriesQuerySchema = {
  type: "object",
  properties: {
    accountId: { type: "string" },
    categoryId: { type: "string" },
    merchantName: { type: "string" },
    status: { type: "string", enum: ["hold", "posted"] },
    reviewState: {
      type: "string",
      enum: ["needs_review", "reviewed", "ignored"],
    },
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

export function registerTransactionRoutes(
  app: FastifyInstance,
  context: LocalApiRouteContext,
): void {
  app.get(
    `${context.apiPrefix}/ledger/transactions`,
    {
      schema: {
        querystring: ledgerEntriesQuerySchema,
        response: {
          200: ledgerEntriesPageResponseSchema,
        },
      },
    },
    async (request): Promise<LedgerEntryPage> => {
      const services = await context.getServices();
      const query = request.query as Record<string, string | string[]>;
      const entryQuery = {
        profile: services.profile,
      };
      const accountId = readStringQuery(query.accountId);
      const categoryId = readStringQuery(query.categoryId);
      const merchantName = readStringQuery(query.merchantName);
      const status = readStringQuery(query.status);
      const reviewState = readStringQuery(query.reviewState);
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

      if (
        reviewState === "needs_review" ||
        reviewState === "reviewed" ||
        reviewState === "ignored"
      ) {
        Object.assign(entryQuery, { reviewState });
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
    `${context.apiPrefix}/ledger/transactions/bulk-edit`,
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
      const services = await context.getServices();
      const { ids, update } = readLedgerEntryBulkEditUpdate(request.body);

      return services.writeService.updateTransactionsBulk(
        ids,
        update,
        services.profile,
      );
    },
  );

  app.patch(
    `${context.apiPrefix}/ledger/transactions/category-restore`,
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
      const services = await context.getServices();
      const entries = readLedgerEntryCategoryRestoreEntries(request.body);

      return services.writeService.restoreTransactionCategories(
        entries,
        services.profile,
      );
    },
  );

  app.patch(
    `${context.apiPrefix}/ledger/transactions/:id/annotation`,
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
      const services = await context.getServices();
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
    `${context.apiPrefix}/ledger/transactions/:id/split-plan`,
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
      const services = await context.getServices();
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
}
