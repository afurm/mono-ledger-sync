import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

// These tests require a GitHub token. In CI on this repo the workflow passes
// GH_TOKEN to `npm test`; locally the test relies on the user's `gh` auth.
// In environments where auth is missing, the gh calls fail with a clear
// stderr message and the assertions below report it.

function ghOrThrow(args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").toString();
    throw new Error(`gh ${args[0]} failed: ${stderr}`);
  }
  return result.stdout;
}

test("roadmap labels exist on the repository", async () => {
  // The script that creates these labels runs in CI on push; this test
  // asserts the labels actually exist by reading the live label list.
  const stdout = ghOrThrow(["label", "list", "--limit", "200", "--json", "name"]);
  const labels = JSON.parse(stdout);
  const names = new Set(labels.map((label) => label.name));

  for (const required of [
    "area:ui",
    "area:server",
    "area:storage",
    "provider",
    "acquiring",
    "blocked",
    "wontfix-proper",
    "roadmap",
    "milestone-10",
    "milestone-16",
  ]) {
    assert.ok(names.has(required), `expected label ${required} to exist on the repository`);
  }
});

test("three good-first-issue starter issues exist with the right label", async () => {
  const stdout = ghOrThrow([
    "issue",
    "list",
    "--state",
    "open",
    "--label",
    "good first issue",
    "--limit",
    "50",
    "--json",
    "number,title,labels",
  ]);
  const issues = JSON.parse(stdout);
  const titles = issues.map((issue) => issue.title);

  for (const expectedTitle of [
    /editorconfig formatting drift test/i,
    /PRODUCTION_TASKS progress/i,
    /docs TOC generator/i,
  ]) {
    assert.ok(
      titles.some((title) => expectedTitle.test(title)),
      `expected to find a starter issue matching ${expectedTitle}; got titles: ${JSON.stringify(titles)}`,
    );
  }
});
