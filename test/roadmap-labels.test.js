import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = import.meta.dirname.replace(/\/test$/, "");

test("roadmap labels exist on the repository", async () => {
  // The script that creates these labels runs in CI on push; this test
  // asserts the labels actually exist by reading the live label list.
  const result = spawnSync(
    "gh",
    ["label", "list", "--limit", "200", "--json", "name"],
    {
      encoding: "utf8",
    },
  );

  assert.equal(
    result.status,
    0,
    `gh label list failed: ${result.stderr?.toString() ?? "unknown error"}`,
  );

  const labels = JSON.parse(result.stdout);
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
    assert.ok(
      names.has(required),
      `expected label ${required} to exist on the repository`,
    );
  }
});

test("three good-first-issue starter issues exist with the right label", async () => {
  const result = spawnSync(
    "gh",
    [
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
    ],
    { encoding: "utf8" },
  );

  assert.equal(
    result.status,
    0,
    `gh issue list failed: ${result.stderr?.toString() ?? "unknown error"}`,
  );

  const issues = JSON.parse(result.stdout);
  const titles = issues.map((issue) => issue.title);

  // The three starter issues opened in the roadmap-labels PR.
  for (const expectedTitle of [
    /editorconfig formatting drift test/i,
    /PRODUCTION_TASKS progress/i,
    /docs TOC generator/i,
  ]) {
    assert.ok(
      titles.some((title) => expectedTitle.test(title)),
      `expected to find a starter issue matching ${expectedTitle}; got titles: ${JSON.stringify(
        titles,
      )}`,
    );
  }
});

test("seed-labels.sh is idempotent (passes when labels already exist)", async () => {
  const result = spawnSync("bash", ["scripts/seed-labels.sh"], {
    encoding: "utf8",
    cwd: repoRoot,
  });

  assert.equal(
    result.status,
    0,
    `seed-labels.sh should exit 0 on a re-run; got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
});
