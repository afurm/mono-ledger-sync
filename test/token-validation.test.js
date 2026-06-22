import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createMonobankHttpAdapter,
  MonobankApiError,
} from "../dist/monobank/index.js";
import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";
import {
  createMonobankMockHttpHandler,
  createMonobankMockServer,
  withMockMonobankServer,
} from "./monobank-mock-server.js";

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-tok-"));

  try {
    return await callback({ tempRoot });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

function okClientInfo() {
  return {
    clientId: "client-abc-123",
    name: "Andrii F.",
    webHookUrl: "https://example.invalid/hook",
    permissions: "psu",
    accounts: [
      {
        id: "acc-1",
        sendId: "send-1",
        balance: 100000,
        creditLimit: 0,
        type: "black",
        currencyCode: 980,
        cashbackType: "UAH",
        maskedPan: ["4444"],
        iban: "UA213223130000026007233566001",
      },
      {
        id: "acc-2",
        sendId: "send-2",
        balance: 50000,
        creditLimit: 0,
        type: "white",
        currencyCode: 840,
        cashbackType: "USD",
        maskedPan: ["5555"],
        iban: "UA213223130000026007233566002",
      },
      {
        id: "acc-3",
        sendId: "send-3",
        balance: 0,
        creditLimit: 0,
        type: "platinum",
        currencyCode: 978,
        cashbackType: "EUR",
        maskedPan: ["6666"],
        iban: "UA213223130000026007233566003",
      },
    ],
    jars: [
      {
        id: "jar-1",
        sendId: "jar-send-1",
        title: "Vacation",
        description: "vacation",
        currencyCode: 980,
        balance: 10000,
        goal: 100000,
      },
    ],
  };
}

test("POST /api/app/token probes live client-info, stores the token, and auto-promotes source fixture→monobank (happy path)", async () => {
  const handler = createMonobankMockHttpHandler({
    clientInfo: okClientInfo(),
    currencyRates: [],
    statementByAccount: {},
  });

  await withMockMonobankServer(handler, async (mockBaseUrl) => {
    await withTempLedger(async ({ tempRoot }) => {
      const monobankTokenStore = createSessionMonobankTokenStore();
      const server = createLocalApiServer({
        profile: "demo",
        source: "fixture",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55701,
        monobankTokenStore,
        monobankBaseUrl: mockBaseUrl,
        validateMonobankTokenOnSave: true,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: "live-good-token",
          baseUrl: mockBaseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
      });

      try {
        // Confirm the workspace really starts in fixture mode.
        const beforeConfig = await server.inject({
          method: "GET",
          url: "/api/app/config",
        });
        assert.equal(beforeConfig.json().source, "fixture");
        assert.equal(beforeConfig.json().token.hasToken, false);

        const saveResponse = await server.inject({
          method: "POST",
          url: "/api/app/token",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: "demo",
            token: "live-good-token",
          }),
        });

        assert.equal(saveResponse.statusCode, 200);
        const body = saveResponse.json();

        assert.equal(body.profile, "demo");
        assert.equal(body.hasToken, true);
        assert.equal(body.clientInfo.masked, true);
        assert.equal(body.clientInfo.clientId, "client-abc-123");
        assert.equal(body.clientInfo.name, "Andrii F.");
        assert.equal(body.clientInfo.accounts, 3);
        assert.equal(body.clientInfo.jars, 1);

        // The token must have actually been persisted to the store.
        assert.equal(
          await monobankTokenStore.getToken("demo"),
          "live-good-token",
        );

        // The workspace source must have been auto-promoted to
        // monobank, and the token status must be reflected.
        const afterConfig = await server.inject({
          method: "GET",
          url: "/api/app/config",
        });
        assert.equal(afterConfig.json().source, "monobank");
        assert.equal(afterConfig.json().token.hasToken, true);
      } finally {
        await server.close();
      }
    });
  });
});

test('POST /api/app/token succeeds when client-info returns webHookUrl:"" (empty webhook is a real Monobank response, not an error)', async () => {
  // Regression: Monobank returns "webHookUrl": "" for tokens whose owner has
  // never registered a webhook. The local validator used to treat that as
  // "monobank:/personal/client-info.webHookUrl must be a non-empty string"
  // and reject the token save, leaving the user stuck at "Token update failed".
  const clientInfoNoWebhook = {
    ...okClientInfo(),
    webHookUrl: "",
    permissions: "",
  };

  const handler = createMonobankMockHttpHandler({
    clientInfo: clientInfoNoWebhook,
    currencyRates: [],
    statementByAccount: {},
  });

  await withMockMonobankServer(handler, async (mockBaseUrl) => {
    await withTempLedger(async ({ tempRoot }) => {
      const monobankTokenStore = createSessionMonobankTokenStore();
      const server = createLocalApiServer({
        profile: "demo",
        source: "fixture",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55703,
        monobankTokenStore,
        monobankBaseUrl: mockBaseUrl,
        validateMonobankTokenOnSave: true,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: "live-good-token-no-webhook",
          baseUrl: mockBaseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
      });

      try {
        const saveResponse = await server.inject({
          method: "POST",
          url: "/api/app/token",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: "demo",
            token: "live-good-token-no-webhook",
          }),
        });

        assert.equal(
          saveResponse.statusCode,
          200,
          `expected 200, got ${saveResponse.statusCode} ${saveResponse.body}`,
        );
        const body = saveResponse.json();
        assert.equal(body.hasToken, true);
        assert.equal(body.clientInfo.clientId, "client-abc-123");
        assert.equal(
          await monobankTokenStore.getToken("demo"),
          "live-good-token-no-webhook",
        );
      } finally {
        await server.close();
      }
    });
  });
});

test("POST /api/app/token rejects an invalid token, surfaces upstream error, and does NOT store it", async () => {
  const handler = createMonobankMockHttpHandler({
    clientInfo: okClientInfo(),
    currencyRates: [],
    statementByAccount: {},
  });

  await withMockMonobankServer(handler, async (mockBaseUrl) => {
    // Replace /personal/client-info with a 401 + errorDescription.
    const rejectingServer = createMonobankMockServer(
      async (request, response) => {
        const requestUrl = new URL(request.url, "http://127.0.0.1");
        if (requestUrl.pathname === "/personal/client-info") {
          response.writeHead(401, { "content-type": "application/json" });
          response.end(JSON.stringify({ errorDescription: "Invalid token" }));
          return;
        }
        response.writeHead(404, { "content-type": "application/json" });
        response.end('{"message":"not found"}');
      },
    );

    let rejectBaseUrl;
    try {
      rejectBaseUrl = await rejectingServer.listen();

      await withTempLedger(async ({ tempRoot }) => {
        const monobankTokenStore = createSessionMonobankTokenStore();
        const server = createLocalApiServer({
          profile: "demo",
          source: "monobank",
          dataDir: tempRoot,
          host: "127.0.0.1",
          port: 55702,
          monobankTokenStore,
          monobankBaseUrl: rejectBaseUrl,
          validateMonobankTokenOnSave: true,
          monobankTokenProbeAdapter: createMonobankHttpAdapter({
            token: "live-bad-token",
            baseUrl: rejectBaseUrl,
            maxRetries: 0,
            timeoutMs: 5000,
          }),
        });

        try {
          const saveResponse = await server.inject({
            method: "POST",
            url: "/api/app/token",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              profile: "demo",
              token: "live-bad-token",
            }),
          });

          assert.equal(saveResponse.statusCode, 400);
          const body = saveResponse.json();

          assert.equal(body.error, "monobank_token_invalid");
          assert.equal(body.upstreamStatus, 401);
          assert.match(body.message, /Invalid token/);

          // Critical: the token must NOT have been persisted.
          assert.equal(await monobankTokenStore.getToken("demo"), undefined);

          // And the app config must still report no token.
          const configResponse = await server.inject({
            method: "GET",
            url: "/api/app/config",
          });
          assert.equal(configResponse.json().token.hasToken, false);
        } finally {
          await server.close();
        }
      });
    } finally {
      await rejectingServer.close();
    }
  });
});

test("POST /api/app/token surfaces a 429 upstream status and does NOT store the token", async () => {
  const rateLimitedServer = createMonobankMockServer(
    async (request, response) => {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      if (requestUrl.pathname === "/personal/client-info") {
        response.writeHead(429, {
          "content-type": "application/json",
          "retry-after": "60",
        });
        response.end(JSON.stringify({ errorDescription: "Too many requests" }));
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end('{"message":"not found"}');
    },
  );

  try {
    const baseUrl = await rateLimitedServer.listen();

    await withTempLedger(async ({ tempRoot }) => {
      const monobankTokenStore = createSessionMonobankTokenStore();
      const server = createLocalApiServer({
        profile: "demo",
        source: "monobank",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55703,
        monobankTokenStore,
        monobankBaseUrl: baseUrl,
        validateMonobankTokenOnSave: true,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: "rate-limited-token",
          baseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
      });

      try {
        const saveResponse = await server.inject({
          method: "POST",
          url: "/api/app/token",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: "demo",
            token: "rate-limited-token",
          }),
        });

        assert.equal(saveResponse.statusCode, 400);
        const body = saveResponse.json();

        assert.equal(body.error, "monobank_token_invalid");
        assert.equal(body.upstreamStatus, 429);
        assert.match(body.message, /Too many requests/);

        assert.equal(await monobankTokenStore.getToken("demo"), undefined);
      } finally {
        await server.close();
      }
    });
  } finally {
    await rateLimitedServer.close();
  }
});

test("POST /api/app/token with validateMonobankTokenOnSave=false skips the probe entirely", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const monobankTokenStore = createSessionMonobankTokenStore();
    let probeCalls = 0;
    const spyProbe = {
      async getClientInfo() {
        probeCalls += 1;
        return okClientInfo();
      },
      async getStatement() {
        return [];
      },
      async getCurrency() {
        return [];
      },
      async setWebhook() {
        return undefined;
      },
    };

    const server = createLocalApiServer({
      profile: "demo",
      source: "monobank",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 55704,
      monobankTokenStore,
      validateMonobankTokenOnSave: false,
      monobankTokenProbeAdapter: spyProbe,
    });

    try {
      const saveResponse = await server.inject({
        method: "POST",
        url: "/api/app/token",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: "demo",
          token: "no-probe-token",
        }),
      });

      assert.equal(saveResponse.statusCode, 200);
      const body = saveResponse.json();
      assert.equal(body.hasToken, true);
      assert.equal(body.profile, "demo");
      assert.equal(body.clientInfo, undefined);
      assert.equal(probeCalls, 0);
      assert.equal(await monobankTokenStore.getToken("demo"), "no-probe-token");
    } finally {
      await server.close();
    }
  });
});

test("POST /api/app/token uses the injected probe adapter instead of constructing an HTTP one", async () => {
  await withTempLedger(async ({ tempRoot }) => {
    const monobankTokenStore = createSessionMonobankTokenStore();
    let probeCalls = 0;
    let receivedToken = "";
    const injectedProbe = {
      async getClientInfo() {
        probeCalls += 1;
        // Return a deliberately-recognizable clientInfo to prove
        // the injected adapter, not a default HTTP one, was used.
        return {
          clientId: "from-injected-probe",
          name: "Injected Probe",
          accounts: [
            {
              id: "inj-acc",
              sendId: "inj-send",
              balance: 1,
              creditLimit: 0,
              type: "black",
              currencyCode: 980,
              cashbackType: "UAH",
              maskedPan: ["9999"],
              iban: "UA213223130000026007233566999",
            },
          ],
          jars: [],
        };
      },
      async getStatement() {
        return [];
      },
      async getCurrency() {
        return [];
      },
      async setWebhook() {
        return undefined;
      },
    };

    // The default probe path would call createMonobankHttpAdapter
    // and fail without MONOBANK_BASE_URL pointing at a real server.
    // If the server used that path, this test would hang/fail.
    // The injected probe must be used instead, proving the seam.
    const server = createLocalApiServer({
      profile: "demo",
      source: "monobank",
      dataDir: tempRoot,
      host: "127.0.0.1",
      port: 55705,
      monobankTokenStore,
      validateMonobankTokenOnSave: true,
      monobankTokenProbeAdapter: injectedProbe,
    });

    try {
      const saveResponse = await server.inject({
        method: "POST",
        url: "/api/app/token",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: "demo",
          token: "injected-probe-token",
        }),
      });

      assert.equal(saveResponse.statusCode, 200);
      const body = saveResponse.json();
      assert.equal(probeCalls, 1);
      assert.equal(body.clientInfo.clientId, "from-injected-probe");
      assert.equal(body.clientInfo.name, "Injected Probe");
      assert.equal(body.clientInfo.accounts, 1);
      assert.equal(body.clientInfo.jars, 0);
      assert.equal(
        await monobankTokenStore.getToken("demo"),
        "injected-probe-token",
      );
    } finally {
      await server.close();
    }
    // Silence unused-binding warnings.
    void receivedToken;
    void MonobankApiError;
  });
});

test("POST /api/app/token masks sensitive fields in the masked clientInfo summary", async () => {
  const handler = createMonobankMockHttpHandler({
    clientInfo: okClientInfo(),
    currencyRates: [],
    statementByAccount: {},
  });

  await withMockMonobankServer(handler, async (mockBaseUrl) => {
    await withTempLedger(async ({ tempRoot }) => {
      const monobankTokenStore = createSessionMonobankTokenStore();
      const server = createLocalApiServer({
        profile: "demo",
        source: "monobank",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55706,
        monobankTokenStore,
        monobankBaseUrl: mockBaseUrl,
        validateMonobankTokenOnSave: true,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: "mask-check-token",
          baseUrl: mockBaseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
      });

      try {
        const saveResponse = await server.inject({
          method: "POST",
          url: "/api/app/token",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: "demo",
            token: "mask-check-token",
          }),
        });

        assert.equal(saveResponse.statusCode, 200);
        const body = saveResponse.json();
        const serialized = JSON.stringify(body);

        // The masked summary must NOT contain raw IBANs, PANs,
        // or the actual token value. The shape guarantees this by
        // construction, but assert the contract explicitly so a
        // future schema drift can't silently leak.
        assert.doesNotMatch(serialized, /UA213223130000026007233566001/);
        assert.doesNotMatch(serialized, /UA213223130000026007233566002/);
        assert.doesNotMatch(serialized, /UA213223130000026007233566003/);
        assert.doesNotMatch(serialized, /mask-check-token/);
        assert.doesNotMatch(serialized, /\["4444"\]/);
        assert.doesNotMatch(serialized, /\["5555"\]/);
        assert.doesNotMatch(serialized, /\["6666"\]/);
        // The summary itself is intentionally labeled as masked.
        assert.equal(body.clientInfo.masked, true);
      } finally {
        await server.close();
      }
    });
  });
});

test("DELETE /api/app/token keeps monobank source so tokenless workspaces show sign-in instead of fixture data", async () => {
  const handler = createMonobankMockHttpHandler({
    clientInfo: okClientInfo(),
    currencyRates: [],
    statementByAccount: {},
  });

  await withMockMonobankServer(handler, async (mockBaseUrl) => {
    await withTempLedger(async ({ tempRoot }) => {
      const monobankTokenStore = createSessionMonobankTokenStore();
      await monobankTokenStore.setToken("demo", "pre-existing-token");
      const server = createLocalApiServer({
        profile: "demo",
        source: "monobank",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55707,
        monobankTokenStore,
        monobankBaseUrl: mockBaseUrl,
        validateMonobankTokenOnSave: true,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: "pre-existing-token",
          baseUrl: mockBaseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
      });

      try {
        const beforeConfig = await server.inject({
          method: "GET",
          url: "/api/app/config",
        });
        assert.equal(beforeConfig.json().source, "monobank");
        assert.equal(beforeConfig.json().token.hasToken, true);

        const deleteResponse = await server.inject({
          method: "DELETE",
          url: "/api/app/token",
        });
        assert.equal(deleteResponse.statusCode, 200);
        assert.equal(deleteResponse.json().hasToken, false);

        const afterConfig = await server.inject({
          method: "GET",
          url: "/api/app/config",
        });
        assert.equal(afterConfig.json().source, "monobank");
        assert.equal(afterConfig.json().token.hasToken, false);
      } finally {
        await server.close();
      }
    });
  });
});

test("POST /api/app/token on a failed probe does NOT change the source", async () => {
  const rejectingServer = createMonobankMockServer(
    async (request, response) => {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      if (requestUrl.pathname === "/personal/client-info") {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ errorDescription: "Invalid token" }));
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end('{"message":"not found"}');
    },
  );

  try {
    const baseUrl = await rejectingServer.listen();

    await withTempLedger(async ({ tempRoot }) => {
      const monobankTokenStore = createSessionMonobankTokenStore();
      const server = createLocalApiServer({
        profile: "demo",
        source: "fixture",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55708,
        monobankTokenStore,
        monobankBaseUrl: baseUrl,
        validateMonobankTokenOnSave: true,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: "rejected-token",
          baseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
      });

      try {
        const saveResponse = await server.inject({
          method: "POST",
          url: "/api/app/token",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: "demo",
            token: "rejected-token",
          }),
        });
        assert.equal(saveResponse.statusCode, 400);

        const afterConfig = await server.inject({
          method: "GET",
          url: "/api/app/config",
        });
        // Source must stay fixture — a failed probe does NOT promote.
        assert.equal(afterConfig.json().source, "fixture");
        assert.equal(afterConfig.json().token.hasToken, false);
        assert.equal(await monobankTokenStore.getToken("demo"), undefined);
      } finally {
        await server.close();
      }
    });
  } finally {
    await rejectingServer.close();
  }
});

test("POST /api/app/source rejects fixture mode outside explicit development configuration", async () => {
  const handler = createMonobankMockHttpHandler({
    clientInfo: okClientInfo(),
    currencyRates: [],
    statementByAccount: {},
  });

  await withMockMonobankServer(handler, async (mockBaseUrl) => {
    await withTempLedger(async ({ tempRoot }) => {
      const monobankTokenStore = createSessionMonobankTokenStore();
      const server = createLocalApiServer({
        profile: "demo",
        source: "monobank",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55709,
        monobankTokenStore,
        monobankBaseUrl: mockBaseUrl,
        validateMonobankTokenOnSave: true,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: "stay-monobank-token",
          baseUrl: mockBaseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
      });

      try {
        // The source is already monobank; a save should leave it.
        const saveResponse = await server.inject({
          method: "POST",
          url: "/api/app/token",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: "demo",
            token: "stay-monobank-token",
          }),
        });
        assert.equal(saveResponse.statusCode, 200);

        const afterConfig = await server.inject({
          method: "GET",
          url: "/api/app/config",
        });
        assert.equal(afterConfig.json().source, "monobank");
        assert.equal(afterConfig.json().token.hasToken, true);

        const switchResponse = await server.inject({
          method: "POST",
          url: "/api/app/source",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "fixture" }),
        });
        assert.equal(switchResponse.statusCode, 400);
        assert.equal(switchResponse.json().error, "config_invalid");

        const stillTokenConfig = await server.inject({
          method: "GET",
          url: "/api/app/config",
        });
        assert.equal(stillTokenConfig.json().source, "monobank");
        // Token is still saved — only an explicit DELETE should
        // remove it.
        assert.equal(stillTokenConfig.json().token.hasToken, true);
      } finally {
        await server.close();
      }
    });
  });
});

test("first-run demo mode loads synthetic data and clears it before live token promotion", async () => {
  const handler = createMonobankMockHttpHandler({
    clientInfo: okClientInfo(),
    currencyRates: [],
    statementByAccount: {},
  });

  await withMockMonobankServer(handler, async (mockBaseUrl) => {
    await withTempLedger(async ({ tempRoot }) => {
      const server = createLocalApiServer({
        profile: "demo",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55710,
        monobankTokenStore: createSessionMonobankTokenStore(),
        monobankBaseUrl: mockBaseUrl,
        validateMonobankTokenOnSave: true,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: "first-run-live-token",
          baseUrl: mockBaseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
      });

      try {
        const demoSource = await server.inject({
          method: "POST",
          url: "/api/app/source",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "fixture" }),
        });
        assert.equal(demoSource.statusCode, 200);
        assert.equal(demoSource.json().source, "fixture");

        const demoSync = await server.inject({
          method: "POST",
          url: "/api/sync/run",
        });
        assert.equal(demoSync.statusCode, 200);

        const demoSummary = await server.inject({
          method: "GET",
          url: "/api/ledger/summary",
        });
        assert.equal(demoSummary.json().ledgerEntries > 0, true);

        const saveToken = await server.inject({
          method: "POST",
          url: "/api/app/token",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: "demo",
            token: "first-run-live-token",
          }),
        });
        assert.equal(saveToken.statusCode, 200);

        const liveConfig = await server.inject({
          method: "GET",
          url: "/api/app/config",
        });
        const liveSummary = await server.inject({
          method: "GET",
          url: "/api/ledger/summary",
        });
        assert.equal(liveConfig.json().source, "monobank");
        assert.equal(liveSummary.json().ledgerEntries, 0);
        assert.equal(liveSummary.json().accounts, 0);
      } finally {
        await server.close();
      }
    });
  });
});
