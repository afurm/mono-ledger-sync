import {
  createSyncPlan,
  isLedgerSource,
  packageName,
  type CreateSyncPlanOptions,
  version,
} from "../core/index.js";

export interface CliIO {
  log(message: string): void;
  error(message: string): void;
}

export interface CliRuntime {
  exitCode?: number | string | undefined;
}

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function helpText(): string {
  return `${packageName} ${version}

Usage:
  mono-ledger-sync init [--profile name] [--source fixture|monobank] [--data-dir path]
  mono-ledger-sync version
  mono-ledger-sync help`;
}

function runInit(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): void {
  const source = readOption(args, "--source") ?? "fixture";

  if (!isLedgerSource(source)) {
    io.error(`Unsupported source: ${source}`);
    runtime.exitCode = 1;
    return;
  }

  const planOptions: CreateSyncPlanOptions = { source };
  const profile = readOption(args, "--profile");
  const dataDir = readOption(args, "--data-dir");

  if (profile) {
    planOptions.profile = profile;
  }

  if (dataDir) {
    planOptions.dataDir = dataDir;
  }

  io.log(JSON.stringify(createSyncPlan(planOptions), null, 2));
}

export function runCli(
  argv: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): void {
  const [, , command = "help", ...args] = argv;

  switch (command) {
    case "init":
      runInit(args, io, runtime);
      break;
    case "version":
    case "--version":
    case "-v":
      io.log(version);
      break;
    case "help":
    case "--help":
    case "-h":
      io.log(helpText());
      break;
    default:
      io.error(`Unknown command: ${command}`);
      io.log(helpText());
      runtime.exitCode = 1;
  }
}
