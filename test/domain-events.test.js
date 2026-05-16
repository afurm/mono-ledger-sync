import assert from "node:assert/strict";
import test from "node:test";

import {
  localActivityEventSeverities,
  localActivityEventTypes,
} from "../dist/domain/index.js";

test("defines local activity event categories for sync and webhook flows", () => {
  assert.equal(localActivityEventTypes.includes("sync_run"), true);
  assert.equal(localActivityEventTypes.includes("ledger_write"), true);
  assert.equal(localActivityEventTypes.includes("webhook_delivery"), true);
  assert.equal(localActivityEventTypes.includes("report_refresh"), true);
  assert.equal(localActivityEventTypes.includes("rule_application"), true);
});

test("exposes local activity event severities", () => {
  assert.ok(localActivityEventSeverities.includes("info"));
  assert.ok(localActivityEventSeverities.includes("warning"));
  assert.ok(localActivityEventSeverities.includes("error"));
});
