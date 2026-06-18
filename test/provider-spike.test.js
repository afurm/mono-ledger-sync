import assert from "node:assert/strict";
import test from "node:test";

import {
  createMonobankProviderSignedHeaders,
  createMonobankProviderSignaturePayload,
  getMonobankProviderPublicKeyHex,
  signMonobankProviderRequest,
  verifyMonobankProviderSignature,
} from "../dist/monobank/index.js";
import { createMonobankMockHttpHandler } from "./monobank-mock-server.js";
import { withMockMonobankServer } from "./monobank-mock-server.js";

const goldenPrivateKeyHex =
  "0000000000000000000000000000000000000000000000000000000000000001";
const goldenPublicKeyHex =
  "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" +
  "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";
const goldenPayload = "1700000000|/api/test";
const goldenSignatureBase64 =
  "GEcTDKXTVpBgOm9yWSJTvneUCCIUFyzXv1KB4/yG5zhDVj7QThwwlZM4fQU/yfE6J0NDTFuZlFa4zsY7job3BA==";

function okClientInfo() {
  return {
    clientId: "provider-client-demo",
    name: "Fixture Provider Client",
    accounts: [
      {
        id: "provider-account-uah",
        balance: 100000,
        creditLimit: 0,
        type: "fop",
        currencyCode: 980,
      },
    ],
  };
}

test("provider signing helper produces the golden secp256k1 signature", () => {
  const payload = createMonobankProviderSignaturePayload({
    time: 1700000000,
    url: "https://api.monobank.ua/api/test",
  });
  const signatureBase64 = signMonobankProviderRequest({
    privateKeyHex: goldenPrivateKeyHex,
    time: 1700000000,
    url: "/api/test",
  });

  assert.equal(payload, goldenPayload);
  assert.equal(
    getMonobankProviderPublicKeyHex(goldenPrivateKeyHex),
    goldenPublicKeyHex,
  );
  assert.equal(signatureBase64, goldenSignatureBase64);
  assert.equal(Buffer.from(signatureBase64, "base64").length, 64);
  assert.equal(
    verifyMonobankProviderSignature({
      publicKeyHex: goldenPublicKeyHex,
      signatureBase64,
      time: 1700000000,
      url: "/api/test",
    }),
    true,
  );
  assert.equal(
    verifyMonobankProviderSignature({
      publicKeyHex: goldenPublicKeyHex,
      signatureBase64,
      time: 1700000001,
      url: "/api/test",
    }),
    false,
  );
});

test("provider signed headers preserve request id and path query", () => {
  const headers = createMonobankProviderSignedHeaders({
    keyId: "mock-provider-key",
    privateKeyHex: goldenPrivateKeyHex,
    requestId: "request-123",
    time: "1700000000",
    url: "https://api.monobank.ua/personal/client-info?clientId=demo",
  });

  assert.equal(headers["X-Key-Id"], "mock-provider-key");
  assert.equal(headers["X-Time"], "1700000000");
  assert.equal(headers["X-Request-Id"], "request-123");
  assert.equal(Buffer.from(headers["X-Sign"], "base64").length, 64);
  assert.equal(
    verifyMonobankProviderSignature({
      publicKeyHex: goldenPublicKeyHex,
      signatureBase64: headers["X-Sign"],
      requestId: "request-123",
      time: "1700000000",
      url: "/personal/client-info?clientId=demo",
    }),
    true,
  );
});

test("mock Monobank server covers provider registration, access, client-info, and statement calls", async () => {
  const statement = [
    {
      id: "provider-statement-1",
      time: 1775001600,
      description: "Provider fixture statement",
      mcc: 4900,
      originalMcc: 4900,
      amount: -12000,
      operationAmount: -12000,
      currencyCode: 980,
      commissionRate: 0,
      cashbackAmount: 0,
      balance: 88000,
      hold: false,
    },
  ];
  const handler = createMonobankMockHttpHandler({
    clientInfo: okClientInfo(),
    currencyRates: [],
    statementByAccount: {},
    provider: {
      clientInfo: okClientInfo(),
      statementByAccount: {
        "provider-account-uah": statement,
      },
    },
  });

  await withMockMonobankServer(handler, async (baseUrl) => {
    const registrationHeaders = createMonobankProviderSignedHeaders({
      privateKeyHex: goldenPrivateKeyHex,
      time: "1700000000",
      url: "/personal/auth/registration",
    });
    const requestHeaders = createMonobankProviderSignedHeaders({
      keyId: "mock-provider-key",
      privateKeyHex: goldenPrivateKeyHex,
      requestId: "request-123",
      time: "1700000001",
      url: "/personal/auth/request",
    });
    const clientInfoHeaders = createMonobankProviderSignedHeaders({
      keyId: "mock-provider-key",
      privateKeyHex: goldenPrivateKeyHex,
      requestId: "request-124",
      time: "1700000002",
      url: "/personal/client-info",
    });
    const statementHeaders = createMonobankProviderSignedHeaders({
      keyId: "mock-provider-key",
      privateKeyHex: goldenPrivateKeyHex,
      requestId: "request-125",
      time: "1700000003",
      url: "/personal/statement/provider-account-uah/1775001600/1775001600",
    });
    const settingsHeaders = createMonobankProviderSignedHeaders({
      keyId: "mock-provider-key",
      privateKeyHex: goldenPrivateKeyHex,
      requestId: "request-126",
      time: "1700000004",
      url: "/personal/corp/settings",
    });

    const registration = await fetch(`${baseUrl}/personal/auth/registration`, {
      method: "POST",
      headers: registrationHeaders,
    });
    const registrationStatus = await fetch(
      `${baseUrl}/personal/auth/registration/status`,
      {
        method: "POST",
        headers: registrationHeaders,
      },
    );
    const accessRequest = await fetch(`${baseUrl}/personal/auth/request`, {
      method: "POST",
      headers: requestHeaders,
    });
    const accessStatus = await fetch(`${baseUrl}/personal/auth/request`, {
      method: "GET",
      headers: requestHeaders,
    });
    const settings = await fetch(`${baseUrl}/personal/corp/settings`, {
      headers: settingsHeaders,
    });
    const clientInfo = await fetch(`${baseUrl}/personal/client-info`, {
      headers: clientInfoHeaders,
    });
    const providerStatement = await fetch(
      `${baseUrl}/personal/statement/provider-account-uah/1775001600/1775001600`,
      {
        headers: statementHeaders,
      },
    );

    assert.equal(registration.status, 200);
    assert.equal((await registration.json()).status, "New");
    assert.equal(registrationStatus.status, 200);
    assert.deepEqual(await registrationStatus.json(), {
      status: "Approved",
      keyId: "mock-provider-key",
    });
    assert.equal(accessRequest.status, 200);
    assert.deepEqual(await accessRequest.json(), {
      tokenRequestId: "mock-token-request",
      acceptUrl: "https://mbnk.app/auth/mock-token-request",
    });
    assert.equal(accessStatus.status, 200);
    assert.deepEqual(await accessStatus.json(), {
      requestId: "mock-access-request",
      status: "Approved",
    });
    assert.equal(settings.status, 200);
    assert.equal((await settings.json()).name, "Mock provider");
    assert.equal(clientInfo.status, 200);
    assert.equal((await clientInfo.json()).clientId, "provider-client-demo");
    assert.equal(providerStatement.status, 200);
    assert.deepEqual(await providerStatement.json(), statement);
  });
});
