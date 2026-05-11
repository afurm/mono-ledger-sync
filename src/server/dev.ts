import { isLedgerSource, type LedgerSource } from "../core/index.js";
import { createLocalApiServer, type LocalApiServerOptions } from "./index.js";

function readHost(): "127.0.0.1" | "localhost" | undefined {
  const host = process.env.MONO_LEDGER_SYNC_HOST ?? process.env.HOST;

  if (host === undefined || host === "") {
    return undefined;
  }

  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("MONO_LEDGER_SYNC_HOST must be 127.0.0.1 or localhost");
  }

  return host;
}

function readPort(): number | undefined {
  const port = process.env.MONO_LEDGER_SYNC_PORT ?? process.env.PORT;

  if (port === undefined || port === "") {
    return 3000;
  }

  const parsed = Number.parseInt(port, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("MONO_LEDGER_SYNC_PORT must be a positive integer");
  }

  return parsed;
}

function readSource(): LedgerSource | undefined {
  const source = process.env.MONO_LEDGER_SYNC_SOURCE;

  if (source === undefined || source === "") {
    return "fixture";
  }

  if (!isLedgerSource(source)) {
    throw new Error("MONO_LEDGER_SYNC_SOURCE must be fixture or monobank");
  }

  return source;
}

const serverOptions: LocalApiServerOptions = {};
const host = readHost();
const port = readPort();
const source = readSource();

if (host) {
  serverOptions.host = host;
}

if (port) {
  serverOptions.port = port;
}

if (process.env.MONO_LEDGER_SYNC_PROFILE) {
  serverOptions.profile = process.env.MONO_LEDGER_SYNC_PROFILE;
}

if (source) {
  serverOptions.source = source;
}

if (process.env.MONO_LEDGER_SYNC_DATA_DIR) {
  serverOptions.dataDir = process.env.MONO_LEDGER_SYNC_DATA_DIR;
}

if (process.env.MONOBANK_TOKEN) {
  serverOptions.monobankToken = process.env.MONOBANK_TOKEN;
}

const server = createLocalApiServer(serverOptions);

const url = await server.listen();
console.log(`Local UI available at ${url}`);

async function shutdown(): Promise<void> {
  await server.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
