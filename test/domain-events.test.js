import assert from "node:assert/strict";
import test from "node:test";

import {
  createDomainErrorDescriptor,
  domainErrorCategories,
  domainErrorCategoryForCode,
  domainErrorCodeCategories,
  domainErrorCodes,
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
  assert.ok(localActivityEventSeverities.includes("partial"));
  assert.ok(localActivityEventSeverities.includes("warning"));
  assert.ok(localActivityEventSeverities.includes("error"));
});

test("defines a complete domain error taxonomy", () => {
  assert.deepEqual(domainErrorCategories, [
    "auth",
    "rate_limit",
    "validation",
    "network",
    "storage",
    "migration",
    "config",
    "privacy",
    "internal",
  ]);
  assert.deepEqual(Object.keys(domainErrorCodeCategories), domainErrorCodes);

  for (const code of domainErrorCodes) {
    assert.equal(
      domainErrorCategories.includes(domainErrorCategoryForCode(code)),
      true,
    );
  }

  assert.equal(domainErrorCategoryForCode("auth_required"), "auth");
  assert.equal(domainErrorCategoryForCode("rate_limit_exceeded"), "rate_limit");
  assert.equal(domainErrorCategoryForCode("validation_failed"), "validation");
  assert.equal(domainErrorCategoryForCode("network_unreachable"), "network");
  assert.equal(domainErrorCategoryForCode("storage_corrupted"), "storage");
  assert.equal(domainErrorCategoryForCode("migration_failed"), "migration");
  assert.equal(domainErrorCategoryForCode("config_invalid"), "config");
  assert.equal(domainErrorCategoryForCode("privacy_violation"), "privacy");
});

test("creates domain error descriptors from the canonical taxonomy", () => {
  assert.deepEqual(createDomainErrorDescriptor("request_invalid"), {
    code: "request_invalid",
    category: "validation",
  });
  assert.deepEqual(
    createDomainErrorDescriptor("internal_error", { route: "/" }),
    {
      code: "internal_error",
      category: "internal",
      details: { route: "/" },
    },
  );
});
