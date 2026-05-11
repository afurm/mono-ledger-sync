import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createFixtureMonobankAdapter } from "../dist/monobank/index.js";

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
