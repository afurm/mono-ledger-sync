import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "check-unsafe-logging.mjs");

function runScript(srcDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, srcDir], {
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

test("check-unsafe-logging.mjs passes on the current src/ tree", async () => {
  const result = await runScript(path.join(repoRoot, "src"));
  assert.equal(
    result.code,
    0,
    `expected exit 0 on clean src, got ${result.code}\nstderr:\n${result.stderr}`,
  );
});

test("check-unsafe-logging.mjs fails when a direct console.* call is introduced", async () => {
  const tempSrc = await mkdtemp(path.join(tmpdir(), "unsafe-logging-"));
  const goodFile = path.join(tempSrc, "good.ts");
  const badFile = path.join(tempSrc, "bad.ts");
  // Use a path that, when expressed relative to the repo root cwd, the
  // script will treat as allowed.
  const allowedRelative = path.relative(
    repoRoot,
    path.join(tempSrc, "logging", "index.ts"),
  );
  const allowedFile = path.join(tempSrc, "logging", "index.ts");

  try {
    await writeFile(goodFile, `export const ok = 1;\n`, "utf8");
    await writeFile(
      badFile,
      `export const leak = console.log("token: " + secret);\n`,
      "utf8",
    );
    await mkdir(path.dirname(allowedFile), { recursive: true });
    await writeFile(
      allowedFile,
      `const sink = console.log.bind(console);\nexport const x = sink;\n`,
      "utf8",
    );

    // The script defaults the allow-list to src/logging/index.ts. We need to
    // also allow the relative path of our temp file, which we resolve as
    // a path under the repo root using a custom directory layout.
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          scriptPath,
          tempSrc,
          "--allow",
          // Allow the default entry plus our temp allow-list entry.
          path.join("src", "logging", "index.ts"),
          "--allow",
          allowedRelative,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stderr }));
    });

    assert.notEqual(
      result.code,
      0,
      `expected non-zero exit when console.log is present, got ${result.code}\nstderr:\n${result.stderr}`,
    );
    assert.match(
      result.stderr,
      /Unsafe logging detected/,
      `stderr should announce the violation, got:\n${result.stderr}`,
    );
  } finally {
    await rm(tempSrc, { force: true, recursive: true });
  }
});
