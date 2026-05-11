#!/usr/bin/env node
import {
  createSyncPlan,
  isLedgerSource,
  packageName,
  type CreateSyncPlanOptions,
  version,
} from "./index.js";

const [, , command = "help", ...args] = process.argv;

function readOption(name: string): string | undefined {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function printHelp(): void {
  console.log(`${packageName} ${version}

Usage:
  mono-ledger-sync init [--profile name] [--source fixture|monobank] [--data-dir path]
  mono-ledger-sync version
  mono-ledger-sync help`);
}

function runInit(): void {
  const source = readOption("--source") ?? "fixture";

  if (!isLedgerSource(source)) {
    console.error(`Unsupported source: ${source}`);
    process.exitCode = 1;
    return;
  }

  const planOptions: CreateSyncPlanOptions = { source };
  const profile = readOption("--profile");
  const dataDir = readOption("--data-dir");

  if (profile) {
    planOptions.profile = profile;
  }

  if (dataDir) {
    planOptions.dataDir = dataDir;
  }

  const plan = createSyncPlan(planOptions);

  console.log(JSON.stringify(plan, null, 2));
}

switch (command) {
  case "init":
    runInit();
    break;
  case "version":
  case "--version":
  case "-v":
    console.log(version);
    break;
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
}
