import assert from "node:assert/strict";
import test from "node:test";

import {
  createSyncPlan,
  isLedgerSource,
  packageName,
  version,
} from "../dist/index.js";

test("creates a fixture-backed local sync plan by default", () => {
  assert.deepEqual(createSyncPlan(), {
    packageName,
    version,
    profile: "default",
    source: "fixture",
    localOnly: true,
    nextSteps: [
      "initialize a local profile",
      "connect fixture or Monobank data source",
      "sync statements into a local ledger",
      "review and export local financial data",
    ],
  });
});

test("validates supported ledger sources", () => {
  assert.equal(isLedgerSource("fixture"), true);
  assert.equal(isLedgerSource("monobank"), true);
  assert.equal(isLedgerSource("other"), false);
});
