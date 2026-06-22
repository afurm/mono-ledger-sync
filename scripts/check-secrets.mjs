#!/usr/bin/env node
// Static check: fail if repository files contain high-confidence secrets
// or if sensitive local artifact types are tracked by mistake.

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ALLOWED_TRACKED_FILES = new Set([".env.example"]);

const SENSITIVE_FILE_PATTERNS = [
  {
    name: "environment file",
    pattern: /(^|\/)\.env(\.|$)/,
  },
  {
    name: "private key or certificate material",
    pattern:
      /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519|.+\.(pem|p12|pfx|key))$/i,
  },
  {
    name: "local database file",
    pattern: /(^|\/).+\.(sqlite|sqlite3|db|db-shm|db-wal)$/i,
  },
  {
    name: "local financial export",
    pattern: /(^|\/).+\.(parquet|csv|jsonl|ndjson)$/i,
  },
  {
    name: "local backup or archive",
    pattern: /(^|\/).+\.(backup|dump|tgz|tar|tar\.gz|zip|7z)$/i,
  },
];

const CONTENT_RULES = [
  {
    name: "private key block",
    pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    name: "AWS access key id",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    name: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    name: "GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36,}\b/g,
  },
  {
    name: "GitHub fine-grained token",
    pattern: /\bgithub_pat_[0-9A-Za-z_]{80,}\b/g,
  },
  {
    name: "Slack token",
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g,
  },
  {
    name: "npm token",
    pattern: /\bnpm_[0-9A-Za-z]{36,}\b/g,
  },
  {
    name: "secret key token",
    pattern: /\bsk-[0-9A-Za-z_-]{20,}\b/g,
  },
  {
    name: "authorization bearer token",
    pattern: /\bBearer\s+[0-9A-Za-z._~+/=-]{24,}\b/g,
  },
  {
    name: "credentialed service URL",
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^/\s:@]+:[^@\s]+@/gi,
  },
  {
    name: "named token assignment",
    pattern:
      /\b(?:MONOBANK_TOKEN|API_TOKEN|ACCESS_TOKEN|REFRESH_TOKEN|CLIENT_SECRET|PRIVATE_KEY)\b\s*[:=]\s*["']?[0-9A-Za-z._~+/=-]{24,}/g,
  },
];

function parseArgs(argv) {
  const args = { staged: false };

  for (const arg of argv) {
    if (arg === "--staged") {
      args.staged = true;
    } else {
      process.stderr.write(`Unexpected argument: ${arg}\n`);
      process.exit(2);
    }
  }

  return args;
}

async function listFiles({ staged }) {
  if (staged) {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"],
      {
        encoding: "buffer",
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    return stdout.toString("utf8").split("\0").filter(Boolean).sort();
  }

  const [tracked, untracked] = await Promise.all([
    execFileAsync("git", ["ls-files", "-z"], {
      encoding: "buffer",
      maxBuffer: 10 * 1024 * 1024,
    }),
    execFileAsync("git", ["ls-files", "-o", "--exclude-standard", "-z"], {
      encoding: "buffer",
      maxBuffer: 10 * 1024 * 1024,
    }),
  ]);

  const files = `${tracked.stdout.toString("utf8")}\0${untracked.stdout.toString(
    "utf8",
  )}`;

  return [...new Set(files.split("\0").filter(Boolean))].sort();
}

function lineNumberForIndex(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

function isBinary(buffer) {
  return buffer.includes(0);
}

function checkFileName(file) {
  if (ALLOWED_TRACKED_FILES.has(file)) return [];

  return SENSITIVE_FILE_PATTERNS.filter(({ pattern }) =>
    pattern.test(file),
  ).map(({ name }) => ({
    file,
    line: null,
    rule: name,
  }));
}

function checkContent(file, text) {
  const violations = [];

  for (const rule of CONTENT_RULES) {
    rule.pattern.lastIndex = 0;

    for (const match of text.matchAll(rule.pattern)) {
      violations.push({
        file,
        line: lineNumberForIndex(text, match.index ?? 0),
        rule: rule.name,
      });
    }
  }

  return violations;
}

async function readFileForScan(file) {
  try {
    return await readFile(path.resolve(file));
  } catch (error) {
    if (error?.code === "ENOENT") {
      process.stderr.write(`Skipped missing file from git listing: ${file}\n`);
      return null;
    }

    throw error;
  }
}

async function scanFile(file) {
  const fileViolations = checkFileName(file);
  const buffer = await readFileForScan(file);
  if (buffer === null || isBinary(buffer)) {
    return fileViolations;
  }

  return [...fileViolations, ...checkContent(file, buffer.toString("utf8"))];
}

async function scanFiles(files) {
  const violations = [];

  for (const file of files) {
    violations.push(...(await scanFile(file)));
  }

  return violations;
}

const args = parseArgs(process.argv.slice(2));
const files = await listFiles(args);
const violations = await scanFiles(files);

if (violations.length > 0) {
  process.stderr.write(
    `Potential sensitive repository content detected in ${violations.length} location(s):\n`,
  );

  for (const violation of violations) {
    const location =
      violation.line === null
        ? violation.file
        : `${violation.file}:${violation.line}`;
    process.stderr.write(`  - ${location} (${violation.rule})\n`);
  }

  process.stderr.write(
    "\nRemove the sensitive value or artifact, then rerun this check.\n",
  );
  process.exit(1);
}

process.exit(0);
