import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const processPath = path.join(repoRoot, "docs", "security-advisory-process.md");
const securityPath = path.join(repoRoot, "SECURITY.md");

const REQUIRED_HEADINGS = [
  "## Supported versions",
  "## Reporting a vulnerability",
  "## Embargo and coordinated disclosure",
  "## Response and disclosure timeline",
  "## Credit and recognition",
];

test("docs/security-advisory-process.md exists and has the five required sections", async () => {
  const text = await readFile(processPath, "utf8");

  for (const heading of REQUIRED_HEADINGS) {
    assert.ok(
      text.includes(heading),
      `security-advisory-process.md must contain heading: ${heading}`,
    );
  }
});

test("docs/security-advisory-process.md references the GitHub Security Advisories URL", async () => {
  const text = await readFile(processPath, "utf8");

  assert.match(
    text,
    /github\.com\/[^\/]+\/[^\/]+\/security\/advisories/,
    "security-advisory-process.md must reference the GitHub Security Advisories URL",
  );
});

test("docs/security-advisory-process.md has a 90-day default embargo window", async () => {
  const text = await readFile(processPath, "utf8");
  assert.match(
    text,
    /90\s*day/i,
    "security-advisory-process.md must call out the 90-day default embargo",
  );
});

test("SECURITY.md links to the new advisory process document", async () => {
  const security = await readFile(securityPath, "utf8");
  assert.match(
    security,
    /security-advisory-process\.md/,
    "SECURITY.md should link to docs/security-advisory-process.md",
  );
});
