import { createServer } from "node:http";

export function createMonobankMockHttpHandler({
  clientInfo,
  currencyRates,
  statementByAccount = {},
  provider = {},
  onWebhook,
  onRequest,
}) {
  return async (request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const pathname = requestUrl.pathname;
    const endpoint = `${request.method} ${pathname}`;
    const hasProviderHeaders = Boolean(
      request.headers["x-sign"] || request.headers["x-key-id"],
    );

    onRequest?.({
      endpoint,
      method: request.method,
      path: pathname,
      headers: request.headers,
    });

    function requireProviderSignature() {
      if (
        !request.headers["x-time"] ||
        !request.headers["x-sign"] ||
        (provider.requireKeyId !== false && !request.headers["x-key-id"])
      ) {
        response.writeHead(401, { "content-type": "application/json" });
        response.end('{"message":"missing provider signature headers"}');
        return false;
      }

      return true;
    }

    function writeJson(statusCode, payload) {
      response.writeHead(statusCode, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    }

    if (
      pathname === "/personal/auth/registration" &&
      request.method === "POST"
    ) {
      if (!request.headers["x-time"] || !request.headers["x-sign"]) {
        writeJson(401, { message: "missing provider registration signature" });
        return;
      }

      writeJson(
        200,
        provider.registration ?? {
          status: "New",
        },
      );
      return;
    }

    if (
      pathname === "/personal/auth/registration/status" &&
      (request.method === "GET" || request.method === "POST")
    ) {
      if (!request.headers["x-time"] || !request.headers["x-sign"]) {
        writeJson(401, { message: "missing provider registration signature" });
        return;
      }

      writeJson(
        200,
        provider.registrationStatus ?? {
          status: "Approved",
          keyId: "mock-provider-key",
        },
      );
      return;
    }

    if (pathname === "/personal/corp/settings" && request.method === "GET") {
      if (!requireProviderSignature()) {
        return;
      }

      writeJson(
        200,
        provider.settings ?? {
          id: "mock-provider",
          pubkey: "mock-provider-public-key",
          name: "Mock provider",
          permission: "psf",
          logo: "",
        },
      );
      return;
    }

    if (pathname === "/personal/auth/request") {
      if (!requireProviderSignature()) {
        return;
      }

      writeJson(
        200,
        request.method === "POST"
          ? (provider.accessRequest ?? {
              tokenRequestId: "mock-token-request",
              acceptUrl: "https://mbnk.app/auth/mock-token-request",
            })
          : (provider.accessRequestStatus ?? {
              requestId: "mock-access-request",
              status: "Approved",
            }),
      );
      return;
    }

    if (pathname === "/personal/client-info" && hasProviderHeaders) {
      if (!requireProviderSignature()) {
        return;
      }

      writeJson(200, provider.clientInfo ?? clientInfo);
      return;
    }

    if (pathname === "/personal/client-info") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(clientInfo));
      return;
    }

    if (pathname === "/bank/currency") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(currencyRates));
      return;
    }

    if (pathname.startsWith("/personal/statement/")) {
      const [segmentSource, segmentStatements, accountId, from, to] = pathname
        .split("/")
        .filter(Boolean);

      if (
        segmentSource !== "personal" ||
        segmentStatements !== "statement" ||
        request.method !== "GET" ||
        !accountId ||
        !from ||
        !to
      ) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end('{"message":"not found"}');
        return;
      }

      const fromSec = Number(from);
      const toSec = Number(to);
      const sourceStatements = hasProviderHeaders
        ? (provider.statementByAccount?.[decodeURIComponent(accountId)] ??
          statementByAccount[decodeURIComponent(accountId)] ??
          [])
        : (statementByAccount[decodeURIComponent(accountId)] ?? []);
      const filtered = sourceStatements.filter(
        (statementItem) =>
          statementItem.time >= fromSec && statementItem.time <= toSec,
      );

      if (hasProviderHeaders && !requireProviderSignature()) {
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(filtered));
      return;
    }

    if (pathname === "/personal/webhook" && request.method === "POST") {
      if (onWebhook) {
        await onWebhook(request, response);
        return;
      }

      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"message":"not found"}');
  };
}

export function createMonobankMockServer(handler) {
  const server = createServer(handler);
  let baseUrl;

  return {
    get url() {
      if (baseUrl === undefined) {
        throw new Error("Monobank mock server has not started.");
      }

      return baseUrl;
    },
    async listen() {
      if (baseUrl !== undefined) {
        return baseUrl;
      }

      const port = await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();

          resolve(address.port);
        });
      });

      baseUrl = `http://127.0.0.1:${port}`;

      return baseUrl;
    },
    async close() {
      if (baseUrl === undefined) {
        return;
      }

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      baseUrl = undefined;
    },
  };
}

export async function withMockMonobankServer(handler, callback) {
  const mockServer = createMonobankMockServer(handler);

  try {
    const baseUrl = await mockServer.listen();

    return await callback(baseUrl);
  } finally {
    await mockServer.close();
  }
}
