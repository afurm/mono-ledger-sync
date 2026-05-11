import os from "node:os";
import path from "node:path";

import Fastify, { type FastifyInstance } from "fastify";
import type inject from "light-my-request";

import {
  createLedgerExport,
  exportPresetNames,
  isExportFormat,
  isExportPreset,
  type ExportFormat,
  type ExportPreset,
} from "../exports/index.js";
import { productArchitecture, type LedgerSource } from "../core/index.js";
import {
  assertMonobankPersonalWebhookEvent,
  createBundledFixtureMonobankAdapter,
  createMonobankHttpAdapter,
  loadMonobankFixtureSet,
  type MonobankAdapter,
  type MonobankClientInfo,
  type MonobankFixtureSet,
  type MonobankStatementItem,
} from "../monobank/index.js";
import { createSqliteLedgerDb, type SqliteLedgerDb } from "../sqlite/index.js";
import { syncLedgerWithMonobank } from "../sync/index.js";
import type {
  LedgerAccount,
  LedgerEntryPage,
  LedgerSummary,
  SyncRun,
} from "../storage/index.js";

export const localApiServerFramework = "fastify";
export const localApiRoutePrefix = "/api";

export interface LocalApiServerOptions {
  host?: "127.0.0.1" | "localhost";
  port?: number;
  profile?: string;
  source?: LedgerSource;
  dataDir?: string;
  openBrowser?: boolean;
  monobankToken?: string;
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
  headers?: Record<string, string>;
  body?: unknown;
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

export interface LocalApiAppConfig {
  profile: string;
  source: LedgerSource;
  dataDir: string;
  databasePath: string;
  localOnly: true;
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

interface LocalAppServices {
  profile: string;
  source: LedgerSource;
  dataDir: string;
  databasePath: string;
  db: SqliteLedgerDb;
  adapter: MonobankAdapter;
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
      required: ["ui", "server", "storage"],
      properties: {
        ui: { const: productArchitecture.ui },
        server: { const: productArchitecture.server },
        storage: { const: productArchitecture.storage },
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

const appConfigResponseSchema = {
  type: "object",
  required: ["profile", "source", "dataDir", "databasePath", "localOnly"],
  properties: {
    profile: { type: "string" },
    source: { enum: ["fixture", "monobank"] },
    dataDir: { type: "string" },
    databasePath: { type: "string" },
    localOnly: { const: true },
  },
} as const;

const ledgerSummaryResponseSchema = {
  type: "object",
  required: [
    "profile",
    "accounts",
    "ledgerEntries",
    "income",
    "expenses",
    "net",
    "currencies",
  ],
  properties: {
    profile: { type: "string" },
    accounts: { type: "number" },
    ledgerEntries: { type: "number" },
    income: { type: "number" },
    expenses: { type: "number" },
    net: { type: "number" },
    currencies: { type: "array", items: { type: "number" } },
    lastSyncedAt: { type: "string" },
  },
} as const;

const ledgerAccountsResponseSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: true,
  },
} as const;

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

function resolveProfile(options: LocalApiServerOptions): string {
  return options.profile?.trim() || "default";
}

function resolveSource(options: LocalApiServerOptions): LedgerSource {
  return options.source ?? "fixture";
}

function resolveDataDir(options: LocalApiServerOptions): string {
  return (
    options.dataDir ??
    process.env.MONO_LEDGER_SYNC_DATA_DIR ??
    path.join(os.homedir(), ".mono-ledger-sync")
  );
}

function safeProfileFileName(profile: string): string {
  return profile.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

export function resolveLocalLedgerDatabasePath(
  options: LocalApiServerOptions = {},
): string {
  const profile = resolveProfile(options);
  const fileName = `${safeProfileFileName(profile) || "default"}.sqlite`;

  return path.join(resolveDataDir(options), fileName);
}

async function createServices(
  options: LocalApiServerOptions,
): Promise<LocalAppServices> {
  const profile = resolveProfile(options);
  const source = resolveSource(options);
  const dataDir = resolveDataDir(options);
  const databasePath = resolveLocalLedgerDatabasePath(options);
  const token = options.monobankToken ?? process.env.MONOBANK_TOKEN;
  const adapter =
    source === "fixture"
      ? await createBundledFixtureMonobankAdapter()
      : createMonobankHttpAdapter({
          token: token ?? "",
        });
  const db = createSqliteLedgerDb({
    filePath: databasePath,
    profile,
  });

  await db.migrate();

  return {
    profile,
    source,
    dataDir,
    databasePath,
    db,
    adapter,
  };
}

function readNumberQuery(
  value: string | string[] | undefined,
): number | undefined {
  if (Array.isArray(value)) {
    return readNumberQuery(value[0]);
  }

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function readStringQuery(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return value;
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
    <title>mono-ledger-sync</title>
    <style>
      :root {
        color-scheme: light;
        --background: #ffffff;
        --foreground: #111722;
        --muted: #5c626b;
        --border: #dfe4ec;
        --primary: #05962f;
        --primary-dark: #047827;
        --surface: #f7f9fb;
        --accent: #eef8f1;
        --danger: #ef4444;
        --warning: #f59e0b;
      }
      * { box-sizing: border-box; }
      html {
        width: 100%;
      }
      body {
        margin: 0;
        background: var(--background);
        color: var(--foreground);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
        line-height: 1.5;
        overflow-x: hidden;
        width: 100%;
      }
      button, input, select {
        font: inherit;
      }
      .shell {
        display: grid;
        grid-template-columns: 236px minmax(0, 1fr);
        min-height: 100vh;
        max-width: 100vw;
      }
      aside {
        border-right: 1px solid var(--border);
        background: var(--surface);
        min-width: 0;
        padding: 22px 14px;
      }
      main {
        min-width: 0;
        max-width: 100vw;
        padding: 24px;
      }
      .brand {
        font-weight: 750;
        font-size: 18px;
        letter-spacing: 0;
        margin: 0 0 22px;
      }
      nav {
        display: grid;
        gap: 4px;
      }
      nav a {
        border-radius: 6px;
        color: var(--muted);
        padding: 8px 10px;
        text-decoration: none;
      }
      nav a.active {
        background: var(--accent);
        color: var(--primary-dark);
        font-weight: 650;
      }
      .sidebar-footer {
        border-top: 1px solid var(--border);
        color: var(--muted);
        font-size: 12px;
        margin-top: 24px;
        padding: 14px 10px 0;
        overflow-wrap: anywhere;
      }
      .sidebar-footer strong {
        color: var(--foreground);
        display: block;
        font-size: 12px;
        margin-bottom: 4px;
      }
      .topbar {
        align-items: center;
        border-bottom: 1px solid var(--border);
        display: flex;
        gap: 16px;
        justify-content: space-between;
        margin: -24px -24px 24px;
        padding: 18px 24px;
      }
      h1, h2, p {
        margin: 0;
      }
      h1 {
        font-size: 24px;
        line-height: 1.15;
        letter-spacing: 0;
      }
      h2 {
        font-size: 16px;
        line-height: 1.25;
        letter-spacing: 0;
        margin-bottom: 10px;
      }
      .muted {
        color: var(--muted);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .button {
        align-items: center;
        background: var(--primary);
        border: 1px solid var(--primary);
        border-radius: 6px;
        color: #fff;
        cursor: pointer;
        display: inline-flex;
        font-weight: 650;
        gap: 8px;
        justify-content: center;
        min-height: 34px;
        padding: 7px 12px;
        text-decoration: none;
      }
      .button.secondary {
        background: #fff;
        border-color: var(--border);
        color: var(--foreground);
      }
      .button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1px;
        border: 1px solid var(--border);
        background: var(--border);
        margin-bottom: 24px;
      }
      .metric {
        background: #fff;
        padding: 14px;
      }
      .metric strong {
        display: block;
        font-size: 22px;
        line-height: 1.2;
      }
      .grid {
        display: grid;
        gap: 24px;
        grid-template-columns: minmax(0, 1fr);
      }
      section {
        min-width: 0;
      }
      .panel {
        border: 1px solid var(--border);
        border-radius: 8px;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
      }
      .panel-header {
        align-items: center;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        display: flex;
        gap: 12px;
        justify-content: space-between;
        padding: 10px 12px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border-bottom: 1px solid var(--border);
        padding: 9px 12px;
        text-align: left;
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 12px;
        font-weight: 650;
      }
      tr:last-child td {
        border-bottom: 0;
      }
      .amount {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .negative {
        color: var(--danger);
      }
      .positive {
        color: var(--primary-dark);
      }
      .status {
        border-radius: 999px;
        display: inline-flex;
        font-size: 12px;
        font-weight: 650;
        line-height: 1;
        padding: 5px 8px;
      }
      .status.local {
        background: var(--accent);
        color: var(--primary-dark);
      }
      .status.hold {
        background: #fff7ed;
        color: #9a3412;
      }
      .filters {
        display: grid;
        gap: 8px;
        grid-template-columns: minmax(180px, 1fr) 160px;
      }
      input, select {
        border: 1px solid var(--border);
        border-radius: 6px;
        min-height: 34px;
        padding: 7px 9px;
      }
      .links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .links a {
        color: var(--primary-dark);
      }
      @media (max-width: 840px) {
        .shell {
          grid-template-columns: minmax(0, 1fr);
        }
        aside {
          border-bottom: 1px solid var(--border);
          border-right: 0;
          max-width: 100vw;
          overflow: hidden;
          width: 100%;
        }
        nav {
          display: flex;
          overflow-x: auto;
          max-width: 100%;
          width: 100%;
        }
        nav a {
          flex: 0 0 auto;
          white-space: nowrap;
        }
        main {
          max-width: 100vw;
          padding: 18px;
          width: 100%;
        }
        .topbar {
          align-items: flex-start;
          flex-direction: column;
          margin: -18px -18px 18px;
          padding: 16px 18px;
        }
        .metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .panel {
          max-width: 100%;
          overflow-x: auto;
        }
        .panel-header {
          align-items: flex-start;
          flex-direction: column;
        }
        .panel-header > .muted {
          overflow-wrap: anywhere;
        }
        table {
          min-width: 680px;
        }
        .filters {
          grid-template-columns: 1fr;
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <p class="brand">mono-ledger-sync</p>
        <nav aria-label="Primary">
          <a class="active" href="#overview">Overview</a>
          <a href="#transactions">Transactions</a>
          <a href="#rules">Rules & Mappings</a>
          <a href="#sync">Sync & Webhooks</a>
          <a href="#accounts">Accounts</a>
          <a href="#exports">Exports</a>
          <a href="#logs">Logs</a>
          <a href="#settings">Settings</a>
          <a href="#help">Help</a>
        </nav>
        <div class="sidebar-footer">
          <strong>Local database</strong>
          <span id="database-path">loading</span>
        </div>
      </aside>
      <main>
        <div class="topbar">
          <div>
            <h1>Local ledger</h1>
            <p class="muted" id="profile-label">Profile ${escapeHtml(summary.profile)} · fixture source · local only</p>
          </div>
          <div class="actions">
            <button class="button" id="sync-button" type="button">Sync fixture</button>
            <a class="button secondary" href="/api/exports/ledger?format=csv">Export CSV</a>
            <span class="status local" id="sync-status">ready</span>
          </div>
        </div>

        <section class="metrics" aria-label="Ledger summary">
          <div class="metric"><strong id="metric-accounts">${summary.accounts}</strong><span>accounts</span></div>
          <div class="metric"><strong id="metric-entries">${summary.statementItems}</strong><span>transactions</span></div>
          <div class="metric"><strong id="metric-income">0.00</strong><span>income</span></div>
          <div class="metric"><strong id="metric-expenses">0.00</strong><span>expenses</span></div>
        </section>

        <div class="grid">
          <section id="transactions">
            <div class="panel">
              <div class="panel-header">
                <h2>Transactions</h2>
                <div class="filters">
                  <input id="search" type="search" placeholder="Search transactions">
                  <select id="account-filter">
                    <option value="">All accounts</option>
                  </select>
                </div>
              </div>
              <table>
                <thead>
                  <tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th>Amount</th><th>Status</th></tr>
                </thead>
                <tbody id="ledger-rows">
                  ${statementRows}
                </tbody>
              </table>
            </div>
          </section>

          <section id="accounts">
            <div class="panel">
              <div class="panel-header">
                <h2>Accounts</h2>
                <span class="muted">fixture-account-uah-main</span>
              </div>
              <table>
                <thead><tr><th>Account</th><th>Type</th><th>Balance</th><th>Masked PAN</th></tr></thead>
                <tbody id="account-rows">${accountRows}</tbody>
              </table>
            </div>
          </section>

          <section id="exports">
            <div class="panel">
              <div class="panel-header">
                <h2>Exports</h2>
                <div class="links">
                  <a href="/api/exports/ledger?format=csv">CSV</a>
                  <a href="/api/exports/ledger?format=json">JSON</a>
                  <a href="/api/exports/ledger?format=jsonl">JSONL</a>
                  <a href="/api/fixtures/client-info">/api/fixtures/client-info</a>
                  <a href="/api/fixtures/statements">/api/fixtures/statements</a>
                  <a href="/api/fixtures/summary">/api/fixtures/summary</a>
                  <a href="/api/health">/api/health</a>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
    <script>
      const escapeHtml = (value) => {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      };
      const currencyLabel = (code) => {
        if (code === 980) return "UAH";
        if (code === 978) return "EUR";
        if (code === 840) return "USD";
        return String(code);
      };
      const formatAmount = (amount, currencyCode) => {
        return (amount / 100).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }) + " " + currencyLabel(currencyCode);
      };
      const state = {
        accounts: [],
        accountId: "",
        search: "",
        bootstrapped: false
      };

      async function api(path, options) {
        const response = await fetch(path, options);
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      }

      function renderSummary(summary) {
        document.querySelector("#metric-accounts").textContent = summary.accounts;
        document.querySelector("#metric-entries").textContent = summary.ledgerEntries;
        document.querySelector("#metric-income").textContent =
          (summary.income / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
        document.querySelector("#metric-expenses").textContent =
          (summary.expenses / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
      }

      function renderConfig(config) {
        document.querySelector("#database-path").textContent = config.databasePath;
        document.querySelector("#profile-label").textContent =
          "Profile " + config.profile + " · " + config.source + " source · local only";
      }

      function renderAccounts(accounts) {
        state.accounts = accounts;
        document.querySelector("#account-filter").innerHTML =
          '<option value="">All accounts</option>' +
          accounts.map((account) => {
            return '<option value="' + escapeHtml(account.id) + '">' + escapeHtml(account.id) + '</option>';
          }).join("");
        document.querySelector("#account-rows").innerHTML = accounts.map((account) => {
          return '<tr><td>' + escapeHtml(account.id) + '</td><td>' + escapeHtml(account.type) + '</td><td>' +
            escapeHtml(formatAmount(account.balance, account.currencyCode)) + '</td><td>' +
            escapeHtml((account.maskedPan || ["none"]).join(", ")) + '</td></tr>';
        }).join("");
      }

      function renderTransactions(page) {
        document.querySelector("#ledger-rows").innerHTML = page.entries.map((entry) => {
          const amountClass = entry.amount < 0 ? "negative" : "positive";
          const status = entry.hold ? '<span class="status hold">hold</span>' : "posted";
          return '<tr><td>' + new Date(entry.time * 1000).toISOString().slice(0, 10) +
            '</td><td>' + escapeHtml(entry.description) + '</td><td>' +
            escapeHtml(entry.categoryName || "Uncategorized") + '</td><td>' + escapeHtml(entry.accountId) +
            '</td><td class="amount ' + amountClass + '">' +
            escapeHtml(formatAmount(entry.amount, entry.currencyCode)) + '</td><td>' + status + '</td></tr>';
        }).join("");
      }

      async function refresh() {
        const params = new URLSearchParams();
        if (state.accountId) params.set("accountId", state.accountId);
        if (state.search) params.set("search", state.search);
        let summary = await api("/api/ledger/summary");
        if (!state.bootstrapped && summary.ledgerEntries === 0) {
          state.bootstrapped = true;
          document.querySelector("#sync-status").textContent = "syncing";
          await api("/api/sync/run", { method: "POST" });
          summary = await api("/api/ledger/summary");
          document.querySelector("#sync-status").textContent = "synced";
        }
        const [config, accounts, transactions] = await Promise.all([
          api("/api/app/config"),
          api("/api/ledger/accounts"),
          api("/api/ledger/transactions?" + params.toString())
        ]);
        renderConfig(config);
        renderSummary(summary);
        renderAccounts(accounts);
        renderTransactions(transactions);
      }

      document.querySelector("#sync-button").addEventListener("click", async () => {
        const button = document.querySelector("#sync-button");
        const status = document.querySelector("#sync-status");
        button.disabled = true;
        status.textContent = "syncing";
        try {
          await api("/api/sync/run", { method: "POST" });
          await refresh();
          status.textContent = "synced";
        } catch {
          status.textContent = "failed";
        } finally {
          button.disabled = false;
        }
      });
      document.querySelector("#account-filter").addEventListener("change", (event) => {
        state.accountId = event.target.value;
        refresh();
      });
      document.querySelector("#search").addEventListener("input", (event) => {
        state.search = event.target.value;
        window.clearTimeout(window.__ledgerSearchTimer);
        window.__ledgerSearchTimer = window.setTimeout(refresh, 180);
      });
      refresh().catch(() => undefined);
    </script>
  </body>
</html>`;
}

function registerLocalApiRoutes(
  app: FastifyInstance,
  options: LocalApiServerOptions,
  getServices: () => Promise<LocalAppServices>,
): void {
  app.get("/", async (_request, reply): Promise<string> => {
    const fixtureSet = await loadMonobankFixtureSet();

    reply.type("text/html; charset=utf-8");

    return renderLocalFixtureOverview(fixtureSet, resolveProfile(options));
  });

  app.get("/favicon.ico", async (_request, reply): Promise<void> => {
    reply.code(204).send();
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
    `${localApiRoutePrefix}/app/config`,
    {
      schema: {
        response: {
          200: appConfigResponseSchema,
        },
      },
    },
    async (): Promise<LocalApiAppConfig> => {
      const services = await getServices();

      return {
        profile: services.profile,
        source: services.source,
        dataDir: services.dataDir,
        databasePath: services.databasePath,
        localOnly: true,
      };
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/summary`,
    {
      schema: {
        response: {
          200: ledgerSummaryResponseSchema,
        },
      },
    },
    async (): Promise<LedgerSummary> => {
      const services = await getServices();

      return services.db.getLedgerSummary(services.profile);
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/accounts`,
    {
      schema: {
        response: {
          200: ledgerAccountsResponseSchema,
        },
      },
    },
    async (): Promise<readonly LedgerAccount[]> => {
      const services = await getServices();

      return services.db.listAccounts(services.profile);
    },
  );

  app.get(
    `${localApiRoutePrefix}/ledger/transactions`,
    {
      schema: {
        response: {
          200: ledgerEntriesPageResponseSchema,
        },
      },
    },
    async (request): Promise<LedgerEntryPage> => {
      const services = await getServices();
      const query = request.query as Record<string, string | string[]>;
      const entryQuery = {
        profile: services.profile,
      };
      const accountId = readStringQuery(query.accountId);
      const categoryId = readStringQuery(query.categoryId);
      const search = readStringQuery(query.search);
      const from = readNumberQuery(query.from);
      const to = readNumberQuery(query.to);
      const limit = readNumberQuery(query.limit);
      const offset = readNumberQuery(query.offset);

      if (accountId) {
        Object.assign(entryQuery, { accountId });
      }

      if (categoryId) {
        Object.assign(entryQuery, { categoryId });
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

      return services.db.listLedgerEntries(entryQuery);
    },
  );

  app.post(`${localApiRoutePrefix}/sync/run`, async (): Promise<unknown> => {
    const services = await getServices();

    return syncLedgerWithMonobank({
      profile: services.profile,
      source: services.source,
      adapter: services.adapter,
      db: services.db,
    });
  });

  app.get(
    `${localApiRoutePrefix}/sync/runs`,
    async (): Promise<readonly SyncRun[]> => {
      const services = await getServices();

      return services.db.listSyncRuns(services.profile);
    },
  );

  app.post(
    `${localApiRoutePrefix}/webhooks/monobank`,
    async (request): Promise<unknown> => {
      const services = await getServices();

      assertMonobankPersonalWebhookEvent(request.body, "request.body");
      const event = await services.db.recordWebhookEvent(request.body);

      return {
        accepted: true,
        pullRequired: true,
        event,
      };
    },
  );

  app.get(`${localApiRoutePrefix}/exports/ledger`, async (request, reply) => {
    const services = await getServices();
    const query = request.query as Record<string, string | string[]>;
    const format = readStringQuery(query.format);
    const preset = readStringQuery(query.preset);
    const from = readNumberQuery(query.from);
    const to = readNumberQuery(query.to);
    const accountId = readStringQuery(query.accountId);
    const categoryId = readStringQuery(query.categoryId);

    if (format && (!isExportFormat(format) || format === "sqlite")) {
      reply.code(400);
      return {
        error: "unsupported_export_format",
        message: "Supported export formats: csv, json, jsonl, journal-csv",
      };
    }

    if (preset && !isExportPreset(preset)) {
      reply.code(400);
      return {
        error: "unsupported_export_preset",
        message: `Supported export presets: ${exportPresetNames.join(", ")}`,
      };
    }

    const ledgerExport = await createLedgerExport(services.db, {
      profile: services.profile,
      ...(format ? { format: format as ExportFormat } : {}),
      ...(preset ? { preset: preset as ExportPreset } : {}),
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(accountId ? { accountIds: [accountId] } : {}),
      ...(categoryId ? { categoryIds: [categoryId] } : {}),
    });

    reply.header("content-type", ledgerExport.contentType);
    reply.header(
      "content-disposition",
      `attachment; filename="${ledgerExport.fileName}"`,
    );

    return ledgerExport.body;
  });

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

      return summarizeFixtureSet(fixtureSet, resolveProfile(options));
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

      return fixtureClientInfoResponse(fixtureSet, resolveProfile(options));
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

      return fixtureStatementsResponse(fixtureSet, resolveProfile(options));
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
  let servicesPromise: Promise<LocalAppServices> | undefined;

  function getServices(): Promise<LocalAppServices> {
    servicesPromise ??= createServices(options);

    return servicesPromise;
  }

  registerLocalApiRoutes(app, options, getServices);

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
      const injectOptions: inject.InjectOptions = {
        method: request.method,
        url: request.url,
      };

      if (request.headers) {
        injectOptions.headers = request.headers;
      }

      if (request.body !== undefined) {
        injectOptions.payload =
          request.body === null
            ? "null"
            : (request.body as inject.InjectPayload);
      }

      const response = await app.inject(injectOptions);

      return {
        statusCode: response.statusCode,
        body: response.body,
        json: () => response.json(),
      };
    },
    async close() {
      await app.close();

      if (servicesPromise) {
        const services = await servicesPromise;
        await services.db.close();
      }
    },
  };
}
