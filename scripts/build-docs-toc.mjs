#!/usr/bin/env node
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function* walk(dir) {
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      if (path.basename(full) === 'release') continue;
      yield* walk(full);
    } else if (full.endsWith(".md")) {
      yield full;
    }
  }
}

async function main() {
  const toc = [];
  for await (const file of walk('docs')) {
    const relative = path.relative('docs', file);
    const name = path.basename(file, '.md');
    toc.push(`- [${name}](${relative})`);
  }
  toc.sort();
  console.log(toc.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});