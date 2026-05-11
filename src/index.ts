export const packageName = "mono-ledger-sync";
export const version = "0.1.0";

export type LedgerSource = "fixture" | "monobank";

export interface CreateSyncPlanOptions {
  profile?: string;
  source?: LedgerSource;
  dataDir?: string;
}

export interface SyncPlan {
  packageName: typeof packageName;
  version: typeof version;
  profile: string;
  source: LedgerSource;
  localOnly: true;
  dataDir?: string;
  nextSteps: readonly string[];
}

const ledgerSources = new Set<LedgerSource>(["fixture", "monobank"]);

export function isLedgerSource(value: string): value is LedgerSource {
  return ledgerSources.has(value as LedgerSource);
}

export function createSyncPlan(options: CreateSyncPlanOptions = {}): SyncPlan {
  const profile = options.profile?.trim() || "default";
  const source = options.source ?? "fixture";

  const plan: SyncPlan = {
    packageName,
    version,
    profile,
    source,
    localOnly: true,
    nextSteps: [
      "initialize a local profile",
      "connect fixture or Monobank data source",
      "sync statements into a local ledger",
      "review and export local financial data",
    ],
  };

  if (options.dataDir) {
    plan.dataDir = options.dataDir;
  }

  return plan;
}
