#!/usr/bin/env node
// Static check: fail if direct console.* logging calls appear in src/
// outside an allow-list of files. The structured logger
// (src/logging/index.ts) is the only file allowed to use console.* as
// default sinks, because every other file in the project should go
// through it so sensitive fields are redacted.
//
// Usage:
//   node scripts/check-unsafe-logging.mjs [srcDir] [--allow <relative-path> ...]
//
// Exits 0 on success, 1 on any violation.

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_ALLOW = new Set([path.join("src", "logging", "index.ts")]);

const PATTERN = /console\.(log|info|warn|error|debug)\s*\(/;

function parseArgs(argv) {
  const out = { srcDir: null, allow: new Set(DEFAULT_ALLOW) };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--allow") {
      const value = argv[i + 1];
      if (value === undefined) {
        process.stderr.write("--allow requires a path argument\n");
        process.exit(2);
      }
      out.allow.add(value);
      i += 1;
    } else if (!out.srcDir) {
      out.srcDir = arg;
    } else {
      process.stderr.write(`Unexpected argument: ${arg}\n`);
      process.exit(2);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const srcDir = path.resolve(args.srcDir ?? "src");

async function* walk(dir) {
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      yield* walk(full);
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      yield full;
    }
  }
}

const violations = [];

for await (const file of walk(srcDir)) {
  const relative = path.relative(process.cwd(), file);
  if (args.allow.has(relative)) continue;
  const text = await readFile(file, "utf8");
  if (PATTERN.test(text)) {
    violations.push(relative);
  }
}

if (violations.length > 0) {
  process.stderr.write(
    `Unsafe logging detected in ${violations.length} file(s):\n`,
  );
  for (const v of violations) {
    process.stderr.write(`  - ${v}\n`);
  }
  process.stderr.write(
    `\nUse the structured logger from src/logging/index.ts so sensitive fields are redacted.\n`,
  );
  process.exit(1);
}

process.exit(0);
