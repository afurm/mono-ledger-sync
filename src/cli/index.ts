import { spawn } from "node:child_process";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import {
  createSyncPlan,
  isLedgerSource,
  packageName,
  type CreateSyncPlanOptions,
  type LedgerSource,
  version,
} from "../core/index.js";
import {
  createLedgerExport,
  exportPresetNames,
  isExportFormat,
  isExportPreset,
  type ExportFormat,
  type ExportPreset,
} from "../exports/index.js";
import {
  createBundledFixtureMonobankAdapter,
  createMonobankHttpAdapter,
} from "../monobank/index.js";
import { maskIdentifier, redactSensitiveText } from "../privacy/index.js";
import {
  createLocalApiServer,
  resolveLocalLedgerDatabasePath,
} from "../server/index.js";
import { createSqliteLedgerDb } from "../sqlite/index.js";
import { syncLedgerWithMonobank } from "../sync/index.js";

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

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function readProfile(args: readonly string[]): string {
  return readOption(args, "--profile") ?? "default";
}

function readLocalDatabaseOptions(args: readonly string[]): {
  profile: string;
  dataDir?: string;
} {
  const profile = readProfile(args);
  const dataDir = readOption(args, "--data-dir");

  return {
    profile,
    ...(dataDir ? { dataDir } : {}),
  };
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

function readUnixSecondsOption(
  args: readonly string[],
  name: string,
  io: CliIO,
  runtime: CliRuntime,
): number | undefined {
  const value = readOption(args, name);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    io.error(`Unsupported ${name}: ${value}`);
    runtime.exitCode = 1;
    return undefined;
  }

  return parsed;
}

function readPositiveSecondsOption(
  args: readonly string[],
  name: string,
  io: CliIO,
  runtime: CliRuntime,
): number | undefined {
  const value = readOption(args, name);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    io.error(`Unsupported ${name}: ${value}`);
    runtime.exitCode = 1;
    return undefined;
  }

  return parsed;
}

function readExportFormat(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): ExportFormat | undefined {
  const format = readOption(args, "--format");

  if (format === undefined) {
    return undefined;
  }

  if (!isExportFormat(format)) {
    io.error(`Unsupported export format: ${format}`);
    runtime.exitCode = 1;
    return undefined;
  }

  return format;
}

function readExportPreset(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): ExportPreset | undefined {
  const preset = readOption(args, "--preset");

  if (preset === undefined) {
    return undefined;
  }

  if (!isExportPreset(preset)) {
    io.error(
      `Unsupported export preset: ${preset}. Supported presets: ${exportPresetNames.join(", ")}`,
    );
    runtime.exitCode = 1;
    return undefined;
  }

  return preset;
}

function timestampForPath(date = new Date()): string {
  return date
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");
}

function openBrowser(url: string): void {
  const opener =
    process.platform === "darwin"
      ? { command: "open", args: [url] }
      : process.platform === "win32"
        ? { command: "cmd", args: ["/c", "start", "", url] }
        : { command: "xdg-open", args: [url] };
  const child = spawn(opener.command, opener.args, {
    detached: true,
    stdio: "ignore",
  });

  child.on("error", () => undefined);
  child.unref();
}

function helpText(): string {
  return `${packageName} ${version}

Usage:
  mono-ledger-sync
  mono-ledger-sync ui [--host 127.0.0.1|localhost] [--port 3000] [--profile name] [--source fixture|monobank] [--data-dir path] [--no-open]
  mono-ledger-sync init [--profile name] [--source fixture|monobank] [--data-dir path]
  mono-ledger-sync sync [run] [--profile name] [--source fixture|monobank] [--data-dir path] [--from unix] [--to unix] [--account id] [--slice seconds] [--dry-run]
  mono-ledger-sync export [--profile name] [--format csv|json|jsonl|journal-csv] [--preset accountant-handoff|monthly-personal-finance|bookkeeping|budget-analysis|raw-transaction-archive] [--data-dir path] [--account id] [--category id] [--from unix] [--to unix]
  mono-ledger-sync data path [--profile name] [--data-dir path]
  mono-ledger-sync data delete --yes [--profile name] [--data-dir path]
  mono-ledger-sync db backup [--profile name] [--data-dir path]
  mono-ledger-sync db export [--profile name] [--data-dir path] [--output path]
  mono-ledger-sync db restore --from path --yes [--profile name] [--data-dir path]
  mono-ledger-sync db inspect [--profile name] [--data-dir path]
  mono-ledger-sync db compact [--profile name] [--data-dir path]
  mono-ledger-sync auth status [--source fixture|monobank]
  mono-ledger-sync auth test [--source fixture|monobank]
  mono-ledger-sync logs redact --text value
  mono-ledger-sync doctor [--profile name] [--source fixture|monobank] [--data-dir path]
  mono-ledger-sync serve [--host 127.0.0.1|localhost] [--port 3000] [--profile name] [--source fixture|monobank] [--data-dir path] [--no-open]
  mono-ledger-sync version

Running without a command starts the local app server.
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

async function createAdapter(source: LedgerSource) {
  if (source === "fixture") {
    return createBundledFixtureMonobankAdapter();
  }

  if (!process.env.MONOBANK_TOKEN?.trim()) {
    throw new Error("MONOBANK_TOKEN is required for --source monobank");
  }

  return createMonobankHttpAdapter({
    token: process.env.MONOBANK_TOKEN,
  });
}

async function runSync(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): Promise<void> {
  const commandArgs = args[0] === "run" ? args.slice(1) : args;
  const source = readLedgerSource(commandArgs, io, runtime);
  const from = readUnixSecondsOption(commandArgs, "--from", io, runtime);
  const to = readUnixSecondsOption(commandArgs, "--to", io, runtime);
  const sliceSeconds = readPositiveSecondsOption(
    commandArgs,
    "--slice",
    io,
    runtime,
  );
  const accountId = readOption(commandArgs, "--account");
  const dryRun = hasFlag(commandArgs, "--dry-run");

  if (!source || runtime.exitCode) {
    return;
  }

  if (sliceSeconds !== undefined && (from === undefined || to === undefined)) {
    io.error("sync --slice requires --from and --to");
    runtime.exitCode = 1;
    return;
  }

  const databaseOptions = readLocalDatabaseOptions(commandArgs);
  const profile = databaseOptions.profile;
  const db = createSqliteLedgerDb({
    filePath: resolveLocalLedgerDatabasePath(databaseOptions),
    profile,
  });

  try {
    const result = await syncLedgerWithMonobank({
      profile,
      source,
      adapter: await createAdapter(source),
      db,
      dryRun,
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(accountId ? { accountIds: [accountId] } : {}),
      ...(sliceSeconds !== undefined ? { sliceSeconds } : {}),
    });

    io.log(JSON.stringify(result, null, 2));
  } finally {
    await db.close();
  }
}

async function runExport(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): Promise<void> {
  const format = readExportFormat(args, io, runtime);
  const preset = readExportPreset(args, io, runtime);
  const from = readUnixSecondsOption(args, "--from", io, runtime);
  const to = readUnixSecondsOption(args, "--to", io, runtime);

  if (runtime.exitCode || format === "sqlite") {
    if (format === "sqlite") {
      io.error("SQLite export is the local database file itself");
      runtime.exitCode = 1;
    }
    return;
  }

  const databaseOptions = readLocalDatabaseOptions(args);
  const profile = databaseOptions.profile;
  const accountId = readOption(args, "--account");
  const categoryId = readOption(args, "--category");
  const db = createSqliteLedgerDb({
    filePath: resolveLocalLedgerDatabasePath(databaseOptions),
    profile,
  });

  try {
    await db.migrate();
    const ledgerExport = await createLedgerExport(db, {
      profile,
      ...(format ? { format } : {}),
      ...(preset ? { preset } : {}),
      ...(accountId ? { accountIds: [accountId] } : {}),
      ...(categoryId ? { categoryIds: [categoryId] } : {}),
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
    });

    io.log(ledgerExport.body);
  } finally {
    await db.close();
  }
}

function runData(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): Promise<void> | void {
  const [command, ...commandArgs] = args;

  const databaseOptions = readLocalDatabaseOptions(commandArgs);
  const databasePath = resolveLocalLedgerDatabasePath(databaseOptions);

  if (command === "path") {
    io.log(
      JSON.stringify(
        {
          profile: databaseOptions.profile,
          dataDir: path.dirname(databasePath),
          databasePath,
          localOnly: true,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "delete") {
    if (!hasFlag(commandArgs, "--yes")) {
      io.error("data delete requires --yes");
      runtime.exitCode = 1;
      return;
    }

    return deleteLocalData(databaseOptions.profile, databasePath, io);
  }

  io.error(`Unknown data command: ${command ?? ""}`.trim());
  runtime.exitCode = 1;
}

async function deleteLocalData(
  profile: string,
  databasePath: string,
  io: CliIO,
): Promise<void> {
  const removedPaths = [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
  ];

  await Promise.all(
    removedPaths.map((filePath) =>
      rm(filePath, {
        force: true,
      }),
    ),
  );

  io.log(
    JSON.stringify(
      {
        profile,
        removedPaths,
      },
      null,
      2,
    ),
  );
}

async function runDb(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): Promise<void> {
  const [command, ...commandArgs] = args;

  const databaseOptions = readLocalDatabaseOptions(commandArgs);
  const databasePath = resolveLocalLedgerDatabasePath(databaseOptions);

  if (command === "inspect") {
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile: databaseOptions.profile,
    });

    try {
      await db.migrate();
      io.log(JSON.stringify(await db.getDatabaseInfo(), null, 2));
    } finally {
      await db.close();
    }
    return;
  }

  if (command === "compact") {
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile: databaseOptions.profile,
    });

    try {
      await db.migrate();
      await db.compact();
      io.log(
        JSON.stringify(
          {
            profile: databaseOptions.profile,
            databasePath,
            compacted: true,
          },
          null,
          2,
        ),
      );
    } finally {
      await db.close();
    }
    return;
  }

  if (command === "restore") {
    if (!hasFlag(commandArgs, "--yes")) {
      io.error("db restore requires --yes");
      runtime.exitCode = 1;
      return;
    }

    const sourcePath = readOption(commandArgs, "--from");

    if (!sourcePath) {
      io.error("db restore requires --from");
      runtime.exitCode = 1;
      return;
    }

    const sourceStat = await stat(sourcePath);
    const currentBackupPath = await backupExistingDatabase(
      databasePath,
      databaseOptions.profile,
    );

    await mkdir(path.dirname(databasePath), { recursive: true });
    await Promise.all([
      rm(`${databasePath}-wal`, { force: true }),
      rm(`${databasePath}-shm`, { force: true }),
    ]);
    await copyFile(sourcePath, databasePath);

    io.log(
      JSON.stringify(
        {
          profile: databaseOptions.profile,
          databasePath,
          sourcePath,
          sourceBytes: sourceStat.size,
          restored: true,
          ...(currentBackupPath ? { currentBackupPath } : {}),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "export") {
    const exportPath =
      readOption(commandArgs, "--output") ??
      path.join(
        path.dirname(databasePath),
        "exports",
        `${path.basename(databasePath, ".sqlite")}-${timestampForPath()}.sqlite`,
      );
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile: databaseOptions.profile,
    });

    try {
      await db.migrate();
    } finally {
      await db.close();
    }

    await mkdir(path.dirname(exportPath), { recursive: true });
    await copyFile(databasePath, exportPath);

    const exportStat = await stat(exportPath);

    io.log(
      JSON.stringify(
        {
          profile: databaseOptions.profile,
          databasePath,
          exportPath,
          bytes: exportStat.size,
          format: "sqlite",
          containsSecrets: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command !== "backup") {
    io.error(`Unknown db command: ${command ?? ""}`.trim());
    runtime.exitCode = 1;
    return;
  }

  const backupDir = path.join(path.dirname(databasePath), "backups");
  const backupPath = path.join(
    backupDir,
    `${path.basename(databasePath, ".sqlite")}-${timestampForPath()}.sqlite`,
  );
  const db = createSqliteLedgerDb({
    filePath: databasePath,
    profile: databaseOptions.profile,
  });

  try {
    await db.migrate();
  } finally {
    await db.close();
  }

  await mkdir(backupDir, { recursive: true });
  await copyFile(databasePath, backupPath);

  const backupStat = await stat(backupPath);

  io.log(
    JSON.stringify(
      {
        profile: databaseOptions.profile,
        databasePath,
        backupPath,
        bytes: backupStat.size,
      },
      null,
      2,
    ),
  );
}

async function backupExistingDatabase(
  databasePath: string,
  profile: string,
): Promise<string | undefined> {
  try {
    await stat(databasePath);
  } catch {
    return undefined;
  }

  const backupDir = path.join(path.dirname(databasePath), "backups");
  const backupPath = path.join(
    backupDir,
    `${profile}-before-restore-${timestampForPath()}.sqlite`,
  );

  await mkdir(backupDir, { recursive: true });
  await copyFile(databasePath, backupPath);

  return backupPath;
}

async function runAuth(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): Promise<void> {
  const [command, ...commandArgs] = args;
  const source = readLedgerSource(commandArgs, io, runtime);

  if (!source) {
    return;
  }

  const tokenPresent = Boolean(process.env.MONOBANK_TOKEN?.trim());

  if (command === "status") {
    io.log(
      JSON.stringify(
        {
          source,
          tokenRequired: source === "monobank",
          tokenPresent: source === "fixture" ? false : tokenPresent,
          tokenSource:
            source === "fixture"
              ? "not-required"
              : tokenPresent
                ? "env:MONOBANK_TOKEN"
                : "missing",
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "test") {
    try {
      const adapter = await createAdapter(source);
      const clientInfo = await adapter.getClientInfo();

      io.log(
        JSON.stringify(
          {
            ok: true,
            source,
            clientId: maskIdentifier(clientInfo.clientId),
            accounts: clientInfo.accounts.map((account) => ({
              id: maskIdentifier(account.id),
              type: account.type,
              currencyCode: account.currencyCode,
              maskedPan: account.maskedPan,
            })),
            jars: clientInfo.jars?.length ?? 0,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      io.error(
        redactSensitiveText(
          error instanceof Error ? error.message : String(error),
          {
            secrets: [process.env.MONOBANK_TOKEN ?? ""],
          },
        ),
      );
      runtime.exitCode = 1;
    }
    return;
  }

  io.error(`Unknown auth command: ${command ?? ""}`.trim());
  runtime.exitCode = 1;
}

function runLogs(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): void {
  const [command, ...commandArgs] = args;

  if (command !== "redact") {
    io.error(`Unknown logs command: ${command ?? ""}`.trim());
    runtime.exitCode = 1;
    return;
  }

  const text = readOption(commandArgs, "--text");

  if (text === undefined) {
    io.error("logs redact requires --text");
    runtime.exitCode = 1;
    return;
  }

  io.log(
    redactSensitiveText(text, {
      secrets: [process.env.MONOBANK_TOKEN ?? ""],
    }),
  );
}

async function runDoctor(
  args: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): Promise<void> {
  const source = readLedgerSource(args, io, runtime);

  if (!source) {
    return;
  }

  const databaseOptions = readLocalDatabaseOptions(args);
  const databasePath = resolveLocalLedgerDatabasePath(databaseOptions);
  const checks = [
    {
      name: "local-only",
      status: "ok",
      message: "Server and data paths are local to this machine.",
    },
    {
      name: "token",
      status:
        source === "fixture" || process.env.MONOBANK_TOKEN?.trim()
          ? "ok"
          : "warning",
      message:
        source === "fixture"
          ? "Fixture mode does not require a Monobank token."
          : process.env.MONOBANK_TOKEN?.trim()
            ? "MONOBANK_TOKEN is configured for this shell."
            : "MONOBANK_TOKEN is not configured for live Monobank sync.",
    },
  ];
  const db = createSqliteLedgerDb({
    filePath: databasePath,
    profile: databaseOptions.profile,
  });

  try {
    await db.migrate();
    checks.push({
      name: "storage",
      status: "ok",
      message: "SQLite database is reachable and migrated.",
    });
  } catch (error) {
    checks.push({
      name: "storage",
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    });
    runtime.exitCode = 1;
  } finally {
    await db.close();
  }

  io.log(
    JSON.stringify(
      {
        status: checks.some((check) => check.status === "failed")
          ? "failed"
          : checks.some((check) => check.status === "warning")
            ? "needs_attention"
            : "ok",
        profile: databaseOptions.profile,
        source,
        dataDir: path.dirname(databasePath),
        databasePath,
        checks,
      },
      null,
      2,
    ),
  );
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

  const profile = readProfile(args);
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

  io.log(`Ledger summary: ${url}/api/ledger/summary`);

  if (!hasFlag(args, "--no-open") && process.env.CI !== "true") {
    openBrowser(url);
    io.log(`Opened browser: ${url}`);
  }
}

export async function runCli(
  argv: readonly string[],
  io: CliIO,
  runtime: CliRuntime,
): Promise<void> {
  const [, , command = "serve", ...args] = argv;

  switch (command) {
    case "init":
      runInit(args, io, runtime);
      break;
    case "sync":
      await runSync(args, io, runtime);
      break;
    case "export":
      await runExport(args, io, runtime);
      break;
    case "data":
      await runData(args, io, runtime);
      break;
    case "db":
      await runDb(args, io, runtime);
      break;
    case "auth":
      await runAuth(args, io, runtime);
      break;
    case "logs":
      runLogs(args, io, runtime);
      break;
    case "doctor":
      await runDoctor(args, io, runtime);
      break;
    case "ui":
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
