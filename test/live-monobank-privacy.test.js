import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createMonobankHttpAdapter } from "../dist/monobank/index.js";
import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";
import { createMonobankMockServer } from "./monobank-mock-server.js";

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-priv2-"));

  try {
    return await callback({ tempRoot });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

test("recheck path does not log live token, X-Token header, or partial-error payload", async () => {
  const fakeToken = "live-recheck-token-zzzz9999xxxx";
  const leakedEmail = "leaked.user@example.invalid";
  const leakedCard = "4444333322221111";

  // A "partial error" response: a 401 with a JSON body that
  // contains sensitive-looking content. The local log sink must
  // not see the token, the X-Token header name, or the body
  // contents.
  const server = createMonobankMockServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    if (requestUrl.pathname === "/personal/client-info") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          errorDescription: `Account ${leakedEmail} / card ${leakedCard} blocked`,
        }),
      );
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"message":"not found"}');
  });

  try {
    const baseUrl = await server.listen();

    await withTempLedger(async ({ tempRoot }) => {
      const logs = [];
      const monobankTokenStore = createSessionMonobankTokenStore();
      await monobankTokenStore.setToken("demo", fakeToken);

      const localServer = createLocalApiServer({
        profile: "demo",
        source: "monobank",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55901,
        monobankTokenStore,
        monobankBaseUrl: baseUrl,
        validateMonobankTokenOnSave: false,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: fakeToken,
          baseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
        logSink: (line) => logs.push(line),
      });

      try {
        const recheckResponse = await localServer.inject({
          method: "POST",
          url: "/api/app/token/recheck",
        });

        assert.equal(recheckResponse.statusCode, 400);

        const joinedLogs = logs.join("\n");

        // 1. Live token value must never appear in logs.
        assert.doesNotMatch(joinedLogs, new RegExp(fakeToken));
        // 2. The X-Token header name (any case) must never appear.
        assert.doesNotMatch(joinedLogs, /X-Token/i);
        assert.doesNotMatch(joinedLogs, /x-token/i);
        // 3. The response payload content (leaked email/card) must
        //    not appear in logs.
        assert.doesNotMatch(joinedLogs, new RegExp(leakedEmail));
        assert.doesNotMatch(joinedLogs, new RegExp(leakedCard));
      } finally {
        await localServer.close();
      }
    });
  } finally {
    await server.close();
  }
});

test("recheck success path does not log live token or X-Token header", async () => {
  const fakeToken = "live-recheck-success-token-aaaa1111bbbb";

  const server = createMonobankMockServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    if (requestUrl.pathname === "/personal/client-info") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          clientId: "client-recheck-ok",
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
          jars: [],
        }),
      );
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"message":"not found"}');
  });

  try {
    const baseUrl = await server.listen();

    await withTempLedger(async ({ tempRoot }) => {
      const logs = [];
      const monobankTokenStore = createSessionMonobankTokenStore();
      await monobankTokenStore.setToken("demo", fakeToken);

      const localServer = createLocalApiServer({
        profile: "demo",
        source: "monobank",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55902,
        monobankTokenStore,
        monobankBaseUrl: baseUrl,
        validateMonobankTokenOnSave: false,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: fakeToken,
          baseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
        logSink: (line) => logs.push(line),
      });

      try {
        const recheckResponse = await localServer.inject({
          method: "POST",
          url: "/api/app/token/recheck",
        });

        assert.equal(recheckResponse.statusCode, 200);

        const joinedLogs = logs.join("\n");

        assert.doesNotMatch(joinedLogs, new RegExp(fakeToken));
        assert.doesNotMatch(joinedLogs, /X-Token/i);
        assert.doesNotMatch(joinedLogs, /x-token/i);
        // The successful path must still log the re-check event
        // (so an operator can see the probe ran), but without
        // exposing the token or the header name.
        assert.match(joinedLogs, /Monobank client-info re-checked/);
      } finally {
        await localServer.close();
      }
    });
  } finally {
    await server.close();
  }
});

test("partial-error response body never reaches the local log sink", async () => {
  const fakeToken = "live-partial-error-token-qqqq7777rrrr";
  const sensitiveBody = "PARTIAL-ERROR-BODY-MARKER-XYZZY-12345";

  const server = createMonobankMockServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    if (requestUrl.pathname === "/personal/client-info") {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          errorDescription: `Upstream failed: ${sensitiveBody}`,
          stack: "secret-stack-trace-should-not-leak",
        }),
      );
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"message":"not found"}');
  });

  try {
    const baseUrl = await server.listen();

    await withTempLedger(async ({ tempRoot }) => {
      const logs = [];
      const monobankTokenStore = createSessionMonobankTokenStore();
      await monobankTokenStore.setToken("demo", fakeToken);

      const localServer = createLocalApiServer({
        profile: "demo",
        source: "monobank",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55903,
        monobankTokenStore,
        monobankBaseUrl: baseUrl,
        validateMonobankTokenOnSave: false,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: fakeToken,
          baseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
        logSink: (line) => logs.push(line),
      });

      try {
        await localServer.inject({
          method: "POST",
          url: "/api/app/token/recheck",
        });

        const joinedLogs = logs.join("\n");

        assert.doesNotMatch(joinedLogs, new RegExp(sensitiveBody));
        assert.doesNotMatch(joinedLogs, /secret-stack-trace-should-not-leak/);
        assert.doesNotMatch(joinedLogs, new RegExp(fakeToken));
      } finally {
        await localServer.close();
      }
    });
  } finally {
    await server.close();
  }
});
