import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  loadMonobankFixtureSet,
} from "../dist/monobank/index.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixturesDir = path.join(repoRoot, "fixtures", "monobank");

const fixtureFiles = [
  "client-info.json",
  "currency-rates.json",
  "statements/uah-main-2026-04.json",
  "statements/eur-savings-2026-04.json",
  "statements/empty.json",
  "webhooks/statement-item.json",
  "errors/invalid-token.json",
  "errors/rate-limit.json",
  "errors/server-error.json",
];

async function readFixture(relativePath) {
  const text = await readFile(path.join(fixturesDir, relativePath), "utf8");

  return JSON.parse(text);
}

test("fixtures stay synthetic and avoid real-looking sensitive values", async () => {
  for (const fixtureFile of fixtureFiles) {
    const text = await readFile(path.join(fixturesDir, fixtureFile), "utf8");

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

    JSON.parse(text);
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

      return true;
    },
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
