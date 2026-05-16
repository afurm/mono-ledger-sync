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
