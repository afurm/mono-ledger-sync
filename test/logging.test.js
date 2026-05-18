import assert from "node:assert/strict";
import test from "node:test";

import {
  formatStructuredLogLine,
  logStructured,
} from "../dist/logging/index.js";

test("formats structured logs with redacted sensitive values", () => {
  const line = formatStructuredLogLine(
    "info",
    "Local UI available at https://example.com",
    {
      token: "live-secret-token",
      headers: {
        "X-Token": "live-secret-token",
      },
      accountIban: "UA213223130000026007233566001",
    },
    {
      secrets: ["live-secret-token", "UA213223130000026007233566001"],
    },
  );

  assert.match(line, /^\[INFO\] Local UI available at/);
  assert.doesNotMatch(line, /live-secret-token/);
  assert.doesNotMatch(line, /UA213223130000026007233566001/);
  assert.match(line, /\[redacted\]/);
});

test("redacts sensitive structured fields without caller-provided secrets", () => {
  const circular = { child: undefined };
  circular.child = circular;

  const line = formatStructuredLogLine("warn", "webhook rejected", {
    token: "live-secret-token",
    monobankToken: "live-monobank-token",
    webhookSecret: "live-webhook-secret",
    headers: {
      Authorization: "Bearer live-secret-token",
      "X-Token": "live-secret-token",
      accept: "application/json",
    },
    payloadJson: {
      account: "UA213223130000026007233566001",
    },
    amount: 1250n,
    failedAt: new Date("2026-05-17T05:00:00.000Z"),
    invalidDate: new Date("invalid"),
    error: new Error("Authorization: Bearer live-secret-token"),
    circular,
  });

  assert.doesNotMatch(line, /live-secret-token/);
  assert.doesNotMatch(line, /live-monobank-token/);
  assert.doesNotMatch(line, /live-webhook-secret/);
  assert.doesNotMatch(line, /UA213223130000026007233566001/);
  assert.match(line, /"token":"\[redacted\]"/);
  assert.match(line, /"monobankToken":"\[redacted\]"/);
  assert.match(line, /"webhookSecret":"\[redacted\]"/);
  assert.match(line, /"Authorization":"\[redacted\]"/);
  assert.match(line, /"X-Token":"\[redacted\]"/);
  assert.match(line, /"payloadJson":"\[redacted\]"/);
  assert.match(line, /"amount":"1250"/);
  assert.match(line, /"failedAt":"2026-05-17T05:00:00.000Z"/);
  assert.match(line, /"invalidDate":null/);
  assert.match(line, /"message":"Authorization: \[redacted\]"/);
  assert.match(line, /"child":"\[Circular\]"/);
});

test("logStructured emits to a custom logger and returns the logged line", () => {
  let loggedLine;

  const line = logStructured(
    "error",
    "sync failed",
    { code: "token_invalid", secret: "forbidden-token" },
    {
      secrets: ["forbidden-token"],
      logger: (value) => {
        loggedLine = value;
      },
    },
  );

  assert.equal(line, loggedLine);
  assert.match(line, /^\[ERROR\] sync failed/);
  assert.doesNotMatch(line, /forbidden-token/);
});
