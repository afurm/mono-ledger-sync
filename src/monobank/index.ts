import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DomainError, type DomainErrorDescriptor } from "../domain/index.js";
import { redactSensitiveText } from "../privacy/index.js";
import type {
  MonobankAccount as DomainMonobankAccount,
  MonobankClientInfo as DomainMonobankClientInfo,
  MonobankCurrencyRate as DomainMonobankCurrencyRate,
  MonobankErrorResponse as DomainMonobankErrorResponse,
  MonobankJar as DomainMonobankJar,
  MonobankManagedClient as DomainMonobankManagedClient,
  MonobankPersonalWebhookEvent as DomainMonobankPersonalWebhookEvent,
  MonobankStatementItem as DomainMonobankStatementItem,
  MonobankStatementItemWebhookEvent as DomainMonobankStatementItemWebhookEvent,
  StatementWindow as DomainStatementWindow,
} from "../domain/index.js";

export type MonobankAccount = DomainMonobankAccount;

export type MonobankJar = DomainMonobankJar;

export type MonobankManagedClient = DomainMonobankManagedClient;

export type MonobankClientInfo = DomainMonobankClientInfo;

export type MonobankStatementItem = DomainMonobankStatementItem;

export type MonobankCurrencyRate = DomainMonobankCurrencyRate;

export type StatementWindow = DomainStatementWindow;

export interface MonobankAdapter {
  getClientInfo(): Promise<MonobankClientInfo>;
  getStatement(
    window: StatementWindow,
  ): Promise<readonly MonobankStatementItem[]>;
  getCurrency(): Promise<readonly MonobankCurrencyRate[]>;
  setWebhook(url: string): Promise<void>;
}

export type MonobankStatementItemWebhookEvent =
  DomainMonobankStatementItemWebhookEvent;

export type MonobankPersonalWebhookEvent = MonobankStatementItemWebhookEvent;

export type MonobankErrorResponse = DomainMonobankErrorResponse;

export interface MonobankFixtureSet {
  clientInfo: MonobankClientInfo;
  currencyRates: readonly MonobankCurrencyRate[];
  statements: Readonly<Record<string, readonly MonobankStatementItem[]>>;
  webhookEvents?: Readonly<Record<string, MonobankPersonalWebhookEvent>>;
  errors?: Readonly<Record<string, MonobankErrorResponse>>;
}

export interface MonobankFixtureLoaderOptions {
  fixturesDir?: string;
}

export interface MonobankRateLimitState {
  recordRequest(key: "personal" | "bank", atMs: number): void;
  getNextAllowedAt(key: "personal" | "bank", nowMs: number): number;
}

export function createMonobankRateLimitState(): MonobankRateLimitState {
  const nextRequestAt = new Map<"personal" | "bank", number>();

  return {
    recordRequest(key, atMs) {
      nextRequestAt.set(key, atMs);
    },
    getNextAllowedAt(key, nowMs) {
      return nextRequestAt.get(key) ?? nowMs;
    },
  };
}

export interface MonobankHttpAdapterOptions {
  token?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  userAgent?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  rateLimitState?: MonobankRateLimitState;
}

export const bundledMonobankFixturesDir = fileURLToPath(
  new URL("../../fixtures/monobank", import.meta.url),
);

export class MonobankValidationError extends DomainError {
  constructor(
    readonly path: string,
    readonly expected: string,
  ) {
    super(`${path} must be ${expected}`, "validation_failed", "validation", {
      path,
      expected,
    });
    this.name = "MonobankValidationError";
  }
}

export class MonobankApiError extends DomainError {
  constructor(
    readonly response: MonobankErrorResponse,
    readonly endpoint: string,
  ) {
    const descriptor = createMonobankDomainErrorDescriptor(response);
    super(
      `${endpoint} failed with ${response.statusCode}: ${response.message}`,
      descriptor.code,
      descriptor.category,
      {
        endpoint,
        statusCode: response.statusCode,
        monobankCode: response.code,
      },
    );
    this.name = "MonobankApiError";
  }
}

function createMonobankDomainErrorDescriptor(
  response: MonobankErrorResponse,
): DomainErrorDescriptor {
  if (
    response.statusCode === 401 ||
    response.statusCode === 403 ||
    response.code === "forbidden" ||
    response.code === "unauthorized" ||
    response.code === "token_invalid"
  ) {
    return {
      code: "token_invalid",
      category: "auth",
    };
  }

  if (
    response.statusCode === 429 ||
    response.code === "rate_limited" ||
    response.code === "too_many_requests"
  ) {
    return {
      code: "rate_limit_exceeded",
      category: "rate_limit",
    };
  }

  if (response.statusCode >= 400 && response.statusCode < 500) {
    return {
      code: "request_invalid",
      category: "validation",
    };
  }

  return {
    code: response.statusCode >= 500 ? "internal_error" : "validation_failed",
    category: response.statusCode >= 500 ? "internal" : "validation",
  };
}

function createMonobankNetworkError(
  endpoint: string,
  reason: unknown,
): DomainError {
  return new DomainError(
    `Network request to ${endpoint} failed`,
    "network_unreachable",
    "network",
    {
      endpoint,
      reason: reason instanceof Error ? reason.message : String(reason),
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new MonobankValidationError(path, "an object");
  }
}

function assertArray(
  value: unknown,
  path: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new MonobankValidationError(path, "an array");
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new MonobankValidationError(path, "a non-empty string");
  }
}

function assertNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MonobankValidationError(path, "a finite number");
  }
}

// Optional fields can be absent (undefined) or present-but-empty ("") —
// Monobank uses "" as the sentinel for "no webhook set / no permission" on
// /personal/client-info rather than omitting the key. The TS type `?: string`
// matches this contract; rejecting "" here would incorrectly fail the live
// token probe and prevent tokens from being saved.
function assertOptionalString(value: unknown, path: string): void {
  if (value !== undefined && value !== null) {
    if (typeof value !== "string") {
      throw new MonobankValidationError(path, "a string");
    }
  }
}

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new MonobankValidationError(path, "a boolean");
  }
}

function assertOptionalNumber(value: unknown, path: string): void {
  if (value !== undefined) {
    assertNumber(value, path);
  }
}

function assertOptionalStringArray(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }

  assertArray(value, path);

  value.forEach((item, index) => {
    assertString(item, `${path}[${index}]`);
  });
}

export function assertMonobankAccount(
  value: unknown,
  path = "account",
): asserts value is MonobankAccount {
  assertRecord(value, path);
  assertString(value.id, `${path}.id`);
  assertOptionalString(value.sendId, `${path}.sendId`);
  assertNumber(value.currencyCode, `${path}.currencyCode`);
  assertOptionalString(value.cashbackType, `${path}.cashbackType`);
  assertNumber(value.balance, `${path}.balance`);
  assertNumber(value.creditLimit, `${path}.creditLimit`);
  assertString(value.type, `${path}.type`);
  assertOptionalStringArray(value.maskedPan, `${path}.maskedPan`);
  assertOptionalString(value.iban, `${path}.iban`);
}

export function assertMonobankJar(
  value: unknown,
  path = "jar",
): asserts value is MonobankJar {
  assertRecord(value, path);
  assertString(value.id, `${path}.id`);
  assertOptionalString(value.sendId, `${path}.sendId`);
  assertString(value.title, `${path}.title`);
  assertString(value.description, `${path}.description`);
  assertNumber(value.currencyCode, `${path}.currencyCode`);
  assertNumber(value.balance, `${path}.balance`);
  assertNumber(value.goal, `${path}.goal`);
}

export function assertMonobankManagedClient(
  value: unknown,
  path = "managedClient",
): asserts value is MonobankManagedClient {
  assertRecord(value, path);
  assertString(value.clientId, `${path}.clientId`);
  assertOptionalNumber(value.tin, `${path}.tin`);
  assertString(value.name, `${path}.name`);

  const accounts = value.accounts;
  assertArray(accounts, `${path}.accounts`);
  accounts.forEach((account, index) => {
    assertMonobankAccount(account, `${path}.accounts[${index}]`);
  });
}

export function assertMonobankClientInfo(
  value: unknown,
  path = "clientInfo",
): asserts value is MonobankClientInfo {
  assertRecord(value, path);
  assertString(value.clientId, `${path}.clientId`);
  assertString(value.name, `${path}.name`);
  assertOptionalString(value.webHookUrl, `${path}.webHookUrl`);
  assertOptionalString(value.permissions, `${path}.permissions`);

  const accounts = value.accounts;
  assertArray(accounts, `${path}.accounts`);
  accounts.forEach((account, index) => {
    assertMonobankAccount(account, `${path}.accounts[${index}]`);
  });

  if (value.jars !== undefined) {
    const jars = value.jars;
    assertArray(jars, `${path}.jars`);
    jars.forEach((jar, index) => {
      assertMonobankJar(jar, `${path}.jars[${index}]`);
    });
  }

  if (value.managedClients !== undefined) {
    const managedClients = value.managedClients;
    assertArray(managedClients, `${path}.managedClients`);
    managedClients.forEach((managedClient, index) => {
      assertMonobankManagedClient(
        managedClient,
        `${path}.managedClients[${index}]`,
      );
    });
  }
}

export function assertMonobankStatementItem(
  value: unknown,
  path = "statementItem",
): asserts value is MonobankStatementItem {
  assertRecord(value, path);
  if (value.id !== undefined) {
    assertString(value.id, `${path}.id`);
  }
  assertNumber(value.time, `${path}.time`);
  assertString(value.description, `${path}.description`);
  assertNumber(value.mcc, `${path}.mcc`);
  assertNumber(value.originalMcc, `${path}.originalMcc`);
  assertNumber(value.amount, `${path}.amount`);
  assertNumber(value.operationAmount, `${path}.operationAmount`);
  assertNumber(value.currencyCode, `${path}.currencyCode`);
  assertNumber(value.commissionRate, `${path}.commissionRate`);
  assertNumber(value.cashbackAmount, `${path}.cashbackAmount`);
  assertNumber(value.balance, `${path}.balance`);
  assertBoolean(value.hold, `${path}.hold`);
  assertOptionalString(value.comment, `${path}.comment`);
  assertOptionalString(value.receiptId, `${path}.receiptId`);
  assertOptionalString(value.invoiceId, `${path}.invoiceId`);
  assertOptionalString(value.counterEdrpou, `${path}.counterEdrpou`);
  assertOptionalString(value.counterIban, `${path}.counterIban`);
  assertOptionalString(value.counterName, `${path}.counterName`);
}

export function assertMonobankStatementItems(
  value: unknown,
  path = "statementItems",
): asserts value is readonly MonobankStatementItem[] {
  assertArray(value, path);

  value.forEach((statementItem, index) => {
    assertMonobankStatementItem(statementItem, `${path}[${index}]`);
  });
}

export function assertMonobankCurrencyRate(
  value: unknown,
  path = "currencyRate",
): asserts value is MonobankCurrencyRate {
  assertRecord(value, path);
  assertNumber(value.currencyCodeA, `${path}.currencyCodeA`);
  assertNumber(value.currencyCodeB, `${path}.currencyCodeB`);
  assertNumber(value.date, `${path}.date`);
  assertOptionalNumber(value.rateBuy, `${path}.rateBuy`);
  assertOptionalNumber(value.rateSell, `${path}.rateSell`);
  assertOptionalNumber(value.rateCross, `${path}.rateCross`);
}

export function assertMonobankCurrencyRates(
  value: unknown,
  path = "currencyRates",
): asserts value is readonly MonobankCurrencyRate[] {
  assertArray(value, path);

  value.forEach((currencyRate, index) => {
    assertMonobankCurrencyRate(currencyRate, `${path}[${index}]`);
  });
}

export function assertMonobankPersonalWebhookEvent(
  value: unknown,
  path = "personalWebhookEvent",
): asserts value is MonobankPersonalWebhookEvent {
  assertRecord(value, path);

  if (value.type !== "StatementItem") {
    throw new MonobankValidationError(path, "a StatementItem webhook event");
  }

  const data = value.data;
  assertRecord(data, `${path}.data`);
  assertString(data.account, `${path}.data.account`);
  assertMonobankStatementItem(data.statementItem, `${path}.data.statementItem`);
}

export function assertMonobankErrorResponse(
  value: unknown,
  path = "errorResponse",
): asserts value is MonobankErrorResponse {
  assertRecord(value, path);
  assertNumber(value.statusCode, `${path}.statusCode`);
  assertString(value.code, `${path}.code`);
  assertString(value.message, `${path}.message`);
  assertOptionalNumber(value.retryAfterSeconds, `${path}.retryAfterSeconds`);
}

async function readFixtureJson(
  fixturesDir: string,
  relativePath: string,
): Promise<unknown> {
  const filePath = path.join(fixturesDir, ...relativePath.split("/"));
  const content = await readFile(filePath, "utf8");

  return JSON.parse(content);
}

export async function loadMonobankFixtureSet(
  options: MonobankFixtureLoaderOptions = {},
): Promise<MonobankFixtureSet> {
  const fixturesDir = options.fixturesDir ?? bundledMonobankFixturesDir;
  const clientInfo = await readFixtureJson(fixturesDir, "client-info.json");
  const currencyRates = await readFixtureJson(
    fixturesDir,
    "currency-rates.json",
  );
  const uahMainStatement = await readFixtureJson(
    fixturesDir,
    "statements/uah-main-2026-04.json",
  );
  const eurSavingsStatement = await readFixtureJson(
    fixturesDir,
    "statements/eur-savings-2026-04.json",
  );
  const emptyStatement = await readFixtureJson(
    fixturesDir,
    "statements/empty.json",
  );
  const statementItemWebhook = await readFixtureJson(
    fixturesDir,
    "webhooks/statement-item.json",
  );
  const invalidTokenError = await readFixtureJson(
    fixturesDir,
    "errors/invalid-token.json",
  );
  const rateLimitError = await readFixtureJson(
    fixturesDir,
    "errors/rate-limit.json",
  );
  const serverError = await readFixtureJson(
    fixturesDir,
    "errors/server-error.json",
  );

  assertMonobankClientInfo(clientInfo, "fixtures/client-info.json");
  assertMonobankCurrencyRates(currencyRates, "fixtures/currency-rates.json");
  assertMonobankStatementItems(
    uahMainStatement,
    "fixtures/statements/uah-main-2026-04.json",
  );
  assertMonobankStatementItems(
    eurSavingsStatement,
    "fixtures/statements/eur-savings-2026-04.json",
  );
  assertMonobankStatementItems(
    emptyStatement,
    "fixtures/statements/empty.json",
  );
  assertMonobankPersonalWebhookEvent(
    statementItemWebhook,
    "fixtures/webhooks/statement-item.json",
  );
  assertMonobankErrorResponse(
    invalidTokenError,
    "fixtures/errors/invalid-token.json",
  );
  assertMonobankErrorResponse(
    rateLimitError,
    "fixtures/errors/rate-limit.json",
  );
  assertMonobankErrorResponse(serverError, "fixtures/errors/server-error.json");

  return {
    clientInfo,
    currencyRates,
    statements: {
      "fixture-account-uah-main": uahMainStatement,
      "fixture-account-eur-savings": eurSavingsStatement,
      "fixture-account-empty": emptyStatement,
    },
    webhookEvents: {
      statementItem: statementItemWebhook,
    },
    errors: {
      invalidToken: invalidTokenError,
      rateLimit: rateLimitError,
      serverError,
    },
  };
}

export function createFixtureMonobankAdapter(
  fixtures: MonobankFixtureSet,
): MonobankAdapter {
  return {
    async getClientInfo() {
      return fixtures.clientInfo;
    },
    async getStatement(window) {
      const statements = fixtures.statements[window.accountId] ?? [];

      return statements.filter(
        (item) => item.time >= window.from && item.time <= window.to,
      );
    },
    async getCurrency() {
      return fixtures.currencyRates;
    },
    async setWebhook() {
      return undefined;
    },
  };
}

export async function createBundledFixtureMonobankAdapter(
  options: MonobankFixtureLoaderOptions = {},
): Promise<MonobankAdapter> {
  return createFixtureMonobankAdapter(await loadMonobankFixtureSet(options));
}

function normalizeMonobankBaseUrl(baseUrl: string | undefined): string {
  return (baseUrl ?? "https://api.monobank.ua").replace(/\/+$/, "");
}

async function parseErrorResponse(
  response: Response,
  endpoint: string,
  token: string,
): Promise<MonobankApiError> {
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader
    ? Number.parseInt(retryAfterHeader, 10)
    : undefined;
  let parsed: unknown;

  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }

  const fallbackMessage = response.statusText || "Monobank API request failed";
  const envelope: MonobankErrorResponse = {
    statusCode: response.status,
    code: response.status === 429 ? "rate_limited" : "monobank_api_error",
    message: redactSensitiveText(fallbackMessage, { secrets: [token] }),
  };

  if (retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds)) {
    envelope.retryAfterSeconds = retryAfterSeconds;
  }

  if (isRecord(parsed)) {
    if (typeof parsed.errorDescription === "string") {
      envelope.message = redactSensitiveText(parsed.errorDescription, {
        secrets: [token],
      });
    } else if (typeof parsed.message === "string") {
      envelope.message = redactSensitiveText(parsed.message, {
        secrets: [token],
      });
    }

    if (typeof parsed.code === "string") {
      envelope.code = parsed.code;
    } else if (typeof parsed.error === "string") {
      envelope.code = parsed.error;
    }
  }

  return new MonobankApiError(envelope, endpoint);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryDelayMs(attempt: number): number {
  return Math.min(250 * 2 ** attempt, 2_000);
}

function rateLimitKey(endpoint: string): "personal" | "bank" {
  return endpoint.startsWith("/personal/") ? "personal" : "bank";
}

export function createMonobankHttpAdapter(
  options: MonobankHttpAdapterOptions,
): MonobankAdapter {
  const token = options.token?.trim() ?? "";
  const baseUrl = normalizeMonobankBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRetries = options.maxRetries ?? 2;
  const userAgent = options.userAgent ?? "mono-ledger-sync";
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const rateLimitState =
    options.rateLimitState ?? createMonobankRateLimitState();
  // The waitMs calculation still needs the same Map the state uses, so
  // we re-read the latest allowed-at each time rather than caching.
  // (The state is the single source of truth; this closure just
  // dispatches reads to it.)

  async function waitForRateLimit(endpoint: string): Promise<void> {
    const key = rateLimitKey(endpoint);
    const scheduledAt = rateLimitState.getNextAllowedAt(key, now());
    const waitMs = scheduledAt - now();

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    if (key === "personal") {
      rateLimitState.recordRequest(key, now() + 60_000);
    }
  }

  async function request(
    endpoint: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const needsToken = rateLimitKey(endpoint) === "personal";

    if (needsToken && !token) {
      throw new MonobankValidationError("token", "a non-empty string");
    }

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      await waitForRateLimit(endpoint);

      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        const response = await fetchImpl(`${baseUrl}${endpoint}`, {
          ...init,
          signal: init.signal ?? controller.signal,
          headers: {
            ...(needsToken ? { "X-Token": token } : {}),
            accept: "application/json",
            "user-agent": userAgent,
            ...init.headers,
          },
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const apiError = await parseErrorResponse(response, endpoint, token);

          if (
            attempt < maxRetries &&
            (response.status === 429 || response.status >= 500)
          ) {
            await sleep(
              apiError.response.retryAfterSeconds
                ? apiError.response.retryAfterSeconds * 1_000
                : retryDelayMs(attempt),
            );
            continue;
          }

          throw apiError;
        }

        return response;
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof MonobankApiError) {
          throw error;
        }

        if (attempt >= maxRetries) {
          throw createMonobankNetworkError(endpoint, error);
        }

        await sleep(retryDelayMs(attempt));
      }
    }

    throw createMonobankNetworkError(endpoint, "max retries exceeded");
  }

  async function requestJson(endpoint: string, init: RequestInit = {}) {
    const response = await request(endpoint, init);

    if (response.status === 204) {
      return undefined;
    }

    return response.json();
  }

  return {
    async getClientInfo() {
      const body = await requestJson("/personal/client-info");

      assertMonobankClientInfo(body, "monobank:/personal/client-info");

      return body;
    },
    async getStatement(window) {
      const account = encodeURIComponent(window.accountId);
      const from = encodeURIComponent(String(window.from));
      const to = encodeURIComponent(String(window.to));
      const body = await requestJson(
        `/personal/statement/${account}/${from}/${to}`,
      );

      assertMonobankStatementItems(body, "monobank:/personal/statement");

      return body;
    },
    async getCurrency() {
      const body = await requestJson("/bank/currency");

      assertMonobankCurrencyRates(body, "monobank:/bank/currency");

      return body;
    },
    async setWebhook(url) {
      await request("/personal/webhook", {
        method: "POST",
        body: JSON.stringify({
          webHookUrl: url,
        }),
        headers: {
          "content-type": "application/json",
        },
      });
    },
  };
}
