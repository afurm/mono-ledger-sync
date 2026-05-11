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
