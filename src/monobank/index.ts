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
