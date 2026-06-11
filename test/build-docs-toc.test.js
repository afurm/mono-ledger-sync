import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { test } from "tap";

test('build-docs-toc', async (t) => {
  const tempDir = path.join(tmpdir(), 'mono-ledger-sync-test');
  await mkdir(tempDir);
  try {
    const docsDir = path.join(tempDir, 'docs');
    await mkdir(docsDir);
    await writeFile(path.join(docsDir, 'file1.md'), 'content1');
    await writeFile(path.join(docsDir, 'file2.md'), 'content2');
    const releaseDir = path.join(docsDir, 'release');
    await mkdir(releaseDir);
    await writeFile(path.join(releaseDir, 'file3.md'), 'content3');

    const child = spawn('node', [path.join(__dirname, '..', 'scripts', 'build-docs-toc.mjs')], {
      cwd: tempDir,
      encoding: 'utf8',
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
    });

    await new Promise((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Child process exited with code ${code}`));
        }
      });
    });

    t.match(output, /^- \[file1\]\(file1\.md\)\n- \[file2\]\(file2\.md\)\n$/);
  } finally {
    await rm(tempDir, { recursive: true });
  }
});