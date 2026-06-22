import type { FastifyInstance } from "fastify";

import { logStructured } from "../../logging/index.js";
import {
  assertMonobankPersonalWebhookEvent,
  MonobankValidationError,
  type MonobankPersonalWebhookEvent,
} from "../../monobank/index.js";
import type { StoredWebhookEvent } from "../../storage/index.js";
import {
  localApiErrorResponseSchema,
  type LocalApiRouteContext,
} from "./shared.js";

interface WebhookRoutesContext extends LocalApiRouteContext {
  localWebhookRoutePath: string;
  logSink?: (line: string) => void;
  isMalformedWebhookRateLimited: (profile: string, ip: string) => boolean;
  isWebhookAccountRateLimited: (profile: string, accountId: string) => boolean;
  webhookDeliveryMetadata: (
    headers: Record<string, unknown>,
    ip: string,
  ) => Record<string, string>;
}

const webhookEventResponseSchema = {
  type: "object",
  required: ["id", "profile", "accountId", "type", "receivedAt"],
  properties: {
    id: { type: "string" },
    profile: { type: "string" },
    accountId: { type: "string" },
    type: { type: "string" },
    statementItemId: { type: "string" },
    status: {
      type: "string",
      enum: ["pending", "processed", "duplicate", "ignored", "failed"],
    },
    receivedAt: { type: "string" },
    processedAt: { type: "string" },
  },
} as const;

const webhookEventsResponseSchema = {
  type: "array",
  items: webhookEventResponseSchema,
} as const;

const webhookAcceptedResponseSchema = {
  type: "object",
  required: ["accepted", "pullRequired", "event"],
  properties: {
    accepted: { const: true },
    pullRequired: { const: true },
    event: webhookEventResponseSchema,
  },
} as const;

const webhookValidationResponseSchema = {
  type: "string",
} as const;

export function registerWebhookRoutes(
  app: FastifyInstance,
  context: WebhookRoutesContext,
): void {
  app.get(
    `${context.apiPrefix}/webhooks/events`,
    {
      schema: {
        response: {
          200: webhookEventsResponseSchema,
        },
      },
    },
    async (): Promise<readonly StoredWebhookEvent[]> => {
      const services = await context.getServices();

      return services.queryService.listWebhookEvents(services.profile, 20);
    },
  );

  app.get(
    context.localWebhookRoutePath,
    {
      schema: {
        response: {
          200: webhookValidationResponseSchema,
        },
      },
    },
    async (): Promise<string> => "ok",
  );

  app.post(
    context.localWebhookRoutePath,
    {
      schema: {
        response: {
          200: webhookAcceptedResponseSchema,
          400: localApiErrorResponseSchema,
          429: localApiErrorResponseSchema,
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      | {
          accepted: true;
          pullRequired: true;
          event: StoredWebhookEvent;
        }
      | { error: string; message: string }
    > => {
      const services = await context.getServices();
      const webhookEvent = request.body;

      try {
        assertMonobankPersonalWebhookEvent(webhookEvent, "request.body");
      } catch (error) {
        if (error instanceof MonobankValidationError) {
          if (
            context.isMalformedWebhookRateLimited(services.profile, request.ip)
          ) {
            reply.code(429);

            return {
              error: "webhook_rate_limit_exceeded",
              message:
                "Webhook endpoint rate limit exceeded. Retry with a short delay.",
            };
          }

          const logOptions =
            context.logSink === undefined ? {} : { logger: context.logSink };

          logStructured(
            "warn",
            "Rejected malformed webhook payload",
            {
              route: context.localWebhookRoutePath,
              path: error.path,
              expected: error.expected,
            },
            logOptions,
          );

          reply.code(400);

          return {
            error: "invalid_webhook_payload",
            message: "Webhook payload is malformed.",
          };
        }

        throw error;
      }

      const typedWebhookEvent = webhookEvent as MonobankPersonalWebhookEvent;

      if (
        context.isWebhookAccountRateLimited(
          services.profile,
          typedWebhookEvent.data.account,
        )
      ) {
        reply.code(429);

        return {
          error: "webhook_rate_limit_exceeded",
          message:
            "Webhook endpoint rate limit exceeded. Retry with a short delay.",
        };
      }

      const event = await services.db.recordWebhookEvent(
        typedWebhookEvent,
        undefined,
        context.webhookDeliveryMetadata(
          request.headers as Record<string, unknown>,
          request.ip,
        ),
      );

      return {
        accepted: true,
        pullRequired: true,
        event,
      };
    },
  );
}
