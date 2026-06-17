import type { FastifyInstance } from "fastify";

import type {
  BalanceProjectionReport,
  CashflowReport,
  CategoryTrendReport,
  MerchantTrendReport,
  MonthlySpendingReport,
  SavingsRateReport,
} from "../../storage/index.js";
import {
  localApiErrorResponseSchema,
  readNumberQuery,
  readStringQuery,
  type LocalApiRouteContext,
} from "./shared.js";

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

export function registerReportRoutes(
  app: FastifyInstance,
  context: LocalApiRouteContext,
): void {
  app.get(
    `${context.apiPrefix}/ledger/reports/monthly-spending`,
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
      const services = await context.getServices();
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
    `${context.apiPrefix}/ledger/reports/cashflow`,
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
      const services = await context.getServices();
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
    `${context.apiPrefix}/ledger/reports/savings-rate`,
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
      const services = await context.getServices();
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
    `${context.apiPrefix}/ledger/reports/balance-projection`,
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
      const services = await context.getServices();
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
    `${context.apiPrefix}/ledger/reports/category-trends`,
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
      const services = await context.getServices();
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
    `${context.apiPrefix}/ledger/reports/merchant-trends`,
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
      const services = await context.getServices();
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
}
