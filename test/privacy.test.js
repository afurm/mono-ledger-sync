import assert from "node:assert/strict";
import test from "node:test";

import { maskIdentifier, redactSensitiveText } from "../dist/privacy/index.js";

test("redacts tokens, headers, account identifiers, and raw payload fields", () => {
  const redacted = redactSensitiveText(
    [
      "X-Token: live-secret-token",
      "Authorization: Bearer live-secret-token",
      "iban UA213223130000026007233566001",
      "card 4444333322221111",
      '{"counterName":"Private Person","counterIban":"UA213223130000026007233566001","payloadJson":{"amount":100}}',
    ].join("\n"),
    {
      secrets: ["live-secret-token"],
    },
  );

  assert.doesNotMatch(redacted, /live-secret-token/);
  assert.doesNotMatch(redacted, /UA213223130000026007233566001/);
  assert.doesNotMatch(redacted, /4444333322221111/);
  assert.doesNotMatch(redacted, /Private Person/);
  assert.match(redacted, /X-Token: \[redacted\]/);
  assert.match(redacted, /Authorization: \[redacted\]/);
});

test("masks stable identifiers without exposing full values", () => {
  assert.equal(maskIdentifier("fixture-client-primary"), "fixt...mary");
  assert.equal(maskIdentifier("short"), "*****");
});
