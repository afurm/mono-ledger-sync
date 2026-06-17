import type { FastifyInstance } from "fastify";

import type {
  BudgetProgress,
  Category,
  CategoryRule,
  LedgerAccount,
  LedgerCategorySpending,
  LedgerJar,
  LedgerSummary,
  MerchantCleanupRule,
  NetWorthTrend,
  SavingsGoalProgress,
} from "../../storage/index.js";
import {
  localApiErrorResponseSchema,
  readCategoryRuleInput,
  readMonthlyCategoryBudgetInput,
  type LocalApiRouteContext,
} from "./shared.js";

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

const categoryRuleBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["categoryId"],
  properties: {
    categoryId: { type: "string", minLength: 1 },
    name: { type: "string" },
    merchantContains: { type: "string" },
    descriptionContains: { type: "string" },
    mcc: { type: "number" },
    amountDirection: {
      type: "string",
      enum: ["income", "expense", "any"],
    },
    priority: { type: "number" },
    isEnabled: { type: "boolean" },
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

export function registerLedgerRoutes(
  app: FastifyInstance,
  context: LocalApiRouteContext,
): void {
  app.patch(
    `${context.apiPrefix}/ledger/budgets/monthly/:id/close`,
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
      const services = await context.getServices();
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
    `${context.apiPrefix}/ledger/budgets/monthly/:id/reopen`,
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
      const services = await context.getServices();
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
    `${context.apiPrefix}/ledger/summary`,
    {
      schema: {
        response: {
          200: ledgerSummaryResponseSchema,
        },
      },
    },
    async (): Promise<LedgerSummary> => {
      const services = await context.getServices();

      return services.queryService.getLedgerSummary(services.profile);
    },
  );

  app.get(
    `${context.apiPrefix}/ledger/net-worth-trend`,
    {
      schema: {
        response: {
          200: netWorthTrendResponseSchema,
        },
      },
    },
    async (): Promise<NetWorthTrend> => {
      const services = await context.getServices();

      return services.queryService.getNetWorthTrend(services.profile);
    },
  );

  app.get(
    `${context.apiPrefix}/ledger/accounts`,
    {
      schema: {
        response: {
          200: ledgerAccountsResponseSchema,
        },
      },
    },
    async (): Promise<readonly LedgerAccount[]> => {
      const services = await context.getServices();

      return services.queryService.listAccounts(services.profile);
    },
  );

  app.get(
    `${context.apiPrefix}/ledger/jars`,
    {
      schema: {
        response: {
          200: ledgerJarsResponseSchema,
        },
      },
    },
    async (): Promise<readonly LedgerJar[]> => {
      const services = await context.getServices();

      return services.queryService.listJars(services.profile);
    },
  );

  app.get(
    `${context.apiPrefix}/ledger/savings-goal-progress`,
    {
      schema: {
        response: {
          200: savingsGoalProgressResponseSchema,
        },
      },
    },
    async (): Promise<readonly SavingsGoalProgress[]> => {
      const services = await context.getServices();

      return services.queryService.listSavingsGoalProgress(services.profile);
    },
  );

  app.get(
    `${context.apiPrefix}/ledger/categories`,
    {
      schema: {
        response: {
          200: ledgerCategoriesResponseSchema,
        },
      },
    },
    async (): Promise<readonly Category[]> => {
      const services = await context.getServices();

      return services.queryService.listCategories(services.profile);
    },
  );

  app.get(
    `${context.apiPrefix}/ledger/category-rules`,
    {
      schema: {
        response: {
          200: ledgerCategoryRulesResponseSchema,
        },
      },
    },
    async (): Promise<readonly CategoryRule[]> => {
      const services = await context.getServices();

      return services.queryService.listCategoryRules(services.profile);
    },
  );

  app.post(
    `${context.apiPrefix}/ledger/category-rules`,
    {
      schema: {
        body: categoryRuleBodySchema,
        response: {
          200: { type: "object", additionalProperties: true },
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<CategoryRule | { error: string; message: string }> => {
      const services = await context.getServices();

      try {
        return await services.writeService.createCategoryRule(
          readCategoryRuleInput(request.body),
          services.profile,
        );
      } catch (error) {
        reply.code(400);

        return {
          error: "invalid_category_rule",
          message:
            error instanceof Error
              ? error.message
              : "Category rule could not be saved.",
        };
      }
    },
  );

  app.get(
    `${context.apiPrefix}/ledger/merchant-cleanup-rules`,
    {
      schema: {
        response: {
          200: merchantCleanupRulesResponseSchema,
        },
      },
    },
    async (): Promise<readonly MerchantCleanupRule[]> => {
      const services = await context.getServices();

      return services.queryService.listMerchantCleanupRules(services.profile);
    },
  );

  app.get(
    `${context.apiPrefix}/ledger/category-spending`,
    {
      schema: {
        response: {
          200: ledgerCategorySpendingResponseSchema,
        },
      },
    },
    async (): Promise<readonly LedgerCategorySpending[]> => {
      const services = await context.getServices();

      return services.queryService.listCategorySpending(services.profile);
    },
  );

  app.get(
    `${context.apiPrefix}/ledger/budget-progress`,
    {
      schema: {
        response: {
          200: budgetProgressResponseSchema,
        },
      },
    },
    async (): Promise<readonly BudgetProgress[]> => {
      const services = await context.getServices();

      return services.queryService.listBudgetProgress(services.profile);
    },
  );

  app.post(
    `${context.apiPrefix}/ledger/budgets/monthly`,
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
      const services = await context.getServices();

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
    `${context.apiPrefix}/ledger/budgets/monthly/:id`,
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
      const services = await context.getServices();
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
}
