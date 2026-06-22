import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MonobankValidationError,
  assertMonobankClientInfo,
  assertMonobankCurrencyRates,
  assertMonobankErrorResponse,
  assertMonobankPersonalWebhookEvent,
  assertMonobankStatementItems,
  bundledMonobankFixturesDir,
  createBundledFixtureMonobankAdapter,
  createFixtureMonobankAdapter,
  createMonobankHttpAdapter,
  loadMonobankFixtureSet,
} from "../dist/monobank/index.js";
import { createLedgerExport } from "../dist/exports/index.js";
import { createSqliteLedgerDb } from "../dist/sqlite/index.js";
import { createLedgerQueryService } from "../dist/storage/index.js";
import { syncLedgerWithMonobank } from "../dist/sync/index.js";
import {
  createMonobankMockHttpHandler,
  createMonobankMockServer,
  withMockMonobankServer,
} from "./monobank-mock-server.js";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixturesDir = path.join(repoRoot, "fixtures", "monobank");

const fixtureFiles = [
  "client-info.json",
  "currency-rates.json",
  "statements/uah-main-2026-04.json",
  "statements/uah-main-2026-04-large.json",
  "statements/eur-savings-2026-04.json",
  "statements/empty.json",
  "webhooks/statement-item.json",
  "errors/invalid-token.json",
  "errors/rate-limit.json",
  "errors/server-error.json",
];

const personalNameCheckedKeys = new Set(["name", "counterName"]);
const personalNamePattern =
  /\b(?:[A-ZА-ЯІЇЄҐ][a-zа-яіїєґ']{2,})(?:\s+(?:[A-ZА-ЯІЇЄҐ][a-zа-яіїєґ']{2,})){1,2}\b/g;
const nonPersonNameTokens = new Set([
  "fixture",
  "synthetic",
  "demo",
  "employer",
  "grocery",
  "coffee",
  "metro",
  "user",
  "client",
  "account",
  "vendor",
  "profile",
  "bank",
  "monobank",
]);
const organizationSuffixes =
  /\b(?:llc|inc|ltd|gmbh|plc|corp|corporation|co|co\.)\b/i;

function containsPersonalName(value) {
  const candidates = value.match(personalNamePattern);

  if (candidates === null) {
    return false;
  }

  return candidates.some((candidate) => {
    if (organizationSuffixes.test(candidate)) {
      return false;
    }

    return candidate
      .split(/\s+/)
      .every((token) => !nonPersonNameTokens.has(token.toLowerCase()));
  });
}

function collectPersonalNameViolations(value, path, violations) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectPersonalNameViolations(item, `${path}[${index}]`, violations);
    });
    return;
  }

  if (typeof value === "object" && value !== null) {
    Object.entries(value).forEach(([key, nested]) => {
      const nextPath = path ? `${path}.${key}` : key;

      if (typeof nested === "string" && personalNameCheckedKeys.has(key)) {
        if (containsPersonalName(nested)) {
          violations.push({ path: nextPath, value: nested });
        }
      }

      collectPersonalNameViolations(nested, nextPath, violations);
    });
  }
}

async function readFixture(relativePath) {
  const text = await readFile(path.join(fixturesDir, relativePath), "utf8");

  return JSON.parse(text);
}

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-db-"));

  try {
    return await callback({
      tempRoot,
      databasePath: path.join(tempRoot, "ledger.sqlite"),
    });
  } finally {
    await rm(tempRoot, {
      force: true,
      recursive: true,
    });
  }
}

function sumAmounts(rows) {
  return rows.reduce((total, row) => total + row.amount, 0);
}

async function readAllEntries(queryService, query) {
  const pageLimit = 500;
  const all = [];
  let offset = 0;

  while (true) {
    const page = await queryService.listLedgerEntries({
      ...query,
      limit: pageLimit,
      offset,
    });

    all.push(...page.entries);

    if (page.entries.length === 0 || all.length >= page.total) {
      break;
    }

    offset += page.entries.length;
  }

  return all;
}

test("fixtures stay synthetic and avoid real-looking sensitive values", async () => {
  for (const fixtureFile of fixtureFiles) {
    const text = await readFile(path.join(fixturesDir, fixtureFile), "utf8");
    const payload = JSON.parse(text);
    const violations = [];

    assert.doesNotMatch(
      text,
      /UA\d{27}/,
      `${fixtureFile} must not contain a real-looking Ukrainian IBAN`,
    );
    assert.doesNotMatch(
      text,
      /\b(?:\d[ -]?){13,19}\b/,
      `${fixtureFile} must not contain a full card number`,
    );
    assert.doesNotMatch(
      text,
      /u3AulkpZFI1lIuGsik6vuPsVWqN7GoWs6o_MO2sdf301/,
      `${fixtureFile} must not contain the API docs sample token`,
    );

    collectPersonalNameViolations(payload, "", violations);
    assert.equal(
      violations.length,
      0,
      `${fixtureFile} must not contain obvious personal-name strings in sensitive fields`,
    );
  }
});

test("fixture files cover the personal Monobank API shapes", async () => {
  const clientInfo = await readFixture("client-info.json");
  const currencyRates = await readFixture("currency-rates.json");
  const uahStatement = await readFixture("statements/uah-main-2026-04.json");
  const eurStatement = await readFixture("statements/eur-savings-2026-04.json");
  const emptyStatement = await readFixture("statements/empty.json");
  const webhookEvent = await readFixture("webhooks/statement-item.json");
  const invalidToken = await readFixture("errors/invalid-token.json");
  const rateLimit = await readFixture("errors/rate-limit.json");
  const serverError = await readFixture("errors/server-error.json");

  assertMonobankClientInfo(clientInfo, "fixtures/client-info.json");
  assertMonobankCurrencyRates(currencyRates, "fixtures/currency-rates.json");
  assertMonobankStatementItems(
    uahStatement,
    "fixtures/statements/uah-main-2026-04.json",
  );
  assertMonobankStatementItems(
    eurStatement,
    "fixtures/statements/eur-savings-2026-04.json",
  );
  assertMonobankStatementItems(
    emptyStatement,
    "fixtures/statements/empty.json",
  );
  assertMonobankPersonalWebhookEvent(
    webhookEvent,
    "fixtures/webhooks/statement-item.json",
  );
  assertMonobankErrorResponse(
    invalidToken,
    "fixtures/errors/invalid-token.json",
  );
  assertMonobankErrorResponse(rateLimit, "fixtures/errors/rate-limit.json");
  assertMonobankErrorResponse(serverError, "fixtures/errors/server-error.json");

  assert.equal(clientInfo.clientId, "fixture-client-primary");
  assert.equal(clientInfo.accounts.length, 2);
  assert.ok(
    clientInfo.accounts.every((account) =>
      account.id.startsWith("fixture-account-"),
    ),
  );
  assert.equal(clientInfo.jars[0].id, "fixture-jar-emergency-fund");

  assert.equal(currencyRates.length, 3);
  assert.ok(currencyRates.some((rate) => rate.currencyCodeA === 840));
  assert.ok(currencyRates.some((rate) => rate.currencyCodeA === 978));

  assert.ok(uahStatement.some((item) => item.amount > 0));
  assert.ok(uahStatement.some((item) => item.amount < 0));
  assert.ok(uahStatement.some((item) => item.hold));
  assert.ok(uahStatement.some((item) => item.currencyCode === 840));
  assert.ok(eurStatement.every((item) => item.currencyCode === 978));
  assert.deepEqual(emptyStatement, []);

  assert.equal(webhookEvent.type, "StatementItem");
  assert.equal(webhookEvent.data.account, "fixture-account-uah-main");
  assert.ok(webhookEvent.data.statementItem.id.startsWith("fixture-webhook-"));

  assert.equal(invalidToken.statusCode, 403);
  assert.equal(invalidToken.code, "forbidden");
  assert.equal(rateLimit.statusCode, 429);
  assert.equal(rateLimit.retryAfterSeconds, 60);
  assert.equal(serverError.statusCode, 500);
  assert.equal(serverError.code, "server_error");
});

test("large fixture statement snapshot is schema-valid and intentionally expansive", async () => {
  const largeStatement = await readFixture(
    "statements/uah-main-2026-04-large.json",
  );

  assertMonobankStatementItems(
    largeStatement,
    "fixtures/statements/uah-main-2026-04-large.json",
  );

  assert.ok(largeStatement.length >= 100);
  assert.ok(
    largeStatement.some((item) => item.amount > 0),
    "large fixture should include credits",
  );
  assert.ok(
    largeStatement.some((item) => item.amount < 0),
    "large fixture should include debits",
  );
  assert.ok(
    largeStatement.some((item) => item.hold),
    "large fixture should include hold records",
  );
  assert.ok(
    largeStatement.some((item) => item.currencyCode === 840),
    "large fixture should include USD records",
  );
  assert.ok(
    largeStatement.some((item) => item.currencyCode === 978),
    "large fixture should include EUR records",
  );
  assert.ok(
    largeStatement.every(
      (item, index, items) => index === 0 || items[index - 1].time <= item.time,
    ),
    "large fixture should be time-ordered",
  );

  const narrowWindow = largeStatement.filter(
    (item) => item.time >= 1775169600 && item.time <= 1775350400,
  );
  assert.ok(
    narrowWindow.length >= 5,
    "time-window slice should still include multiple rows",
  );
});

test("large fixture statement snapshot supports precise time-window filtering", async () => {
  const clientInfo = await readFixture("client-info.json");
  const currencyRates = await readFixture("currency-rates.json");
  const largeStatement = await readFixture(
    "statements/uah-main-2026-04-large.json",
  );
  const adapter = createFixtureMonobankAdapter({
    clientInfo,
    currencyRates,
    statements: {
      "fixture-account-uah-main-large": largeStatement,
    },
  });
  const windowStart = largeStatement[12].time;
  const windowEnd = largeStatement[77].time;
  const filtered = await adapter.getStatement({
    accountId: "fixture-account-uah-main-large",
    from: windowStart,
    to: windowEnd,
  });

  assert.equal(filtered.length, 66);
  assert.ok(
    filtered.every(
      (item) => item.time >= windowStart && item.time <= windowEnd,
    ),
  );
});

test("large fixture snapshot powers pagination, filters, and export/report workflows", async () => {
  const clientInfo = await readFixture("client-info.json");
  const currencyRates = await readFixture("currency-rates.json");
  const largeStatement = await readFixture(
    "statements/uah-main-2026-04-large.json",
  );

  const largeAccount = {
    ...clientInfo.accounts[0],
    id: "fixture-account-uah-main-large",
  };

  await withTempLedger(async ({ databasePath }) => {
    const profile = "fixture-large-snapshot";
    const db = createSqliteLedgerDb({
      filePath: databasePath,
      profile,
    });
    const queryService = createLedgerQueryService({
      db,
      defaultProfile: profile,
    });

    try {
      await db.migrate();
      const syncResult = await syncLedgerWithMonobank({
        profile,
        source: "fixture",
        adapter: createFixtureMonobankAdapter({
          clientInfo: {
            ...clientInfo,
            accounts: [largeAccount],
          },
          currencyRates,
          statements: {
            [largeAccount.id]: largeStatement,
          },
        }),
        db,
      });
      const allEntries = await readAllEntries(queryService, {
        sortBy: "time",
        sortDirection: "asc",
      });

      assert.equal(syncResult.stats.itemsSeen, largeStatement.length);
      assert.equal(syncResult.summary.ledgerEntries, largeStatement.length);
      assert.equal(allEntries.length, largeStatement.length);

      const page1 = await queryService.listLedgerEntries({
        limit: 25,
        sortBy: "time",
        sortDirection: "desc",
      });
      const page2 = await queryService.listLedgerEntries({
        limit: 25,
        offset: 25,
        sortBy: "time",
        sortDirection: "desc",
      });
      const searchResult = await queryService.listLedgerEntries({
        search: "Fixture transaction 011",
        limit: 5,
      });
      const holdResult = await queryService.listLedgerEntries({
        status: "hold",
        limit: 500,
      });
      const incomeResult = await queryService.listLedgerEntries({
        amountMin: 0,
        limit: 500,
      });
      const expenseResult = await queryService.listLedgerEntries({
        amountMax: -1,
        limit: 500,
      });
      const groceriesResult = await queryService.listLedgerEntries({
        categoryId: "groceries",
        limit: 500,
      });

      const windowFrom = allEntries[12].time;
      const windowTo = allEntries[88].time;
      const windowResult = await queryService.listLedgerEntries({
        from: windowFrom,
        to: windowTo,
        limit: 500,
      });

      assert.equal(page1.limit, 25);
      assert.equal(page1.entries.length, 25);
      assert.equal(page1.total, largeStatement.length);
      assert.equal(page2.entries.length, 25);
      assert.equal(page2.total, largeStatement.length);
      assert.notEqual(page1.entries[0].id, page2.entries[0].id);

      assert.equal(searchResult.total, 1);
      assert.equal(
        holdResult.total,
        largeStatement.filter((item) => item.hold).length,
      );
      assert.equal(
        incomeResult.total,
        largeStatement.filter((item) => item.amount >= 0).length,
      );
      assert.equal(
        expenseResult.total,
        largeStatement.filter((item) => item.amount < 0).length,
      );
      assert.equal(
        groceriesResult.total,
        largeStatement.filter((item) => item.mcc === 5411).length,
      );
      assert.equal(
        windowResult.total,
        largeStatement.filter(
          (item) => item.time >= windowFrom && item.time <= windowTo,
        ).length,
      );

      const categoryIds = new Set(
        allEntries.map((entry) => entry.categoryId).filter(Boolean),
      );
      assert.equal(categoryIds.has("income"), true);
      assert.equal(categoryIds.has("groceries"), true);
      assert.equal(categoryIds.has("dining"), true);

      const dayTotals = new Map();
      for (const entry of allEntries) {
        const day = new Date(entry.time * 1000).toISOString().slice(0, 10);
        dayTotals.set(day, (dayTotals.get(day) ?? 0) + entry.amount);
      }
      assert.equal(dayTotals.size >= 2, true);
      assert.equal(dayTotals.size >= 20, true);

      const currencyTotals = new Map();
      for (const entry of allEntries) {
        currencyTotals.set(
          entry.currencyCode,
          (currencyTotals.get(entry.currencyCode) ?? 0) + entry.amount,
        );
      }
      assert.equal(currencyTotals.size >= 2, true);

      const windowInflow = sumAmounts(
        allEntries.filter((entry) => entry.amount > 0),
      );
      assert.equal(
        windowInflow,
        largeStatement
          .filter((item) => item.amount > 0)
          .reduce((total, item) => total + item.amount, 0),
      );

      const holdInflow = sumAmounts(allEntries.filter((entry) => entry.hold));
      assert.equal(
        holdInflow,
        largeStatement
          .filter((item) => item.hold)
          .reduce((total, item) => total + item.amount, 0),
      );

      const jsonExport = await createLedgerExport(db, {
        profile,
        format: "json",
        accountIds: [largeAccount.id],
        from: windowFrom,
        to: windowTo,
      });
      const parsedJsonExport = JSON.parse(jsonExport.body);
      const groceriesJsonlExport = await createLedgerExport(db, {
        profile,
        format: "jsonl",
        accountIds: [largeAccount.id],
        categoryIds: ["groceries"],
      });
      const csvExport = await createLedgerExport(db, {
        profile,
        format: "csv",
        accountIds: [largeAccount.id],
      });
      const groceriesRows = groceriesJsonlExport.body
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));

      assert.equal(parsedJsonExport.total, windowResult.total);
      assert.equal(parsedJsonExport.filters.accountIds[0], largeAccount.id);
      assert.equal(parsedJsonExport.filters.from, windowFrom);
      assert.equal(parsedJsonExport.filters.to, windowTo);
      assert.equal(csvExport.contentType, "text/csv; charset=utf-8");
      assert.ok(csvExport.body.startsWith("id,accountId,time,date"));
      assert.equal(
        groceriesRows.every((row) => row.categoryId === "groceries"),
        true,
      );
      assert.equal(
        groceriesRows.length,
        largeStatement.filter((item) => item.mcc === 5411).length,
      );
    } finally {
      await db.close();
    }
  });
});

test("10k-row transaction fixture stays paginated within the query guardrail", async () => {
  await withTempLedger(async ({ databasePath }) => {
    const profile = "fixture-10k-performance";
    const db = createSqliteLedgerDb({ filePath: databasePath, profile });
    const query = createLedgerQueryService({ db, defaultProfile: profile });

    try {
      await db.migrate();
      const raw = new Database(databasePath);
      try {
        const insert = raw.prepare(`
          INSERT INTO ledger_entries (
            profile, id, account_id, time, description, amount,
            operation_amount, currency_code, category_id, category_name,
            merchant_name, raw_statement_item_id, hold, balance,
            created_at, updated_at
          ) VALUES (
            @profile, @id, 'fixture-account-10k-performance', @time,
            @description, -1000, -1000, 980, 'groceries', 'Groceries',
            'Fixture Merchant', @id, 0, @balance, @createdAt, @createdAt
          )
        `);
        const insertAll = raw.transaction(() => {
          for (let index = 0; index < 10_000; index += 1) {
            insert.run({
              profile,
              id: `fixture-performance-${String(index).padStart(5, "0")}`,
              time: 1_775_001_600 + index,
              description: `Fixture performance transaction ${index}`,
              balance: 10_000_000 - index * 1_000,
              createdAt: "2026-04-01T00:00:00.000Z",
            });
          }
        });
        insertAll();
      } finally {
        raw.close();
      }

      const startedAt = performance.now();
      const page = await query.listLedgerEntries({
        limit: 50,
        sortBy: "time",
        sortDirection: "desc",
      });
      const durationMs = performance.now() - startedAt;

      assert.equal(page.total, 10_000);
      assert.equal(page.entries.length, 50);
      assert.ok(
        durationMs < 1_500,
        `10k-row first-page query took ${durationMs.toFixed(1)}ms`,
      );
    } finally {
      await db.close();
    }
  });
});

test("fixture validation reports the failing field path", () => {
  assert.throws(
    () =>
      assertMonobankStatementItems(
        [
          {
            id: "fixture-invalid-statement",
            time: 1775031300,
            description: "Invalid local fixture",
            mcc: 4829,
            originalMcc: 4829,
            amount: -1000,
            operationAmount: -1000,
            currencyCode: 980,
            commissionRate: 0,
            cashbackAmount: 0,
            balance: 100000,
          },
        ],
        "fixtures/statements/invalid.json",
      ),
    (error) => {
      assert.ok(error instanceof MonobankValidationError);
      assert.equal(
        error.message,
        "fixtures/statements/invalid.json[0].hold must be a boolean",
      );
      assert.equal(error.path, "fixtures/statements/invalid.json[0].hold");
      assert.equal(error.expected, "a boolean");
      assert.equal(error.code, "validation_failed");
      assert.equal(error.category, "validation");

      return true;
    },
  );
});

test("accepts statement items without an external id (for fallback path)", () => {
  const statementItem = {
    time: 1775031300,
    description: "Missing identifier transfer",
    mcc: 6012,
    originalMcc: 6012,
    amount: -3500,
    operationAmount: -3500,
    currencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 100000,
    hold: false,
  };

  assertMonobankStatementItems(
    [statementItem],
    "fixtures/statements/no-id.json",
  );
});

test("loads bundled fixtures into a validated fixture set", async () => {
  const fixtures = await loadMonobankFixtureSet();

  assert.equal(fixtures.clientInfo.clientId, "fixture-client-primary");
  assert.equal(fixtures.currencyRates.length, 3);
  assert.equal(fixtures.statements["fixture-account-uah-main"].length, 5);
  assert.deepEqual(fixtures.statements["fixture-account-empty"], []);
  assert.equal(fixtures.webhookEvents.statementItem.type, "StatementItem");
  assert.equal(fixtures.errors.rateLimit.statusCode, 429);
});

test("creates a bundled fixture adapter without caller file reads", async () => {
  const adapter = await createBundledFixtureMonobankAdapter();
  const clientInfo = await adapter.getClientInfo();
  const statement = await adapter.getStatement({
    accountId: "fixture-account-uah-main",
    from: 1775001600,
    to: 1777593599,
  });

  assert.equal(clientInfo.accounts.length, 2);
  assert.ok(
    statement.some((item) => item.id === "fixture-stmt-2026-04-01-salary"),
  );
});

test("fixture loader reports invalid bundled fields", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-fixtures-"));
  const tempFixturesDir = path.join(tempRoot, "monobank");

  try {
    await cp(bundledMonobankFixturesDir, tempFixturesDir, {
      recursive: true,
    });
    await writeFile(
      path.join(tempFixturesDir, "statements", "uah-main-2026-04.json"),
      JSON.stringify(
        [
          {
            id: "fixture-invalid-statement",
            time: 1775031300,
            description: "Invalid local fixture",
            mcc: 4829,
            originalMcc: 4829,
            amount: -1000,
            operationAmount: -1000,
            currencyCode: 980,
            commissionRate: 0,
            cashbackAmount: 0,
            balance: 100000,
          },
        ],
        null,
        2,
      ),
    );

    await assert.rejects(
      () => loadMonobankFixtureSet({ fixturesDir: tempFixturesDir }),
      (error) => {
        assert.ok(error instanceof MonobankValidationError);
        assert.equal(
          error.message,
          "fixtures/statements/uah-main-2026-04.json[0].hold must be a boolean",
        );
        assert.equal(
          error.path,
          "fixtures/statements/uah-main-2026-04.json[0].hold",
        );
        assert.equal(error.code, "validation_failed");
        assert.equal(error.category, "validation");

        return true;
      },
    );
  } finally {
    await rm(tempRoot, {
      force: true,
      recursive: true,
    });
  }
});

test("fixture adapter serves offline client, currency, and statement data", async () => {
  const clientInfo = await readFixture("client-info.json");
  const currencyRates = await readFixture("currency-rates.json");
  const uahStatement = await readFixture("statements/uah-main-2026-04.json");
  const eurStatement = await readFixture("statements/eur-savings-2026-04.json");
  const adapter = createFixtureMonobankAdapter({
    clientInfo,
    currencyRates,
    statements: {
      "fixture-account-uah-main": uahStatement,
      "fixture-account-eur-savings": eurStatement,
    },
  });

  assert.equal((await adapter.getClientInfo()).clientId, clientInfo.clientId);
  assert.deepEqual(await adapter.getCurrency(), currencyRates);

  const fullWindow = await adapter.getStatement({
    accountId: "fixture-account-uah-main",
    from: 1775001600,
    to: 1777593599,
  });
  const narrowWindow = await adapter.getStatement({
    accountId: "fixture-account-uah-main",
    from: 1775031200,
    to: 1775031400,
  });
  const missingAccount = await adapter.getStatement({
    accountId: "fixture-account-missing",
    from: 1775001600,
    to: 1777593599,
  });

  assert.equal(fullWindow.length, uahStatement.length);
  assert.deepEqual(
    narrowWindow.map((item) => item.id),
    ["fixture-stmt-2026-04-01-salary"],
  );
  assert.deepEqual(missingAccount, []);
});

test("http adapter sends X-Token only to personal Monobank endpoints", async () => {
  const clientInfo = await readFixture("client-info.json");
  const currencyRates = await readFixture("currency-rates.json");
  const statement = await readFixture("statements/uah-main-2026-04.json");
  const requests = [];
  const rateLimitSleeps = [];
  let now = 1_000;
  const adapter = createMonobankHttpAdapter({
    token: "fixture-token",
    baseUrl: "https://api.example.test",
    timeoutMs: 1_000,
    now: () => now,
    sleep: async (ms) => {
      rateLimitSleeps.push(ms);
      now += ms;
    },
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        token: init.headers["X-Token"],
        method: init.method ?? "GET",
      });

      if (String(url).endsWith("/personal/client-info")) {
        return Response.json(clientInfo);
      }

      if (String(url).endsWith("/bank/currency")) {
        return Response.json(currencyRates);
      }

      if (
        String(url).endsWith(
          "/personal/statement/fixture-account-uah-main/1775001600/1777593599",
        )
      ) {
        return Response.json(statement);
      }

      if (String(url).endsWith("/personal/webhook")) {
        return new Response(null, { status: 200 });
      }

      return Response.json({ message: "not found" }, { status: 404 });
    },
  });

  assert.equal((await adapter.getClientInfo()).clientId, clientInfo.clientId);
  assert.equal((await adapter.getCurrency()).length, currencyRates.length);
  assert.equal(
    (
      await adapter.getStatement({
        accountId: "fixture-account-uah-main",
        from: 1775001600,
        to: 1777593599,
      })
    ).length,
    statement.length,
  );
  await adapter.setWebhook("https://localhost.example/webhook");

  assert.deepEqual(
    requests.map((request) => request.token),
    ["fixture-token", undefined, "fixture-token", "fixture-token"],
  );
  assert.equal(requests[3].method, "POST");
  assert.deepEqual(rateLimitSleeps, [60_000, 60_000]);
});

test("http adapter integration works against a local mock Monobank server", async () => {
  const token = "fixture-secret-token";
  const clientInfo = await readFixture("client-info.json");
  const currencyRates = await readFixture("currency-rates.json");
  const uahStatement = await readFixture("statements/uah-main-2026-04.json");
  const eurStatement = await readFixture("statements/eur-savings-2026-04.json");
  const sleepHistory = [];
  let now = 0;
  const recorded = [];
  const statementByAccount = {
    "fixture-account-uah-main": uahStatement,
    "fixture-account-eur-savings": eurStatement,
    "fixture-account-empty": [],
  };

  const handler = createMonobankMockHttpHandler({
    clientInfo,
    currencyRates,
    statementByAccount,
    onRequest: ({ endpoint, headers }) => {
      recorded.push({
        endpoint,
        token: headers["x-token"],
        contentType: headers["content-type"],
      });
    },
  });

  await withMockMonobankServer(handler, async (baseUrl) => {
    const adapter = createMonobankHttpAdapter({
      token,
      baseUrl,
      now: () => now,
      sleep: async (ms) => {
        sleepHistory.push(ms);
        now += ms;
      },
    });

    await withTempLedger(async ({ databasePath }) => {
      const db = createSqliteLedgerDb({
        filePath: databasePath,
        profile: "demo",
      });

      try {
        const result = await syncLedgerWithMonobank({
          profile: "demo",
          source: "monobank",
          adapter,
          db,
          from: 1_775_011_600,
          to: 1_777_593_599,
        });
        const summary = await db.getDatabaseInfo("demo");
        const accounts = await db.listAccounts("demo");

        assert.equal(result.run.status, "success");
        assert.equal(result.accounts.length, 2);
        assert.equal(accounts.length, 2);
        assert.equal(summary.accounts, 2);
        assert.equal(summary.ledgerEntries, 7);
        assert.equal(summary.syncRuns, 1);
        assert.equal(summary.webhookEvents, 0);
        await adapter.setWebhook("https://localhost.example/webhook");
      } finally {
        await db.close();
      }
    });

    assert.equal(recorded.length, 5);
    assert.deepEqual(
      recorded.map((request) => request.token),
      [token, undefined, token, token, token],
    );
    assert.equal(recorded[4].endpoint, "POST /personal/webhook");
    assert.equal(recorded[4].contentType, "application/json");
    assert.deepEqual(sleepHistory, [60000, 60000, 60000]);
    assert.equal(
      recorded.some(
        (request) => request.endpoint === "GET /personal/client-info",
      ),
      true,
    );
  });
});

test("sync retries statement fetch after a mock 429 response", async () => {
  const token = "fixture-secret-token";
  const clientInfo = await readFixture("client-info.json");
  const currencyRates = await readFixture("currency-rates.json");
  const uahStatement = await readFixture("statements/uah-main-2026-04.json");
  const requestLog = [];
  const sleepHistory = [];
  let now = 0;
  let throttledStatementResponses = 0;

  const statementFrom = 1_775_011_600;
  const statementTo = 1_777_593_599;

  const baseHandler = createMonobankMockHttpHandler({
    clientInfo,
    currencyRates,
    statementByAccount: {
      "fixture-account-uah-main": uahStatement,
    },
    onRequest: ({ endpoint }) => {
      requestLog.push(endpoint);
    },
  });

  const handler = async (request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const pathname = requestUrl.pathname;

    if (
      pathname.startsWith("/personal/statement/fixture-account-uah-main/") &&
      request.method === "GET" &&
      throttledStatementResponses === 0
    ) {
      throttledStatementResponses += 1;

      response.writeHead(429, {
        "content-type": "application/json",
        "retry-after": "60",
      });
      response.end(
        JSON.stringify({
          error: "rate_limited",
          message: "rate limit exceeded",
        }),
      );

      return;
    }

    return baseHandler(request, response);
  };

  await withMockMonobankServer(handler, async (baseUrl) => {
    const adapter = createMonobankHttpAdapter({
      token,
      baseUrl,
      now: () => now,
      sleep: async (ms) => {
        sleepHistory.push(ms);
        now += ms;
      },
    });

    await withTempLedger(async ({ databasePath }) => {
      const db = createSqliteLedgerDb({
        filePath: databasePath,
        profile: "demo",
      });

      try {
        const result = await syncLedgerWithMonobank({
          profile: "demo",
          source: "monobank",
          adapter,
          db,
          from: statementFrom,
          to: statementTo,
          accountIds: ["fixture-account-uah-main"],
        });
        const summary = await db.getDatabaseInfo("demo");

        assert.equal(result.run.status, "success");
        assert.equal(result.run.rateLimited, 0);
        assert.equal(result.accounts.length, 1);
        assert.equal(result.accounts[0].accountId, "fixture-account-uah-main");
        assert.equal(summary.accounts, 2);
        assert.equal(summary.ledgerEntries, uahStatement.length);
        assert.equal(summary.syncRuns, 1);
      } finally {
        await db.close();
      }
    });
  });

  assert.equal(throttledStatementResponses, 1);
  assert.deepEqual(
    requestLog.filter((endpoint) =>
      endpoint.startsWith("GET /personal/statement"),
    ),
    [
      `GET /personal/statement/fixture-account-uah-main/${statementFrom}/${statementTo}`,
    ],
  );
  assert.deepEqual(sleepHistory, [60000, 60000]);
});

test("monobank mock server helper serves standard fixture endpoints", async () => {
  const clientInfo = await readFixture("client-info.json");
  const currencyRates = await readFixture("currency-rates.json");
  const uahStatement = await readFixture("statements/uah-main-2026-04.json");
  const requestLog = [];

  const handler = createMonobankMockHttpHandler({
    clientInfo,
    currencyRates,
    statementByAccount: {
      "fixture-account-uah-main": uahStatement,
    },
    onRequest: ({ endpoint }) => {
      requestLog.push(endpoint);
    },
  });

  await withMockMonobankServer(handler, async (baseUrl) => {
    const clientInfoResponse = await fetch(`${baseUrl}/personal/client-info`);
    const ratesResponse = await fetch(`${baseUrl}/bank/currency`);
    const statementResponse = await fetch(
      `${baseUrl}/personal/statement/fixture-account-uah-main/1775001600/1777593599`,
    );
    const webhookResponse = await fetch(`${baseUrl}/personal/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "StatementItem",
        data: {
          account: "fixture-account-uah-main",
          statementItem: {
            id: "fixture-webhook-large-001",
            time: 1775031300,
            description: "Webhook deposit",
            mcc: 4829,
            originalMcc: 4829,
            amount: 2500,
            operationAmount: 2500,
            currencyCode: 980,
            commissionRate: 0,
            cashbackAmount: 0,
            balance: 10000000,
            hold: false,
          },
        },
      }),
    });
    const missingResponse = await fetch(`${baseUrl}/not-a-real-endpoint`);

    assert.equal(clientInfoResponse.status, 200);
    assert.equal(ratesResponse.status, 200);
    assert.equal(statementResponse.status, 200);
    assert.equal(webhookResponse.status, 204);
    assert.equal(missingResponse.status, 404);
    assert.equal(requestLog.includes("GET /personal/client-info"), true);
    assert.equal(requestLog.includes("GET /bank/currency"), true);
    assert.equal(
      requestLog.includes(
        "GET /personal/statement/fixture-account-uah-main/1775001600/1777593599",
      ),
      true,
    );
    assert.equal(requestLog.includes("POST /personal/webhook"), true);
  });
});

test("monobank mock server supports explicit integration-test lifecycle", async () => {
  const clientInfo = await readFixture("client-info.json");
  const currencyRates = await readFixture("currency-rates.json");
  const handler = createMonobankMockHttpHandler({
    clientInfo,
    currencyRates,
  });
  const mockServer = createMonobankMockServer(handler);

  assert.throws(() => mockServer.url, /has not started/);

  const baseUrl = await mockServer.listen();

  try {
    assert.equal(mockServer.url, baseUrl);

    const clientInfoResponse = await fetch(`${baseUrl}/personal/client-info`);
    const ratesResponse = await fetch(`${mockServer.url}/bank/currency`);

    assert.equal(clientInfoResponse.status, 200);
    assert.equal(ratesResponse.status, 200);
    assert.deepEqual(await clientInfoResponse.json(), clientInfo);
    assert.deepEqual(await ratesResponse.json(), currencyRates);
  } finally {
    await mockServer.close();
  }

  assert.throws(() => mockServer.url, /has not started/);
});

test("http adapter redacts token-bearing API errors", async () => {
  const adapter = createMonobankHttpAdapter({
    token: "fixture-secret-token",
    baseUrl: "https://api.example.test",
    maxRetries: 0,
    fetch: async () => {
      return Response.json(
        {
          message:
            "bad token fixture-secret-token for UA213223130000026007233566001",
        },
        { status: 403 },
      );
    },
  });

  await assert.rejects(
    () => adapter.getClientInfo(),
    (error) => {
      assert.equal(error.name, "MonobankApiError");
      assert.equal(error.code, "token_invalid");
      assert.equal(error.category, "auth");
      assert.equal(error.details?.statusCode, 403);
      assert.doesNotMatch(error.message, /fixture-secret-token/);
      assert.doesNotMatch(error.message, /UA213223130000026007233566001/);
      assert.match(error.message, /\[redacted\]/);

      return true;
    },
  );
});

test("http adapter classifies API rate-limits as domain errors", async () => {
  const adapter = createMonobankHttpAdapter({
    token: "fixture-token",
    baseUrl: "https://api.example.test",
    maxRetries: 0,
    fetch: async () =>
      Response.json(
        { message: "rate limit", error: "rate_limited" },
        {
          status: 429,
          headers: {
            "retry-after": "60",
          },
        },
      ),
  });

  await assert.rejects(
    () => adapter.getClientInfo(),
    (error) => {
      assert.equal(error.name, "MonobankApiError");
      assert.equal(error.code, "rate_limit_exceeded");
      assert.equal(error.category, "rate_limit");
      assert.equal(error.response.statusCode, 429);
      assert.equal(error.response.retryAfterSeconds, 60);

      return true;
    },
  );
});

test("http adapter maps transport failures to network domain errors", async () => {
  const adapter = createMonobankHttpAdapter({
    token: "fixture-token",
    baseUrl: "https://api.example.test",
    maxRetries: 0,
    fetch: async () => {
      throw new Error("network unavailable");
    },
  });

  await assert.rejects(
    () => adapter.getClientInfo(),
    (error) => {
      assert.equal(error.name, "DomainError");
      assert.equal(error.code, "network_unreachable");
      assert.equal(error.category, "network");
      assert.equal(error.details?.endpoint, "/personal/client-info");
      assert.equal(error.details?.reason, "network unavailable");

      return true;
    },
  );
});

test("http adapter retries transient server failures", async () => {
  const clientInfo = await readFixture("client-info.json");
  let attempts = 0;
  const sleeps = [];
  let now = 0;
  const adapter = createMonobankHttpAdapter({
    token: "fixture-token",
    baseUrl: "https://api.example.test",
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    fetch: async () => {
      attempts += 1;

      if (attempts === 1) {
        return Response.json({ message: "temporary failure" }, { status: 500 });
      }

      return Response.json(clientInfo);
    },
  });

  assert.equal((await adapter.getClientInfo()).clientId, clientInfo.clientId);
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [250, 59_750]);
});
