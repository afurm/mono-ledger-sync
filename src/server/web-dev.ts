import { spawn, type ChildProcess } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const apiHost =
  process.env.MONO_LEDGER_SYNC_HOST === "localhost" ? "localhost" : "127.0.0.1";
const apiPort = process.env.MONO_LEDGER_SYNC_PORT ?? process.env.PORT ?? "3000";
const apiHealthUrl = `http://${apiHost}:${apiPort}/api/health`;
const children = new Set<ChildProcess>();

let shuttingDown = false;

function startProcess(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): ChildProcess {
  const child = spawn(command, args, {
    env,
    stdio: "inherit",
  });

  children.add(child);
  child.once("exit", () => children.delete(child));

  return child;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForApi(): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(apiHealthUrl);

      if (response.ok) {
        return;
      }
    } catch {}

    await wait(150);
  }

  throw new Error(`Local API did not become ready at ${apiHealthUrl}`);
}

function stopChildren(): void {
  for (const child of children) {
    child.kill("SIGTERM");
  }
}

function shutdown(exitCode: number): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopChildren();
  process.exit(exitCode);
}

const apiServer = startProcess("node", ["dist/server/dev.js"], {
  ...process.env,
  MONO_LEDGER_SYNC_HOST: apiHost,
  MONO_LEDGER_SYNC_PORT: apiPort,
});

apiServer.once("exit", (code) => {
  if (!shuttingDown) {
    shutdown(code ?? 1);
  }
});

try {
  await waitForApi();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}

const viteServer = startProcess(npmCommand, ["run", "web:vite"], process.env);

viteServer.once("exit", (code) => {
  if (!shuttingDown) {
    shutdown(code ?? 1);
  }
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
