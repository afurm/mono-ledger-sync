import {
  createSyncPlan,
  isLedgerSource,
  packageName,
  type CreateSyncPlanOptions,
  type LedgerSource,
  version,
} from "../core/index.js";
import { createLocalApiServer } from "../server/index.js";

export interface CliIO {
  log(message: string): void;
  error(message: string): void;
}

export interface CliRuntime {
  exitCode?: number | string | undefined;
}

type CliHost = "127.0.0.1" | "localhost";

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function readLedgerSource(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): LedgerSource | undefined {
  const source = readOption(args, "--source") ?? "fixture";

  if (!isLedgerSource(source)) {
    io.error(`Unsupported source: ${source}`);
    runtime.exitCode = 1;
    return undefined;
  }

  return source;
}

function readHost(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): CliHost | undefined {
  const host = readOption(args, "--host") ?? "127.0.0.1";

  if (host !== "127.0.0.1" && host !== "localhost") {
    io.error(`Unsupported host: ${host}`);
    runtime.exitCode = 1;
    return undefined;
  }

  return host;
}

function readPort(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): number | undefined {
  const rawPort = readOption(args, "--port") ?? "3000";
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    io.error(`Unsupported port: ${rawPort}`);
    runtime.exitCode = 1;
    return undefined;
  }

  return port;
}

function helpText(): string {
  return `${packageName} ${version}

Usage:
  mono-ledger-sync init [--profile name] [--source fixture|monobank] [--data-dir path]
  mono-ledger-sync serve [--host 127.0.0.1|localhost] [--port 3000] [--profile name] [--source fixture|monobank] [--data-dir path]
  mono-ledger-sync version
  mono-ledger-sync help`;
}

function runInit(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): void {
  const source = readLedgerSource(args, io, runtime);

  if (!source) {
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

async function runServe(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): Promise<void> {
  const source = readLedgerSource(args, io, runtime);
  const host = readHost(args, io, runtime);
  const port = readPort(args, io, runtime);

  if (!source || !host || port === undefined) {
    return;
  }

  const profile = readOption(args, "--profile") ?? "default";
  const dataDir = readOption(args, "--data-dir");
  const server = createLocalApiServer({
    host,
    port,
    profile,
    source,
    ...(dataDir ? { dataDir } : {}),
  });
  const url = await server.listen();

  io.log(`Local app server running at ${url}`);
  io.log(`Health: ${url}/api/health`);

  if (source === "fixture") {
    io.log(`Fixture summary: ${url}/api/fixtures/summary`);
  }
}

export async function runCli(
  argv: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): Promise<void> {
  const [, , command = "help", ...args] = argv;

  switch (command) {
    case "init":
      runInit(args, io, runtime);
      break;
    case "serve":
      await runServe(args, io, runtime);
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
