export const packageName = "mono-ledger-sync";
export const version = "0.1.1";

export const productArchitecture = {
  ui: "vite",
  server: "fastify",
  storage: "sqlite",
} as const;

export const supportedLedgerSources = ["fixture", "monobank"] as const;

export type LedgerSource = (typeof supportedLedgerSources)[number];

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

const ledgerSources = new Set<LedgerSource>(supportedLedgerSources);

export function isLedgerSource(value: string): value is LedgerSource {
  return ledgerSources.has(value as LedgerSource);
}

export function createSyncPlan(options: CreateSyncPlanOptions = {}): SyncPlan {
  const profile = options.profile?.trim() || "default";
  const source = options.source ?? "monobank";

  const plan: SyncPlan = {
    packageName,
    version,
    profile,
    source,
    localOnly: true,
    nextSteps: [
      "start the local web app",
      "save a Monobank personal API token",
      "sync statements into a local SQLite ledger",
      "review and export local financial data",
    ],
  };

  if (options.dataDir) {
    plan.dataDir = options.dataDir;
  }

  return plan;
}
