import { createServer } from "node:http";

export function createMonobankMockHttpHandler({
  clientInfo,
  currencyRates,
  statementByAccount = {},
  onWebhook,
  onRequest,
}) {
  return async (request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const pathname = requestUrl.pathname;
    const endpoint = `${request.method} ${pathname}`;

    onRequest?.({
      endpoint,
      method: request.method,
      path: pathname,
      headers: request.headers,
    });

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
      const sourceStatements =
        statementByAccount[decodeURIComponent(accountId)] ?? [];
      const filtered = sourceStatements.filter(
        (statementItem) =>
          statementItem.time >= fromSec && statementItem.time <= toSec,
      );

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
