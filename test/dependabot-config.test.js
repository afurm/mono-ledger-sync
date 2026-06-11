import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const dependabotPath = path.join(repoRoot, ".github", "dependabot.yml");

test(".github/dependabot.yml declares npm + github-actions ecosystems with a weekly schedule and labels", async () => {
  const text = await readFile(dependabotPath, "utf8");

  // 1. The file is a v2 Dependabot config.
  assert.match(
    text,
    /^version:\s*2\s*$/m,
    "dependabot.yml should declare `version: 2` at the top",
  );

  // 2. Both ecosystems are configured.
  assert.match(
    text,
    /package-ecosystem:\s*"npm"/,
    "dependabot.yml should configure the npm ecosystem",
  );
  assert.match(
    text,
    /package-ecosystem:\s*"github-actions"/,
    "dependabot.yml should configure the github-actions ecosystem",
  );

  // 3. Both ecosystems are on a weekly schedule.
  const weeklyMatches = text.match(/interval:\s*"weekly"/g) ?? [];
  assert.ok(
    weeklyMatches.length >= 2,
    `expected at least 2 weekly schedules (npm + github-actions), found ${weeklyMatches.length}`,
  );

  // 4. Both ecosystems apply the right labels.
  assert.ok(
    /labels:\s*\n\s*-\s*"dependencies"/m.test(text),
    "dependabot.yml should apply a `dependencies` label to dependency PRs",
  );
  assert.ok(
    /labels:\s*\n\s*-\s*"ci"/m.test(text),
    "dependabot.yml should apply a `ci` label to GitHub Actions PRs",
  );

  // 5. Groups exist so minor/patch updates collapse into one PR.
  assert.match(
    text,
    /update-types:\s*\n\s*-\s*"minor"\s*\n\s*-\s*"patch"/m,
    "dependabot.yml should group minor and patch updates together",
  );
});
