import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { maskIdentifier, redactSensitiveText } from "../dist/privacy/index.js";
import { createMonobankHttpAdapter } from "../dist/monobank/index.js";
import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";
import { createMonobankMockServer } from "./monobank-mock-server.js";

async function withTempLedger(callback) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-priv-"));

  try {
    return await callback({ tempRoot });
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

test("redacts tokens, headers, account identifiers, and raw payload fields", () => {
  const redacted = redactSensitiveText(
    [
      "X-Token: live-secret-token",
      "Authorization: Bearer another-secret",
      "iban UA213223130000026007233566001",
      "card 4444333322221111",
      '{"counterName":"Private Person","counterIban":"UA213223130000026007233566001","payloadJson":{"amount":100}}',
    ].join("\n"),
    {
      secrets: ["live-secret-token", "another-secret"],
    },
  );

  assert.doesNotMatch(redacted, /live-secret-token/);
  assert.doesNotMatch(redacted, /another-secret/);
  assert.doesNotMatch(redacted, /UA213223130000026007233566001/);
  assert.doesNotMatch(redacted, /4444333322221111/);
  assert.doesNotMatch(redacted, /Private Person/);
  assert.match(redacted, /X-Token: \[redacted\]/);
  assert.match(redacted, /Authorization: \[redacted\]/);
});

test("masks stable identifiers without exposing full values", () => {
  assert.equal(maskIdentifier("fixture-client-primary"), "fixt...mary");
  assert.equal(maskIdentifier("short"), "*****");
});

test("token validation probe does not log live token, X-Token header, or response payload", async () => {
  const fakeToken = "live-secret-monobank-token-aaaa1111bbbb";
  const fakeResponseToken = "live-response-token-aaaa1111bbbb";

  const server = createMonobankMockServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    if (requestUrl.pathname === "/personal/client-info") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          errorDescription: `Invalid token: ${fakeResponseToken}`,
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
      const localServer = createLocalApiServer({
        profile: "demo",
        source: "monobank",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55710,
        monobankTokenStore,
        monobankBaseUrl: baseUrl,
        validateMonobankTokenOnSave: true,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: fakeToken,
          baseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
        logSink: (line) => logs.push(line),
      });

      try {
        const saveResponse = await localServer.inject({
          method: "POST",
          url: "/api/app/token",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: "demo",
            token: fakeToken,
          }),
        });

        assert.equal(saveResponse.statusCode, 400);

        const joinedLogs = logs.join("\n");

        assert.doesNotMatch(joinedLogs, new RegExp(fakeToken));
        assert.doesNotMatch(joinedLogs, /X-Token: live-secret/);
        assert.doesNotMatch(joinedLogs, new RegExp(fakeResponseToken));
      } finally {
        await localServer.close();
      }
    });
  } finally {
    await server.close();
  }
});

test("token validation probe failure is logged at warn level with upstream status", async () => {
  const server = createMonobankMockServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    if (requestUrl.pathname === "/personal/client-info") {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(JSON.stringify({ errorDescription: "Forbidden" }));
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
      const localServer = createLocalApiServer({
        profile: "demo",
        source: "monobank",
        dataDir: tempRoot,
        host: "127.0.0.1",
        port: 55711,
        monobankTokenStore,
        monobankBaseUrl: baseUrl,
        validateMonobankTokenOnSave: true,
        monobankTokenProbeAdapter: createMonobankHttpAdapter({
          token: "forbidden-token",
          baseUrl,
          maxRetries: 0,
          timeoutMs: 5000,
        }),
        logSink: (line) => logs.push(line),
      });

      try {
        const saveResponse = await localServer.inject({
          method: "POST",
          url: "/api/app/token",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: "demo",
            token: "forbidden-token",
          }),
        });

        assert.equal(saveResponse.statusCode, 400);
        assert.equal(saveResponse.json().upstreamStatus, 403);

        const probeLog = logs.find((line) =>
          /Monobank token was not saved/.test(line),
        );
        assert.ok(probeLog, "expected a probe_failed warn log line");
        assert.match(probeLog, /\[WARN\]/);
        assert.match(probeLog, /"upstreamStatus":403/);
        assert.doesNotMatch(probeLog, /forbidden-token/);
      } finally {
        await localServer.close();
      }
    });
  } finally {
    await server.close();
  }
});
