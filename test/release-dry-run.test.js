import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const releasePath = path.join(repoRoot, ".github", "workflows", "release.yml");

test("release workflow runs npm publish --dry-run before the real npm publish", async () => {
  const text = await readFile(releasePath, "utf8");

  const dryRunMatch = text.match(/npm publish --dry-run/);
  assert.ok(
    dryRunMatch !== null,
    "release.yml must contain an `npm publish --dry-run` step",
  );

  const realPublishMatch = text.match(/^\s*-\s*run:\s*npm publish\s*$/m);
  assert.ok(
    realPublishMatch !== null,
    "release.yml must still contain a real `npm publish` step",
  );

  const dryRunOffset = text.indexOf("npm publish --dry-run");
  const realPublishOffset = text.indexOf(realPublishMatch[0]);
  assert.ok(
    dryRunOffset < realPublishOffset,
    "`npm publish --dry-run` must appear BEFORE `npm publish` in release.yml",
  );
});
