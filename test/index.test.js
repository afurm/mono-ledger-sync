import assert from "node:assert/strict";
import test from "node:test";

import {
  createSyncPlan,
  isLedgerSource,
  packageName,
  version,
} from "../dist/index.js";

test("creates a Monobank-backed local sync plan by default", () => {
  assert.deepEqual(createSyncPlan(), {
    packageName,
    version,
    profile: "default",
    source: "monobank",
    localOnly: true,
    nextSteps: [
      "start the local web app",
      "save a Monobank personal API token",
      "sync statements into a local SQLite ledger",
      "review and export local financial data",
    ],
  });
});

test("validates supported ledger sources", () => {
  assert.equal(isLedgerSource("fixture"), true);
  assert.equal(isLedgerSource("monobank"), true);
  assert.equal(isLedgerSource("other"), false);
});
