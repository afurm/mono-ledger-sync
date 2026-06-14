import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "build-docs-toc.mjs");

function runScript(docsDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, docsDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("build-docs-toc.mjs prints markdown links for docs and skips release docs", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "docs-toc-"));
  const docsDir = path.join(tempRoot, "docs");

  try {
    await mkdir(path.join(docsDir, "decisions"), { recursive: true });
    await mkdir(path.join(docsDir, "release"), { recursive: true });
    await writeFile(path.join(docsDir, "local-first.md"), "# Local\n");
    await writeFile(
      path.join(docsDir, "decisions", "0001-product-scope.md"),
      "# Decision\n",
    );
    await writeFile(path.join(docsDir, "release", "0.2.0.md"), "# Release\n");

    const result = await runScript(docsDir);

    assert.equal(
      result.code,
      0,
      `expected exit 0, got ${result.code}\nstderr:\n${result.stderr}`,
    );

    const lines = result.stdout.trim().split("\n");

    assert.deepEqual(lines, [
      "- [0001 Product Scope](decisions/0001-product-scope.md)",
      "- [Local First](local-first.md)",
    ]);
    assert.ok(
      lines.every((line) => /^- \[[^\]]+\]\([^)]+\.md\)$/.test(line)),
      `expected well-formed Markdown links, got:\n${result.stdout}`,
    );
    assert.doesNotMatch(result.stdout, /release/);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});
