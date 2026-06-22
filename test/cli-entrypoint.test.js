import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const binPath = path.join(repoRoot, "bin", "mono-ledger-sync.mjs");

function skipCliTests() {
  return process.env.MONO_LEDGER_SYNC_SKIP_CLI_TEST === "1";
}

function distExists() {
  // The bin imports from `../dist/server/dev.js`. If the lib has not been
  // built, the bin will throw `ERR_MODULE_NOT_FOUND` on startup and the
  // live-startup test would fail for the wrong reason. Probe first.
  const probe = spawnSync(
    "node",
    [
      "-e",
      "import('node:fs').then(({ existsSync }) => process.exit(existsSync('dist/server/dev.js') ? 0 : 1))",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return probe.status === 0;
}

function spawnCli(env) {
  return spawn("node", [binPath], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function awaitStdoutLine(child, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let stderrBuffer = "";
    let settled = false;
    const finish = (kind, payload) => {
      if (settled) return;
      settled = true;
      child.stdout.off("data", onData);
      child.stderr.off("data", onStderr);
      clearTimeout(timer);
      if (kind === "ready") {
        resolve(payload);
      } else {
        reject(new Error(payload));
      }
    };
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      if (predicate(buffer)) {
        finish("ready", buffer);
      }
    };
    const onStderr = (chunk) => {
      stderrBuffer += chunk.toString("utf8");
    };
    const timer = setTimeout(() => {
      finish(
        "error",
        `timed out after ${timeoutMs}ms; buffer: ${buffer}; stderr: ${stderrBuffer}`,
      );
    }, timeoutMs);
    child.stdout.on("data", onData);
    child.stderr.on("data", onStderr);
    child.once("exit", (code) => {
      finish(
        "error",
        `child exited (code=${code}) before predicate matched; buffer: ${buffer}; stderr: ${stderrBuffer}`,
      );
    });
  });
}

function awaitExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already dead
      }
      resolve(124);
    }, timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? 0);
    });
  });
}

test("cli bin path exists and is a regular file", () => {
  const result = spawnSync(
    "node",
    [
      "-e",
      "import('node:fs').then(m => process.exit(m.statSync(process.argv[1]).isFile() ? 0 : 1))",
      binPath,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
});

test(
  "cli --help prints env-var contract and exits 0",
  { skip: skipCliTests() },
  () => {
    const result = spawnSync("node", [binPath, "--help"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /mono-ledger-sync/);
    for (const name of [
      "MONO_LEDGER_SYNC_HOST",
      "MONO_LEDGER_SYNC_PORT",
      "MONO_LEDGER_SYNC_SOURCE",
      "MONO_LEDGER_SYNC_PROFILE",
      "MONO_LEDGER_SYNC_DATA_DIR",
      "MONOBANK_TOKEN",
      "MONO_LEDGER_SYNC_ACCESS_PASSCODE",
    ]) {
      assert.match(
        result.stdout,
        new RegExp(name),
        `help text should mention ${name}`,
      );
    }
  },
);

test("cli -h is an alias for --help", { skip: skipCliTests() }, () => {
  const result = spawnSync("node", [binPath, "-h"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Environment variables:/);
});

test(
  "cli starts the local API server and exits cleanly on SIGTERM",
  { skip: skipCliTests() || !distExists() },
  async () => {
    const child = spawnCli({
      MONO_LEDGER_SYNC_HOST: "127.0.0.1",
      // Pick a port in the IANA "private/dynamic" range that is unlikely to
      // collide with parallel test runs. The CLI does not currently support
      // "bind to a free port automatically" — that lands in a follow-up PR.
      MONO_LEDGER_SYNC_PORT: "18765",
      MONO_LEDGER_SYNC_PROFILE: `cli-test-${Date.now()}`,
      MONO_LEDGER_SYNC_DATA_DIR: path.join(
        repoRoot,
        "output",
        `cli-test-${Date.now()}`,
      ),
    });
    try {
      const buffer = await awaitStdoutLine(
        child,
        (buf) => buf.includes("Local UI available"),
        8_000,
      );
      assert.match(buffer, /Local UI available/);
      assert.match(buffer, /127\.0\.0\.1:\d+/);
      child.kill("SIGTERM");
      const exitCode = await awaitExit(child, 5_000);
      assert.equal(
        exitCode,
        0,
        `cli should exit 0 on SIGTERM, got ${exitCode}`,
      );
    } finally {
      if (child.exitCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          // already dead
        }
      }
    }
  },
);
