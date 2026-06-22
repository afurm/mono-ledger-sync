import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const guidePath = path.join(repoRoot, "docs", "database-encryption.md");
const localFirstPath = path.join(repoRoot, "docs", "local-first.md");
const threatModelPath = path.join(repoRoot, "docs", "threat-model.md");

const REQUIRED_HEADINGS = ["## macOS", "## Linux", "## Windows"];

test("docs/database-encryption.md exists and has the three OS sections", async () => {
  const text = await readFile(guidePath, "utf8");

  for (const heading of REQUIRED_HEADINGS) {
    assert.ok(
      text.includes(heading),
      `database-encryption.md must contain heading: ${heading}`,
    );
  }
});

test("docs/database-encryption.md names the env-var override and the diagnostics verification step", async () => {
  const text = await readFile(guidePath, "utf8");

  assert.ok(
    text.includes("MONO_LEDGER_SYNC_DATA_DIR"),
    "database-encryption.md must mention the MONO_LEDGER_SYNC_DATA_DIR env-var override",
  );
  assert.ok(
    text.includes("/api/app/diagnostics"),
    "database-encryption.md must reference /api/app/diagnostics as the verification step",
  );
  assert.ok(
    text.includes("filePath"),
    "database-encryption.md must mention the diagnostics filePath field the user checks",
  );
});

test("docs/local-first.md and docs/threat-model.md link to the new guide", async () => {
  const localFirst = await readFile(localFirstPath, "utf8");
  const threatModel = await readFile(threatModelPath, "utf8");

  assert.match(
    localFirst,
    /database-encryption\.md/,
    "docs/local-first.md should link to docs/database-encryption.md",
  );
  assert.match(
    threatModel,
    /database-encryption\.md/,
    "docs/threat-model.md should link to docs/database-encryption.md",
  );
});
