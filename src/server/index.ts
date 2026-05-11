import Fastify, { type FastifyInstance } from "fastify";

import { productArchitecture, type LedgerSource } from "../core/index.js";
import {
  loadMonobankFixtureSet,
  type MonobankClientInfo,
  type MonobankFixtureSet,
  type MonobankStatementItem,
} from "../monobank/index.js";

export const localApiServerFramework = "fastify";
export const localApiRoutePrefix = "/api";

export interface LocalApiServerOptions {
  host?: "127.0.0.1" | "localhost";
  port?: number;
  profile?: string;
  source?: LedgerSource;
  dataDir?: string;
  openBrowser?: boolean;
}

export interface LocalApiServer {
  readonly url: string | undefined;
  readonly apiPrefix: typeof localApiRoutePrefix;
  listen(): Promise<string>;
  inject(request: LocalApiTestRequest): Promise<LocalApiTestResponse>;
  close(): Promise<void>;
}

export interface LocalApiRouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: `${typeof localApiRoutePrefix}/${string}`;
  auth: "local";
}

export interface LocalApiTestRequest {
  method: LocalApiRouteDefinition["method"];
  url: string;
}

export interface LocalApiTestResponse {
  statusCode: number;
  body: string;
  json(): unknown;
}

export interface LocalApiHealth {
  status: "ok";
  localOnly: true;
  framework: typeof localApiServerFramework;
  apiPrefix: typeof localApiRoutePrefix;
  architecture: typeof productArchitecture;
}

export interface LocalApiFixtureSummary {
  source: "fixture";
  profile: string;
  accounts: number;
  jars: number;
  currencyRates: number;
  statementAccounts: number;
  statementItems: number;
  webhookEvents: number;
  errorStates: number;
}

export interface LocalApiFixtureClientInfo {
  source: "fixture";
  profile: string;
  clientInfo: MonobankClientInfo;
}

export interface LocalApiFixtureStatementsAccount {
  accountId: string;
  items: readonly MonobankStatementItem[];
}

export interface LocalApiFixtureStatements {
  source: "fixture";
  profile: string;
  totalItems: number;
  accounts: readonly LocalApiFixtureStatementsAccount[];
}

const healthResponseSchema = {
  type: "object",
  required: ["status", "localOnly", "framework", "apiPrefix", "architecture"],
  properties: {
    status: { const: "ok" },
    localOnly: { const: true },
    framework: { const: localApiServerFramework },
    apiPrefix: { const: localApiRoutePrefix },
    architecture: {
      type: "object",
      required: ["ui", "server", "storage", "cli"],
      properties: {
        ui: { const: productArchitecture.ui },
        server: { const: productArchitecture.server },
        storage: { const: productArchitecture.storage },
        cli: { const: productArchitecture.cli },
      },
    },
  },
} as const;

const fixtureSummaryResponseSchema = {
  type: "object",
  required: [
    "source",
    "profile",
    "accounts",
    "jars",
    "currencyRates",
    "statementAccounts",
    "statementItems",
    "webhookEvents",
    "errorStates",
  ],
  properties: {
    source: { const: "fixture" },
    profile: { type: "string" },
    accounts: { type: "number" },
    jars: { type: "number" },
    currencyRates: { type: "number" },
    statementAccounts: { type: "number" },
    statementItems: { type: "number" },
    webhookEvents: { type: "number" },
    errorStates: { type: "number" },
  },
} as const;

const fixtureClientInfoResponseSchema = {
  type: "object",
  required: ["source", "profile", "clientInfo"],
  properties: {
    source: { const: "fixture" },
    profile: { type: "string" },
    clientInfo: {
      type: "object",
      additionalProperties: true,
    },
  },
} as const;

const fixtureStatementsResponseSchema = {
  type: "object",
  required: ["source", "profile", "totalItems", "accounts"],
  properties: {
    source: { const: "fixture" },
    profile: { type: "string" },
    totalItems: { type: "number" },
    accounts: {
      type: "array",
      items: {
        type: "object",
        required: ["accountId", "items"],
        properties: {
          accountId: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      },
    },
  },
} as const;

function summarizeFixtureSet(
  fixtureSet: MonobankFixtureSet,
  profile: string,
): LocalApiFixtureSummary {
  return {
    source: "fixture",
    profile,
    accounts: fixtureSet.clientInfo.accounts.length,
    jars: fixtureSet.clientInfo.jars?.length ?? 0,
    currencyRates: fixtureSet.currencyRates.length,
    statementAccounts: Object.keys(fixtureSet.statements).length,
    statementItems: Object.values(fixtureSet.statements).reduce(
      (count, statementItems) => count + statementItems.length,
      0,
    ),
    webhookEvents: Object.keys(fixtureSet.webhookEvents ?? {}).length,
    errorStates: Object.keys(fixtureSet.errors ?? {}).length,
  };
}

function fixtureClientInfoResponse(
  fixtureSet: MonobankFixtureSet,
  profile: string,
): LocalApiFixtureClientInfo {
  return {
    source: "fixture",
    profile,
    clientInfo: fixtureSet.clientInfo,
  };
}

function fixtureStatementsResponse(
  fixtureSet: MonobankFixtureSet,
  profile: string,
): LocalApiFixtureStatements {
  const accounts = Object.entries(fixtureSet.statements).map(
    ([accountId, items]) => ({
      accountId,
      items,
    }),
  );

  return {
    source: "fixture",
    profile,
    totalItems: accounts.reduce((count, account) => {
      return count + account.items.length;
    }, 0),
    accounts,
  };
}

function registerLocalApiRoutes(
  app: FastifyInstance,
  options: LocalApiServerOptions,
): void {
  app.get(
    `${localApiRoutePrefix}/health`,
    {
      schema: {
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async (): Promise<LocalApiHealth> => ({
      status: "ok",
      localOnly: true,
      framework: localApiServerFramework,
      apiPrefix: localApiRoutePrefix,
      architecture: productArchitecture,
    }),
  );

  app.get(
    `${localApiRoutePrefix}/fixtures/summary`,
    {
      schema: {
        response: {
          200: fixtureSummaryResponseSchema,
        },
      },
    },
    async (): Promise<LocalApiFixtureSummary> => {
      const fixtureSet = await loadMonobankFixtureSet();

      return summarizeFixtureSet(fixtureSet, options.profile ?? "default");
    },
  );

  app.get(
    `${localApiRoutePrefix}/fixtures/client-info`,
    {
      schema: {
        response: {
          200: fixtureClientInfoResponseSchema,
        },
      },
    },
    async (): Promise<LocalApiFixtureClientInfo> => {
      const fixtureSet = await loadMonobankFixtureSet();

      return fixtureClientInfoResponse(
        fixtureSet,
        options.profile ?? "default",
      );
    },
  );

  app.get(
    `${localApiRoutePrefix}/fixtures/statements`,
    {
      schema: {
        response: {
          200: fixtureStatementsResponseSchema,
        },
      },
    },
    async (): Promise<LocalApiFixtureStatements> => {
      const fixtureSet = await loadMonobankFixtureSet();

      return fixtureStatementsResponse(
        fixtureSet,
        options.profile ?? "default",
      );
    },
  );
}

export function createLocalApiServer(
  options: LocalApiServerOptions = {},
): LocalApiServer {
  const app = Fastify({
    logger: false,
  });
  let url: string | undefined;

  registerLocalApiRoutes(app, options);

  return {
    get url() {
      return url;
    },
    apiPrefix: localApiRoutePrefix,
    async listen() {
      url = await app.listen({
        host: options.host ?? "127.0.0.1",
        port: options.port ?? 0,
      });
      return url;
    },
    async inject(request) {
      const response = await app.inject(request);

      return {
        statusCode: response.statusCode,
        body: response.body,
        json: () => response.json(),
      };
    },
    close: () => app.close(),
  };
}
