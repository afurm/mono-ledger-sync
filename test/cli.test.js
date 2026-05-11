import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../dist/cli/index.js";

test("runs init through the CLI boundary", () => {
  const messages = [];
  const errors = [];
  const runtime = {};

  runCli(
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

test("rejects unsupported sources through the CLI boundary", () => {
  const errors = [];
  const runtime = {};

  runCli(
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
