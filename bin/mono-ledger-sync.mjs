#!/usr/bin/env node
// CLI entrypoint for `mono-ledger-sync`.
//
// Starts the local API server (and, on `npm run web:vite` style flows,
// the bundled UI) using the same env-var contract as `src/server/dev.ts`.
// Reads MONO_LEDGER_SYNC_HOST / HOST, MONO_LEDGER_SYNC_PORT / PORT,
// MONO_LEDGER_SYNC_SOURCE, MONO_LEDGER_SYNC_PROFILE,
// MONO_LEDGER_SYNC_DATA_DIR, MONOBANK_TOKEN, and
// MONO_LEDGER_SYNC_ACCESS_PASSCODE. See `README.md` for the full contract.
//
// This file is plain JavaScript so `package.json#bin` can point at it
// without a separate build step. The `npm run dev` script remains the
// contributor workflow; this file is the public install path.

import process from "node:process";

const SHORT_HELP_FLAGS = new Set(["-h", "--help"]);
const ENVVAR_DOCS = [
  [
    "MONO_LEDGER_SYNC_HOST",
    "Bind address for the local API (default 127.0.0.1).",
  ],
  ["MONO_LEDGER_SYNC_PORT", "Bind port for the local API (default 3000)."],
  ["PORT", "Alias for MONO_LEDGER_SYNC_PORT."],
  ["MONO_LEDGER_SYNC_SOURCE", "Ledger source: 'fixture' or 'monobank'."],
  [
    "MONO_LEDGER_SYNC_PROFILE",
    "Profile name to scope the local SQLite + secrets.",
  ],
  ["MONO_LEDGER_SYNC_DATA_DIR", "Override the local data directory."],
  [
    "MONOBANK_TOKEN",
    "Personal Monobank API token (only used in monobank source).",
  ],
  [
    "MONO_LEDGER_SYNC_ACCESS_PASSCODE",
    "Optional passcode required to bind the local API to non-loopback hosts.",
  ],
];

function printHelp() {
  const lines = [
    "mono-ledger-sync — local-first Monobank personal finance ledger",
    "",
    "Usage:",
    "  mono-ledger-sync                 start the local API server and bind 127.0.0.1:3000",
    "  mono-ledger-sync --help          print this help and exit",
    "",
    "Environment variables:",
  ];
  for (const [name, description] of ENVVAR_DOCS) {
    lines.push(`  ${name.padEnd(36)} ${description}`);
  }
  lines.push("");
  lines.push(
    "After the server starts, the local UI is available at the URL printed",
  );
  lines.push(
    "on stdout. Open it in a browser to manage the ledger, sync Monobank,",
  );
  lines.push("and export data.");
  process.stdout.write(`${lines.join("\n")}\n`);
}

if (SHORT_HELP_FLAGS.has(process.argv[2] ?? "")) {
  printHelp();
  process.exit(0);
}

// Defer to the compiled dev entrypoint. It owns the env-var parsing,
// the createLocalApiServer wiring, the structured startup log, and the
// SIGINT / SIGTERM shutdown handlers. The CLI is a thin, stable bin
// surface that does not duplicate that logic.
//
// We resolve relative to this file so the bin works whether the package
// is installed globally, via npx, or from a local checkout.
const devModuleUrl = new URL("../dist/server/dev.js", import.meta.url);

await import(devModuleUrl);
