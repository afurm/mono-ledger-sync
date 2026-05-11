export interface MonobankAccount {
  id: string;
  sendId?: string;
  currencyCode: number;
  cashbackType?: string;
  balance: number;
  creditLimit: number;
  type: string;
  iban?: string;
}

export interface MonobankClientInfo {
  clientId: string;
  name: string;
  webHookUrl?: string;
  accounts: readonly MonobankAccount[];
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
  receiptId?: string;
  counterEdrpou?: string;
  counterIban?: string;
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
