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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function currencyLabel(currencyCode: number): string {
  switch (currencyCode) {
    case 840:
      return "USD";
    case 978:
      return "EUR";
    case 980:
      return "UAH";
    default:
      return String(currencyCode);
  }
}

function formatMinorAmount(amount: number, currencyCode: number): string {
  const normalizedAmount = amount / 100;

  return `${normalizedAmount.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} ${currencyLabel(currencyCode)}`;
}

function renderLocalFixtureOverview(
  fixtureSet: MonobankFixtureSet,
  profile: string,
): string {
  const summary = summarizeFixtureSet(fixtureSet, profile);
  const recentStatementItems = Object.entries(fixtureSet.statements)
    .flatMap(([accountId, items]) => {
      return items.map((item) => ({ accountId, item }));
    })
    .sort((left, right) => right.item.time - left.item.time)
    .slice(0, 8);

  const accountRows = fixtureSet.clientInfo.accounts
    .map((account) => {
      return `<tr>
        <td>${escapeHtml(account.id)}</td>
        <td>${escapeHtml(account.type)}</td>
        <td>${escapeHtml(formatMinorAmount(account.balance, account.currencyCode))}</td>
        <td>${escapeHtml(account.maskedPan?.join(", ") ?? "none")}</td>
      </tr>`;
    })
    .join("");
  const statementRows = recentStatementItems
    .map(({ accountId, item }) => {
      return `<tr>
        <td>${escapeHtml(new Date(item.time * 1000).toISOString().slice(0, 10))}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(accountId)}</td>
        <td class="amount">${escapeHtml(formatMinorAmount(item.amount, item.currencyCode))}</td>
        <td>${item.hold ? "hold" : "posted"}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>mono-ledger-sync local fixture preview</title>
    <style>
      :root {
        color-scheme: light;
        --background: #ffffff;
        --foreground: #111722;
        --muted: #5c626b;
        --border: #dfe4ec;
        --primary: #05962f;
        --surface: #f7f9fb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--background);
        color: var(--foreground);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 15px;
        line-height: 1.5;
      }
      main {
        width: min(1120px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }
      header {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: end;
        border-bottom: 1px solid var(--border);
        padding-bottom: 20px;
      }
      h1, h2, p { margin: 0; }
      h1 { font-size: 30px; line-height: 1.15; letter-spacing: 0; }
      h2 { font-size: 17px; line-height: 1.25; letter-spacing: 0; }
      .muted { color: var(--muted); }
      .pill {
        border: 1px solid var(--border);
        border-radius: 999px;
        color: var(--primary);
        padding: 6px 10px;
        white-space: nowrap;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1px;
        border: 1px solid var(--border);
        background: var(--border);
        margin: 24px 0;
      }
      .metric {
        background: var(--surface);
        padding: 14px;
      }
      .metric strong {
        display: block;
        font-size: 22px;
        line-height: 1.2;
      }
      section {
        margin-top: 28px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
        border: 1px solid var(--border);
      }
      th, td {
        border-bottom: 1px solid var(--border);
        padding: 10px 12px;
        text-align: left;
        vertical-align: top;
      }
      th {
        background: var(--surface);
        color: var(--muted);
        font-weight: 600;
      }
      tr:last-child td { border-bottom: 0; }
      .amount { font-variant-numeric: tabular-nums; white-space: nowrap; }
      .links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 10px;
      }
      a {
        color: var(--primary);
        text-decoration: none;
        border-bottom: 1px solid currentColor;
      }
      @media (max-width: 720px) {
        header { align-items: start; flex-direction: column; }
        table { display: block; overflow-x: auto; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <p class="muted">Local fixture mode</p>
          <h1>mono-ledger-sync</h1>
          <p class="muted">Profile ${escapeHtml(summary.profile)} is using bundled sanitized Monobank fixtures.</p>
        </div>
        <span class="pill">local only</span>
      </header>

      <section class="metrics" aria-label="Fixture summary">
        <div class="metric"><strong>${summary.accounts}</strong><span>accounts</span></div>
        <div class="metric"><strong>${summary.jars}</strong><span>jars</span></div>
        <div class="metric"><strong>${summary.statementItems}</strong><span>statement items</span></div>
        <div class="metric"><strong>${summary.currencyRates}</strong><span>currency rates</span></div>
      </section>

      <section>
        <h2>Accounts</h2>
        <table>
          <thead><tr><th>Account</th><th>Type</th><th>Balance</th><th>Masked PAN</th></tr></thead>
          <tbody>${accountRows}</tbody>
        </table>
      </section>

      <section>
        <h2>Recent Statement Items</h2>
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>${statementRows}</tbody>
        </table>
      </section>

      <section>
        <h2>Local JSON Endpoints</h2>
        <div class="links">
          <a href="/api/health">/api/health</a>
          <a href="/api/fixtures/summary">/api/fixtures/summary</a>
          <a href="/api/fixtures/client-info">/api/fixtures/client-info</a>
          <a href="/api/fixtures/statements">/api/fixtures/statements</a>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function registerLocalApiRoutes(
  app: FastifyInstance,
  options: LocalApiServerOptions,
): void {
  app.get("/", async (_request, reply): Promise<string> => {
    const fixtureSet = await loadMonobankFixtureSet();

    reply.type("text/html; charset=utf-8");

    return renderLocalFixtureOverview(fixtureSet, options.profile ?? "default");
  });

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
