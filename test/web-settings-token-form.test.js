import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Settings token form exposes profile username markup for password managers", async () => {
  const settingsRouteSource = await readFile(
    "src/web/routes/settings/index.tsx",
    "utf8",
  );

  assert.match(settingsRouteSource, /data-testid="settings-token-form"/);
  assert.match(settingsRouteSource, /id="monobank-token-profile"/);
  assert.match(settingsRouteSource, /name="username"/);
  assert.match(settingsRouteSource, /autoComplete="username"/);
  assert.match(settingsRouteSource, /value=\{activeProfile\}/);
  assert.match(settingsRouteSource, /id="monobank-token"/);
  assert.match(settingsRouteSource, /name="password"/);
  assert.match(settingsRouteSource, /autoComplete="current-password"/);
});
