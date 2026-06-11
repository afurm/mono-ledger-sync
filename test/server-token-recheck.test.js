import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createMonobankHttpAdapter } from "../dist/monobank/index.js";
import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";
import {
  createMonobankMockHttpHandler,
  createMonobankMockServer,
  withMockMonobankServer,
} from "./monobank-mock-server.js";

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-recheck-"));

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
    ],
    jars: [
      {
        id: "jar-1",
        sendId: "send-jar-1",
        title: "Savings",
        description: "Vacation fund",
        currencyCode: 980,
        balance: 12345,
        goal: 100000,
      },
    ],
  };
}

test("POST /api/app/token/recheck returns refreshed masked inventory", async () => {
  const handler = createMonobankMockHttpHandler({
    clientInfo: okClientInfo(),
    currencyRates: [],
    statementByAccount: {},
  });

  await withMockMonobankServer(handler, async (mockBaseUrl) => {
    await withTempLedger(async ({ tempRoot }) => {
      const monobankTokenStore = createSessionMonobankTokenStore();
      await monobankTokenStore.setToken("demo", "live-good-token");

      const server = createLocalApiServer({
        profile: "demo",
        source: "monobank",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55801,
        monobankTokenStore,
        monobankBaseUrl: mockBaseUrl,
        validateMonobankTokenOnSave: false,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: "live-good-token",
          baseUrl: mockBaseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
      });

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/app/token/recheck",
        });

        assert.equal(response.statusCode, 200);
        const body = response.json();

        assert.equal(body.profile, "demo");
        assert.equal(body.hasToken, true);
        assert.equal(body.clientInfo.masked, true);
        assert.equal(body.clientInfo.clientId, "client-abc-123");
        assert.equal(body.clientInfo.name, "Andrii F.");
        assert.equal(body.clientInfo.accounts, 1);
        assert.equal(body.clientInfo.jars, 1);
        // The probe must NOT have mutated the stored token.
        assert.equal(
          await monobankTokenStore.getToken("demo"),
          "live-good-token",
        );
      } finally {
        await server.close();
      }
    });
  });
});

test("POST /api/app/token/recheck surfaces upstream 401 errorDescription", async () => {
  await withMockMonobankServer(
    createMonobankMockHttpHandler({
      clientInfo: okClientInfo(),
      currencyRates: [],
      statementByAccount: {},
    }),
    async (mockBaseUrl) => {
      const rejectingServer = createMonobankMockServer(
        async (request, response) => {
          const requestUrl = new URL(request.url, "http://127.0.0.1");
          if (requestUrl.pathname === "/personal/client-info") {
            response.writeHead(401, { "content-type": "application/json" });
            response.end(
              JSON.stringify({ errorDescription: "Invalid token" }),
            );
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
          await monobankTokenStore.setToken("demo", "live-bad-token");

          const server = createLocalApiServer({
            profile: "demo",
            source: "monobank",
            dataDir: tempRoot,
            host: "127.0.0.1",
            port: 55802,
            monobankTokenStore,
            monobankBaseUrl: rejectBaseUrl,
            validateMonobankTokenOnSave: false,
            monobankTokenProbeAdapter: createMonobankHttpAdapter({
              token: "live-bad-token",
              baseUrl: rejectBaseUrl,
              maxRetries: 0,
              timeoutMs: 5000,
            }),
          });

          try {
            const response = await server.inject({
              method: "POST",
              url: "/api/app/token/recheck",
            });

            assert.equal(response.statusCode, 400);
            const body = response.json();
            assert.equal(body.error, "monobank_token_invalid");
            assert.match(body.message, /Invalid token/);
            assert.equal(body.upstreamStatus, 401);
          } finally {
            await server.close();
          }
        });
      } finally {
        await rejectingServer.close();
      }
    },
  );
});

test("POST /api/app/token/recheck returns no_token when no token is saved", async () => {
  const handler = createMonobankMockHttpHandler({
    clientInfo: okClientInfo(),
    currencyRates: [],
    statementByAccount: {},
  });

  await withMockMonobankServer(handler, async (mockBaseUrl) => {
    await withTempLedger(async ({ tempRoot }) => {
      const monobankTokenStore = createSessionMonobankTokenStore();
      // Intentionally do NOT save a token.

      const server = createLocalApiServer({
        profile: "demo",
        source: "monobank",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55803,
        monobankTokenStore,
        monobankBaseUrl: mockBaseUrl,
        validateMonobankTokenOnSave: false,
      });

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/app/token/recheck",
        });

        assert.equal(response.statusCode, 400);
        const body = response.json();
        assert.equal(body.error, "no_token");
        assert.match(body.message, /No Monobank token/);
      } finally {
        await server.close();
      }
    });
  });
});
