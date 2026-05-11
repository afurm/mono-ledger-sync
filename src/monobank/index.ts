import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface MonobankAccount {
  id: string;
  sendId?: string;
  currencyCode: number;
  cashbackType?: string;
  balance: number;
  creditLimit: number;
  type: string;
  maskedPan?: readonly string[];
  iban?: string;
}

export interface MonobankJar {
  id: string;
  sendId?: string;
  title: string;
  description: string;
  currencyCode: number;
  balance: number;
  goal: number;
}

export interface MonobankManagedClient {
  clientId: string;
  tin?: number;
  name: string;
  accounts: readonly MonobankAccount[];
}

export interface MonobankClientInfo {
  clientId: string;
  name: string;
  webHookUrl?: string;
  permissions?: string;
  accounts: readonly MonobankAccount[];
  jars?: readonly MonobankJar[];
  managedClients?: readonly MonobankManagedClient[];
}

export interface MonobankStatementItem {
  id: string;
  time: number;
  description: string;
  mcc: number;
  originalMcc: number;
  amount: number;
  operationAmount: number;
  currencyCode: number;
  commissionRate: number;
  cashbackAmount: number;
  balance: number;
  hold: boolean;
  comment?: string;
  receiptId?: string;
  invoiceId?: string;
  counterEdrpou?: string;
  counterIban?: string;
  counterName?: string;
}

export interface MonobankCurrencyRate {
  currencyCodeA: number;
  currencyCodeB: number;
  date: number;
  rateBuy?: number;
  rateSell?: number;
  rateCross?: number;
}

export interface StatementWindow {
  accountId: string;
  from: number;
  to: number;
}

export interface MonobankAdapter {
  getClientInfo(): Promise<MonobankClientInfo>;
  getStatement(
    window: StatementWindow,
  ): Promise<readonly MonobankStatementItem[]>;
  getCurrency(): Promise<readonly MonobankCurrencyRate[]>;
  setWebhook(url: string): Promise<void>;
}

export interface MonobankStatementItemWebhookEvent {
  type: "StatementItem";
  data: {
    account: string;
    statementItem: MonobankStatementItem;
  };
}

export type MonobankPersonalWebhookEvent = MonobankStatementItemWebhookEvent;

export interface MonobankErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  retryAfterSeconds?: number;
}

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

export const bundledMonobankFixturesDir = fileURLToPath(
  new URL("../../fixtures/monobank", import.meta.url),
);

export class MonobankValidationError extends Error {
  constructor(
    readonly path: string,
    readonly expected: string,
  ) {
    super(`${path} must be ${expected}`);
    this.name = "MonobankValidationError";
  }
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

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new MonobankValidationError(path, "a boolean");
  }
}

function assertOptionalString(value: unknown, path: string): void {
  if (value !== undefined) {
    assertString(value, path);
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
  assertString(value.id, `${path}.id`);
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
