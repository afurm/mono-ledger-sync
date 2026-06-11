import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const threatModelPath = path.join(repoRoot, "docs", "threat-model.md");
const securityPath = path.join(repoRoot, "SECURITY.md");
const readmePath = path.join(repoRoot, "README.md");

const REQUIRED_HEADINGS = [
  "## 1. Local token theft",
  "## 2. Database leakage",
  "## 3. Malicious webhook traffic",
  "## 4. Dependency compromise",
  "## 5. Accidental support data exposure",
];

// Codebase pointers the threat model is expected to cite so the document and
// the actual code stay in sync. If any of these change path, the test forces
// an update to the doc.
const REQUIRED_CODE_POINTERS = [
  "src/security/index.ts",
  "src/privacy/index.ts",
  "src/logging/index.ts",
  "src/server/diagnostics.ts",
  "scripts/check-unsafe-logging.mjs",
];

test("docs/threat-model.md exists and has the five required threat categories", async () => {
  const text = await readFile(threatModelPath, "utf8");

  for (const heading of REQUIRED_HEADINGS) {
    assert.ok(
      text.includes(heading),
      `threat model must contain heading: ${heading}`,
    );
  }
});

test("docs/threat-model.md cites the active mitigations in the codebase", async () => {
  const text = await readFile(threatModelPath, "utf8");

  for (const pointer of REQUIRED_CODE_POINTERS) {
    assert.ok(
      text.includes(pointer),
      `threat model must reference ${pointer} so the doc and code stay linked`,
    );
  }
});

test("SECURITY.md and README.md link to the threat model", async () => {
  const security = await readFile(securityPath, "utf8");
  const readme = await readFile(readmePath, "utf8");

  assert.match(
    security,
    /docs\/threat-model\.md/,
    "SECURITY.md should link to docs/threat-model.md",
  );
  assert.match(
    readme,
    /docs\/threat-model\.md/,
    "README.md should link to docs/threat-model.md",
  );
});
