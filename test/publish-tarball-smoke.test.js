import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const workflowPath = path.join(
  repoRoot,
  ".github",
  "workflows",
  "publish-tarball-smoke.yml",
);

test("publish-tarball-smoke workflow packs the project, extracts the tarball, and runs a smoke script", async () => {
  const text = await readFile(workflowPath, "utf8");

  // 1. The workflow triggers on push to main and on pull_request.
  assert.match(
    text,
    /push:\s*\n\s*branches:\s*\n\s*-\s*main/,
    "workflow should trigger on push to main",
  );
  assert.match(
    text,
    /pull_request:/,
    "workflow should trigger on pull_request",
  );

  // 2. The workflow produces a tarball via npm pack.
  assert.match(
    text,
    /npm pack/,
    "workflow should run `npm pack` to produce the tarball",
  );

  // 3. The workflow extracts the tarball into a consumer directory.
  assert.match(
    text,
    /tar\s+-[A-Za-z]*x[A-Za-z]*f?/,
    "workflow should extract the tarball with tar -x*",
  );

  // 4. The workflow installs the tarball as a dependency in a fresh project.
  assert.match(
    text,
    /npm install/,
    "workflow should `npm install` the packed tarball into a fresh project",
  );

  // 5. The workflow runs a smoke script that exercises the public API.
  assert.match(
    text,
    /createSqliteLedgerDb/,
    "workflow smoke script should import the public API surface",
  );
  assert.match(
    text,
    /packed-tarball smoke passed/,
    "workflow smoke script should print a clear success line",
  );
});
