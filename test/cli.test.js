import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../dist/cli/index.js";

test("runs init through the CLI boundary", async () => {
  const messages = [];
  const errors = [];
  const runtime = {};

  await runCli(
    ["node", "mono-ledger-sync", "init", "--source", "fixture"],
    {
      log: (message) => messages.push(message),
      error: (message) => errors.push(message),
    },
    runtime,
  );

  assert.deepEqual(errors, []);
  assert.equal(runtime.exitCode, undefined);
  assert.equal(JSON.parse(messages[0]).source, "fixture");
});

test("rejects unsupported sources through the CLI boundary", async () => {
  const errors = [];
  const runtime = {};

  await runCli(
    ["node", "mono-ledger-sync", "init", "--source", "other"],
    {
      log: () => undefined,
      error: (message) => errors.push(message),
    },
    runtime,
  );

  assert.deepEqual(errors, ["Unsupported source: other"]);
  assert.equal(runtime.exitCode, 1);
});

test("documents the local server command in help output", async () => {
  const messages = [];
  const runtime = {};

  await runCli(
    ["node", "mono-ledger-sync", "help"],
    {
      log: (message) => messages.push(message),
      error: () => undefined,
    },
    runtime,
  );

  assert.match(messages[0], /mono-ledger-sync serve/);
  assert.match(messages[0], /--port 3000/);
});

test("rejects invalid local server ports", async () => {
  const errors = [];
  const runtime = {};

  await runCli(
    ["node", "mono-ledger-sync", "serve", "--port", "nope"],
    {
      log: () => undefined,
      error: (message) => errors.push(message),
    },
    runtime,
  );

  assert.deepEqual(errors, ["Unsupported port: nope"]);
  assert.equal(runtime.exitCode, 1);
});
