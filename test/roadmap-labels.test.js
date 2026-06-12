import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

// These tests talk to the live repository through the `gh` CLI. They need a
// GitHub token in the GH_TOKEN env var (CI passes one in; locally the test
// relies on the user's `gh` auth having populated the same variable). When no
// token is available the tests are skipped — the assertions are not the
// authoritative source of truth, the script in CI is.

function hasGhAuth() {
  return Boolean(process.env.GH_TOKEN) || Boolean(process.env.GITHUB_TOKEN);
}

function ghOrThrow(args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").toString();
    throw new Error(`gh ${args[0]} failed: ${stderr}`);
  }
  return result.stdout;
}

test("roadmap labels exist on the repository", { skip: !hasGhAuth() }, async () => {
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

test(
  "three good-first-issue starter issues exist with the right label",
  { skip: !hasGhAuth() },
  async () => {
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
  },
);
