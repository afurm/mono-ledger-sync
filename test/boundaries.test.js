import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { productArchitecture, version } from "mono-ledger-sync/core";
import {
  createLocalApiServer,
  localApiRoutePrefix,
  localApiServerFramework,
} from "mono-ledger-sync/server";
import {
  appNavigation,
  componentSystem,
  themeTokens,
  uiFramework,
} from "mono-ledger-sync/ui";

test("exposes the product architecture without loading extra entrypoints", () => {
  assert.deepEqual(productArchitecture, {
    ui: "vite",
    server: "fastify",
    storage: "sqlite",
  });
});

test("defines the local API and UI boundaries", () => {
  assert.equal(localApiServerFramework, "fastify");
  assert.equal(localApiRoutePrefix, "/api");
  assert.equal(uiFramework, "vite");
  assert.equal(componentSystem, "shadcn/ui");
  assert.equal(themeTokens.primary, "#05962f");
  assert.deepEqual(appNavigation.slice(0, 4), [
    "overview",
    "transactions",
    "rules-and-mappings",
    "sync-and-webhooks",
  ]);
});

test("documents the minimum local product flow", async () => {
  const workflow = await readFile(
    "examples/sample-workflows/minimum-product-flow.md",
    "utf8",
  );
  const readme = await readFile("README.md", "utf8");

  assert.match(workflow, /## 1\. Install and start the local app/);
  assert.match(
    workflow,
    /## 2\. Add a Monobank token when live sync is needed/,
  );
  assert.match(workflow, /## 3\. Sync accounts and statements/);
  assert.match(workflow, /## 4\. Review transactions/);
  assert.match(workflow, /## 5\. Categorize spending/);
  assert.match(workflow, /## 6\. Export local data/);
  assert.match(readme, /minimum local product flow/);
});

test("documents the shared domain model contract", async () => {
  const domainSource = await readFile("src/domain/index.ts", "utf8");
  const domainDoc = await readFile("docs/domain-model.md", "utf8");
  const readme = await readFile("README.md", "utf8");
  const typeNames = [
    "Profile",
    "LedgerSource",
    "MonobankAccount",
    "MonobankJar",
    "MonobankStatementItem",
    "MonobankRawEvent",
    "LedgerAccount",
    "LedgerEntry",
    "SyncCursor",
    "SyncRun",
    "Category",
    "Budget",
    "RecurringItem",
    "DomainError",
    "LocalActivityEvent",
  ];

  for (const typeName of typeNames) {
    assert.match(
      domainSource,
      new RegExp(`export (interface|class|type) ${typeName}\\b`),
    );
    assert.match(domainDoc, new RegExp(`\\b${typeName}\\b`));
  }

  assert.match(readme, /docs\/domain-model\.md/);
});

test("serves local API health through Fastify", async () => {
  const server = createLocalApiServer();

  try {
    const response = await server.inject({
      method: "GET",
      url: "/api/health",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      status: "ok",
      localOnly: true,
      version,
      framework: "fastify",
      apiPrefix: "/api",
      architecture: productArchitecture,
    });
  } finally {
    await server.close();
  }
});

test("exposes local webhook settings in app config", async () => {
  const server = createLocalApiServer({
    profile: "demo",
    source: "fixture",
    host: "127.0.0.1",
    port: 55443,
  });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/api/app/config",
    });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.equal(body.webhook.enabled, true);
    assert.match(body.webhook.path, /^\/api\/webhooks\/monobank-[a-f0-9]{16}$/);
    assert.equal(body.webhook.host, "127.0.0.1");
    assert.equal(body.webhook.port, 55443);
    assert.equal(
      body.webhook.url,
      `http://127.0.0.1:55443${body.webhook.path}`,
    );
  } finally {
    await server.close();
  }
});

test("serves the built local web UI when available", async () => {
  const server = createLocalApiServer({
    profile: "demo",
    source: "fixture",
  });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/",
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /^<!doctype html>/);
    assert.match(response.body, /mono-ledger-sync/);
    assert.match(response.body, /id="root"/);
    assert.match(response.body, /\/assets\//);
  } finally {
    await server.close();
  }
});

test("serves bundled fixture summary through the local API", async () => {
  const server = createLocalApiServer({
    profile: "demo",
    source: "fixture",
  });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/api/fixtures/summary",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      source: "fixture",
      profile: "demo",
      accounts: 2,
      jars: 1,
      currencyRates: 3,
      statementAccounts: 3,
      statementItems: 7,
      webhookEvents: 1,
      errorStates: 3,
    });
  } finally {
    await server.close();
  }
});

test("serves bundled fixture client info through the local API", async () => {
  const server = createLocalApiServer({
    profile: "demo",
    source: "fixture",
  });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/api/fixtures/client-info",
    });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.equal(body.source, "fixture");
    assert.equal(body.profile, "demo");
    assert.equal(body.clientInfo.clientId, "fixture-client-primary");
    assert.equal(body.clientInfo.accounts.length, 2);
  } finally {
    await server.close();
  }
});

test("serves bundled fixture statements through the local API", async () => {
  const server = createLocalApiServer({
    profile: "demo",
    source: "fixture",
  });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/api/fixtures/statements",
    });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.equal(body.source, "fixture");
    assert.equal(body.profile, "demo");
    assert.equal(body.totalItems, 7);
    assert.deepEqual(
      body.accounts.map((account) => account.accountId),
      [
        "fixture-account-uah-main",
        "fixture-account-eur-savings",
        "fixture-account-empty",
      ],
    );
    assert.ok(
      body.accounts[0].items.some(
        (item) => item.id === "fixture-stmt-2026-04-01-salary",
      ),
    );
  } finally {
    await server.close();
  }
});
