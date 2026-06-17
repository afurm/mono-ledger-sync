import type { FastifyInstance } from "fastify";

import type {
  MissedRecurringPayment,
  RecurringCalendarEvent,
  RecurringDetectionCandidate,
  RecurringDetectionDecisionResult,
  RecurringItem,
  SubscriptionIncreaseAlert,
  UpcomingRecurringPayment,
} from "../../storage/index.js";
import {
  localApiErrorResponseSchema,
  readManualRecurringItemInput,
  readUtcDateQuery,
  type LocalApiRouteContext,
} from "./shared.js";

const upcomingRecurringPaymentsResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const missedRecurringPaymentsQuerySchema = {
  type: "object",
  properties: {
    asOf: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  },
  additionalProperties: false,
} as const;

const missedRecurringPaymentsResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const subscriptionIncreaseAlertsQuerySchema = {
  type: "object",
  properties: {
    asOf: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  },
  additionalProperties: false,
} as const;

const subscriptionIncreaseAlertsResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const recurringDetectionCandidatesResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

const recurringDetectionDecisionParamsSchema = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const;

const recurringDetectionDecisionResponseSchema = {
  type: "object",
  additionalProperties: true,
} as const;

const manualRecurringItemBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["accountId", "frequency"],
  properties: {
    accountId: { type: "string", minLength: 1, maxLength: 200 },
    categoryId: { type: "string", minLength: 0, maxLength: 120 },
    merchantName: { type: "string", minLength: 0, maxLength: 200 },
    frequency: {
      type: "string",
      enum: ["daily", "weekly", "monthly", "quarterly", "yearly", "irregular"],
    },
    expectedAmountMin: { type: "integer" },
    expectedAmountMax: { type: "integer" },
    isActive: { type: "boolean" },
    startedAt: { type: "string" },
  },
} as const;

const recurringCalendarQuerySchema = {
  type: "object",
  properties: {
    from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  },
  additionalProperties: false,
} as const;

const recurringCalendarResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

export function registerRecurringRoutes(
  app: FastifyInstance,
  context: LocalApiRouteContext,
): void {
  app.get(
    `${context.apiPrefix}/ledger/upcoming-recurring-payments`,
    {
      schema: {
        response: {
          200: upcomingRecurringPaymentsResponseSchema,
        },
      },
    },
    async (): Promise<readonly UpcomingRecurringPayment[]> => {
      const services = await context.getServices();

      return services.queryService.listUpcomingRecurringPayments(
        services.profile,
      );
    },
  );

  app.get(
    `${context.apiPrefix}/ledger/missed-recurring-payments`,
    {
      schema: {
        querystring: missedRecurringPaymentsQuerySchema,
        response: {
          200: missedRecurringPaymentsResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | readonly MissedRecurringPayment[]
      | {
          error: string;
          message: string;
        }
    > => {
      const query = request.query as Record<string, string | string[]>;

      try {
        const asOf = readUtcDateQuery(query.asOf, "asOf");
        const services = await context.getServices();

        return await services.queryService.listMissedRecurringPayments(
          services.profile,
          asOf,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Missed recurring payment query is invalid.";

        if (!/^asOf must /.test(message)) {
          throw error;
        }

        reply.code(400);

        return {
          error: "invalid_missed_recurring_payments_query",
          message,
        };
      }
    },
  );

  app.get(
    `${context.apiPrefix}/ledger/subscription-increase-alerts`,
    {
      schema: {
        querystring: subscriptionIncreaseAlertsQuerySchema,
        response: {
          200: subscriptionIncreaseAlertsResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | readonly SubscriptionIncreaseAlert[]
      | {
          error: string;
          message: string;
        }
    > => {
      const query = request.query as Record<string, string | string[]>;

      try {
        const asOf = readUtcDateQuery(query.asOf, "asOf");
        const services = await context.getServices();

        return await services.queryService.listSubscriptionIncreaseAlerts(
          services.profile,
          asOf,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Subscription increase alert query is invalid.";

        if (!/^asOf must /.test(message)) {
          throw error;
        }

        reply.code(400);

        return {
          error: "invalid_subscription_increase_alerts_query",
          message,
        };
      }
    },
  );

  app.post(
    `${context.apiPrefix}/ledger/recurring-items`,
    {
      schema: {
        body: manualRecurringItemBodySchema,
        response: {
          200: { type: "object", additionalProperties: true },
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<RecurringItem | { error: string; message: string }> => {
      const services = await context.getServices();

      try {
        return await services.writeService.createRecurringItem(
          readManualRecurringItemInput(request.body),
          services.profile,
        );
      } catch (error) {
        reply.code(400);
        return {
          error: "invalid_recurring_item",
          message:
            error instanceof Error
              ? error.message
              : "Recurring item could not be created.",
        };
      }
    },
  );

  app.get(
    `${context.apiPrefix}/ledger/recurring-detections`,
    {
      schema: {
        response: {
          200: recurringDetectionCandidatesResponseSchema,
        },
      },
    },
    async (): Promise<readonly RecurringDetectionCandidate[]> => {
      const services = await context.getServices();

      return services.queryService.detectRecurringTransactions(
        services.profile,
      );
    },
  );

  app.post(
    `${context.apiPrefix}/ledger/recurring-detections/:id/confirm`,
    {
      schema: {
        params: recurringDetectionDecisionParamsSchema,
        response: {
          200: recurringDetectionDecisionResponseSchema,
          400: localApiErrorResponseSchema,
          404: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | RecurringDetectionDecisionResult
      | {
          error: string;
          message: string;
        }
    > => {
      const params = request.params as { id?: string };
      const candidateId = params.id?.trim() ?? "";

      try {
        const services = await context.getServices();

        return await services.writeService.confirmRecurringDetection(
          candidateId,
          services.profile,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Recurring detection candidate could not be confirmed.";

        if (/was not found/.test(message)) {
          reply.code(404);

          return {
            error: "recurring_detection_not_found",
            message,
          };
        }

        reply.code(400);

        return {
          error: "invalid_recurring_detection_decision",
          message,
        };
      }
    },
  );

  app.post(
    `${context.apiPrefix}/ledger/recurring-detections/:id/ignore`,
    {
      schema: {
        params: recurringDetectionDecisionParamsSchema,
        response: {
          200: recurringDetectionDecisionResponseSchema,
          400: localApiErrorResponseSchema,
          404: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | RecurringDetectionDecisionResult
      | {
          error: string;
          message: string;
        }
    > => {
      const params = request.params as { id?: string };
      const candidateId = params.id?.trim() ?? "";

      try {
        const services = await context.getServices();

        return await services.writeService.ignoreRecurringDetection(
          candidateId,
          services.profile,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Recurring detection candidate could not be ignored.";

        if (/was not found/.test(message)) {
          reply.code(404);

          return {
            error: "recurring_detection_not_found",
            message,
          };
        }

        reply.code(400);

        return {
          error: "invalid_recurring_detection_decision",
          message,
        };
      }
    },
  );

  app.get(
    `${context.apiPrefix}/ledger/recurring-calendar`,
    {
      schema: {
        querystring: recurringCalendarQuerySchema,
        response: {
          200: recurringCalendarResponseSchema,
          400: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | readonly RecurringCalendarEvent[]
      | {
          error: string;
          message: string;
        }
    > => {
      const query = request.query as Record<string, string | string[]>;

      try {
        const from = readUtcDateQuery(query.from, "from");
        const to = readUtcDateQuery(query.to, "to");
        const services = await context.getServices();

        return await services.queryService.listRecurringCalendar(
          services.profile,
          from,
          to,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Recurring calendar range is invalid.";

        if (!/^(from|to) must |^Recurring calendar range /.test(message)) {
          throw error;
        }

        reply.code(400);

        return {
          error: "invalid_recurring_calendar_range",
          message,
        };
      }
    },
  );
}
