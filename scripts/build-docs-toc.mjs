#!/usr/bin/env node
// Print a Markdown table of contents for docs/ files.
//
// Usage:
//   node scripts/build-docs-toc.mjs [docsDir]

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const docsDir = path.resolve(process.argv[2] ?? "docs");
const ignoredDirs = new Set(["release"]);

function titleFromFile(filePath) {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function* walk(dir) {
  for (const entry of await readdir(dir)) {
    if (ignoredDirs.has(entry)) {
      continue;
    }

    const full = path.join(dir, entry);
    const info = await stat(full);

    if (info.isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith(".md")) {
      yield full;
    }
  }
}

const files = [];

for await (const file of walk(docsDir)) {
  files.push(file);
}

files.sort((a, b) =>
  path.relative(docsDir, a).localeCompare(path.relative(docsDir, b)),
);

for (const file of files) {
  const relative = path.relative(docsDir, file).split(path.sep).join("/");
  process.stdout.write(`- [${titleFromFile(relative)}](${relative})\n`);
}
