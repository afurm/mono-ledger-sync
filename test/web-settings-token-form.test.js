import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Settings token form exposes profile username markup for password managers", async () => {
  const appSource = await readFile("src/web/App.tsx", "utf8");

  assert.match(appSource, /data-testid="settings-token-form"/);
  assert.match(appSource, /id="monobank-token-profile"/);
  assert.match(appSource, /name="username"/);
  assert.match(appSource, /autoComplete="username"/);
  assert.match(appSource, /value=\{activeProfile\}/);
  assert.match(appSource, /id="monobank-token"/);
  assert.match(appSource, /name="password"/);
  assert.match(appSource, /autoComplete="current-password"/);
});
