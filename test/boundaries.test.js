import assert from "node:assert/strict";
import test from "node:test";

import { productArchitecture } from "mono-ledger-sync/core";
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

test("exposes the product architecture without loading CLI code", () => {
  assert.deepEqual(productArchitecture, {
    ui: "vite",
    server: "fastify",
    storage: "sqlite",
    cli: "launcher",
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
      framework: "fastify",
      apiPrefix: "/api",
      architecture: productArchitecture,
    });
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
