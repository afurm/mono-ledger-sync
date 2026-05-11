import assert from "node:assert/strict";
import { access, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../dist/cli/index.js";

async function withTempDataDir(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-cli-"));

  try {
    return await callback(tempRoot);
  } finally {
    await rm(tempRoot, {
      force: true,
      recursive: true,
    });
  }
}

test("runs init through the CLI boundary", async () => {
  const messages = [];
  const errors = [];
  const runtime = {};

  await runCli(
    ["node", "mono-ledger-sync", "init", "--source", "fixture"],
    {
      log: (message) => messages.push(message),
      error: (message) => errors.push(message),
    },
    runtime,
  );

  assert.deepEqual(errors, []);
  assert.equal(runtime.exitCode, undefined);
  assert.equal(JSON.parse(messages[0]).source, "fixture");
});

test("rejects unsupported sources through the CLI boundary", async () => {
  const errors = [];
  const runtime = {};

  await runCli(
    ["node", "mono-ledger-sync", "init", "--source", "other"],
    {
      log: () => undefined,
      error: (message) => errors.push(message),
    },
    runtime,
  );

  assert.deepEqual(errors, ["Unsupported source: other"]);
  assert.equal(runtime.exitCode, 1);
});

test("documents the local server command in help output", async () => {
  const messages = [];
  const runtime = {};

  await runCli(
    ["node", "mono-ledger-sync", "help"],
    {
      log: (message) => messages.push(message),
      error: () => undefined,
    },
    runtime,
  );

  assert.match(messages[0], /mono-ledger-sync serve/);
  assert.match(messages[0], /mono-ledger-sync ui/);
  assert.match(messages[0], /mono-ledger-sync doctor/);
  assert.match(messages[0], /mono-ledger-sync data path/);
  assert.match(messages[0], /mono-ledger-sync sync \[run\]/);
  assert.match(messages[0], /--slice seconds/);
  assert.match(messages[0], /--dry-run/);
  assert.match(messages[0], /mono-ledger-sync db restore --from path --yes/);
  assert.match(messages[0], /mono-ledger-sync db export/);
  assert.match(messages[0], /journal-csv/);
  assert.match(messages[0], /accountant-handoff/);
  assert.match(messages[0], /--port 3000/);
});

test("rejects invalid local server ports", async () => {
  const errors = [];
  const runtime = {};

  await runCli(
    ["node", "mono-ledger-sync", "serve", "--port", "nope"],
    {
      log: () => undefined,
      error: (message) => errors.push(message),
    },
    runtime,
  );

  assert.deepEqual(errors, ["Unsupported port: nope"]);
  assert.equal(runtime.exitCode, 1);
});

test("prints local data paths without creating hosted state", async () => {
  await withTempDataDir(async (tempRoot) => {
    const messages = [];
    const runtime = {};

    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "data",
        "path",
        "--profile",
        "demo",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => messages.push(message),
        error: () => undefined,
      },
      runtime,
    );

    const body = JSON.parse(messages[0]);

    assert.equal(runtime.exitCode, undefined);
    assert.equal(body.profile, "demo");
    assert.equal(body.dataDir, tempRoot);
    assert.equal(body.databasePath, path.join(tempRoot, "demo.sqlite"));
    assert.equal(body.localOnly, true);
  });
});

test("runs doctor against fixture mode without requiring a token", async () => {
  await withTempDataDir(async (tempRoot) => {
    const messages = [];
    const errors = [];
    const runtime = {};

    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "doctor",
        "--source",
        "fixture",
        "--account",
        "fixture-account-uah-main",
        "--from",
        "1775001600",
        "--to",
        "1777593599",
        "--slice",
        "1000000",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => messages.push(message),
        error: (message) => errors.push(message),
      },
      runtime,
    );

    const body = JSON.parse(messages[0]);

    assert.deepEqual(errors, []);
    assert.equal(runtime.exitCode, undefined);
    assert.equal(body.status, "ok");
    assert.equal(body.source, "fixture");
    assert.ok(
      body.checks.some(
        (check) =>
          check.name === "token" &&
          check.message === "Fixture mode does not require a Monobank token.",
      ),
    );
  });
});

test("reports fixture auth status and validates fixture auth without a token", async () => {
  const statusMessages = [];
  const testMessages = [];
  const runtime = {};

  await runCli(
    ["node", "mono-ledger-sync", "auth", "status", "--source", "fixture"],
    {
      log: (message) => statusMessages.push(message),
      error: () => undefined,
    },
    runtime,
  );
  await runCli(
    ["node", "mono-ledger-sync", "auth", "test", "--source", "fixture"],
    {
      log: (message) => testMessages.push(message),
      error: () => undefined,
    },
    runtime,
  );

  const statusBody = JSON.parse(statusMessages[0]);
  const testBody = JSON.parse(testMessages[0]);

  assert.equal(runtime.exitCode, undefined);
  assert.deepEqual(statusBody, {
    source: "fixture",
    tokenRequired: false,
    tokenPresent: false,
    tokenSource: "not-required",
  });
  assert.equal(testBody.ok, true);
  assert.equal(testBody.source, "fixture");
  assert.match(testBody.clientId, /\.\.\./);
  assert.equal(testBody.accounts.length, 2);
});

test("redacts sensitive text through the CLI logs helper", async () => {
  const messages = [];
  const runtime = {};

  await runCli(
    [
      "node",
      "mono-ledger-sync",
      "logs",
      "redact",
      "--text",
      "X-Token: secret-token UA213223130000026007233566001 4444333322221111",
    ],
    {
      log: (message) => messages.push(message),
      error: () => undefined,
    },
    runtime,
  );

  assert.equal(runtime.exitCode, undefined);
  assert.doesNotMatch(messages[0], /secret-token/);
  assert.doesNotMatch(messages[0], /UA213223130000026007233566001/);
  assert.doesNotMatch(messages[0], /4444333322221111/);
});

test("syncs and exports fixture ledger data through the CLI", async () => {
  await withTempDataDir(async (tempRoot) => {
    const syncMessages = [];
    const exportMessages = [];
    const csvMessages = [];
    const presetMessages = [];
    const runtime = {};

    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "sync",
        "run",
        "--source",
        "fixture",
        "--account",
        "fixture-account-uah-main",
        "--from",
        "1775001600",
        "--to",
        "1777593599",
        "--slice",
        "1000000",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => syncMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );
    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "export",
        "--format",
        "jsonl",
        "--account",
        "fixture-account-uah-main",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => exportMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );
    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "export",
        "--format",
        "csv",
        "--category",
        "groceries",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => csvMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );
    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "export",
        "--preset",
        "accountant-handoff",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => presetMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );

    const syncBody = JSON.parse(syncMessages[0]);
    const exportedRows = exportMessages[0]
      .split("\n")
      .filter(Boolean)
      .map((row) => JSON.parse(row));

    assert.equal(runtime.exitCode, undefined);
    assert.equal(syncBody.run.status, "success");
    assert.equal(syncBody.run.itemsSeen, 5);
    assert.equal(syncBody.accounts.length, 1);
    assert.equal(syncBody.accounts[0].accountId, "fixture-account-uah-main");
    assert.equal(exportedRows.length, 5);
    assert.ok(
      exportedRows.every((row) => row.accountId === "fixture-account-uah-main"),
    );
    assert.match(csvMessages[0], /^id,accountId,time,date,description/);
    assert.match(csvMessages[0], /fixture-stmt-2026-04-02-silpo/);
    assert.match(presetMessages[0], /^date,accountId,description,debit,credit/);
    assert.match(presetMessages[0], /Salary payment/);
  });
});

test("previews fixture sync through CLI dry-run without ledger writes", async () => {
  await withTempDataDir(async (tempRoot) => {
    const runtime = {};
    const syncMessages = [];
    const inspectMessages = [];

    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "sync",
        "run",
        "--source",
        "fixture",
        "--account",
        "fixture-account-uah-main",
        "--from",
        "1775001600",
        "--to",
        "1777593599",
        "--slice",
        "1000000",
        "--dry-run",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => syncMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );
    await runCli(
      ["node", "mono-ledger-sync", "db", "inspect", "--data-dir", tempRoot],
      {
        log: (message) => inspectMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );

    const syncBody = JSON.parse(syncMessages[0]);
    const inspectBody = JSON.parse(inspectMessages[0]);

    assert.equal(runtime.exitCode, undefined);
    assert.equal(syncBody.dryRun, true);
    assert.equal(syncBody.run.itemsSeen, 5);
    assert.equal(syncBody.stats.apiCalls, 5);
    assert.equal(syncBody.stats.windowsFetched, 3);
    assert.equal(inspectBody.accounts, 0);
    assert.equal(inspectBody.ledgerEntries, 0);
    assert.equal(inspectBody.syncRuns, 0);
  });
});

test("creates a timestamped local database backup", async () => {
  await withTempDataDir(async (tempRoot) => {
    const messages = [];
    const runtime = {};

    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "db",
        "backup",
        "--profile",
        "demo",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => messages.push(message),
        error: () => undefined,
      },
      runtime,
    );

    const body = JSON.parse(messages[0]);
    const backupStat = await stat(body.backupPath);

    assert.equal(runtime.exitCode, undefined);
    assert.equal(body.profile, "demo");
    assert.equal(body.databasePath, path.join(tempRoot, "demo.sqlite"));
    assert.match(body.backupPath, /backups\/demo-\d{4}-\d{2}-\d{2}T/);
    assert.equal(body.bytes, backupStat.size);
    assert.ok(backupStat.size > 0);
  });
});

test("inspects, compacts, and deletes local database files", async () => {
  await withTempDataDir(async (tempRoot) => {
    const runtime = {};
    const syncMessages = [];
    const inspectMessages = [];
    const compactMessages = [];
    const deleteMessages = [];
    const databasePath = path.join(tempRoot, "demo.sqlite");

    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "sync",
        "--source",
        "fixture",
        "--profile",
        "demo",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => syncMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );
    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "db",
        "inspect",
        "--profile",
        "demo",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => inspectMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );
    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "db",
        "compact",
        "--profile",
        "demo",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => compactMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );
    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "data",
        "delete",
        "--yes",
        "--profile",
        "demo",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => deleteMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );

    const inspectBody = JSON.parse(inspectMessages[0]);
    const compactBody = JSON.parse(compactMessages[0]);
    const deleteBody = JSON.parse(deleteMessages[0]);

    assert.equal(runtime.exitCode, undefined);
    assert.equal(JSON.parse(syncMessages[0]).run.status, "success");
    assert.equal(inspectBody.filePath, databasePath);
    assert.equal(inspectBody.integrityCheck, "ok");
    assert.deepEqual(inspectBody.migrations, ["0001_local_ledger"]);
    assert.equal(inspectBody.ledgerEntries, 7);
    assert.equal(compactBody.compacted, true);
    assert.deepEqual(deleteBody.removedPaths, [
      databasePath,
      `${databasePath}-wal`,
      `${databasePath}-shm`,
    ]);
    await assert.rejects(() => access(databasePath));
  });
});

test("exports and restores a full local SQLite database copy", async () => {
  await withTempDataDir(async (tempRoot) => {
    const runtime = {};
    const syncMessages = [];
    const exportMessages = [];
    const deleteMessages = [];
    const restoreMessages = [];
    const inspectMessages = [];
    const databasePath = path.join(tempRoot, "demo.sqlite");

    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "sync",
        "run",
        "--source",
        "fixture",
        "--profile",
        "demo",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => syncMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );
    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "db",
        "export",
        "--profile",
        "demo",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => exportMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );

    const exportBody = JSON.parse(exportMessages[0]);
    const exportStat = await stat(exportBody.exportPath);

    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "data",
        "delete",
        "--yes",
        "--profile",
        "demo",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => deleteMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );
    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "db",
        "restore",
        "--from",
        exportBody.exportPath,
        "--yes",
        "--profile",
        "demo",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => restoreMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );
    await runCli(
      [
        "node",
        "mono-ledger-sync",
        "db",
        "inspect",
        "--profile",
        "demo",
        "--data-dir",
        tempRoot,
      ],
      {
        log: (message) => inspectMessages.push(message),
        error: () => undefined,
      },
      runtime,
    );

    const restoreBody = JSON.parse(restoreMessages[0]);
    const inspectBody = JSON.parse(inspectMessages[0]);

    assert.equal(runtime.exitCode, undefined);
    assert.equal(JSON.parse(syncMessages[0]).run.status, "success");
    assert.equal(exportBody.databasePath, databasePath);
    assert.equal(exportBody.format, "sqlite");
    assert.equal(exportBody.containsSecrets, false);
    assert.equal(exportBody.bytes, exportStat.size);
    assert.equal(restoreBody.restored, true);
    assert.equal(restoreBody.databasePath, databasePath);
    assert.equal(restoreBody.sourcePath, exportBody.exportPath);
    assert.equal(inspectBody.ledgerEntries, 7);
    assert.equal(inspectBody.integrityCheck, "ok");
  });
});
