import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultMonobankTokenStore,
  createSessionMonobankTokenStore,
} from "../dist/security/index.js";

test("session monobank token store keeps tokens per profile", async () => {
  const store = createSessionMonobankTokenStore();

  await store.setToken("demo", "demo-token");
  await store.setToken("other", "other-token");

  assert.equal(await store.getToken("demo"), "demo-token");
  assert.equal(await store.getToken("other"), "other-token");

  await store.deleteToken("demo");

  assert.equal(await store.getToken("demo"), undefined);
  assert.equal(await store.getToken("other"), "other-token");
});

test("default monobank token store uses session storage on darwin until a safe Keychain bridge exists", async () => {
  const calls = [];
  const store = createDefaultMonobankTokenStore({
    platform: "darwin",
    async runCommand(file, args) {
      calls.push({ file, args });

      return { stdout: "", stderr: "" };
    },
  });

  await store.setToken("demo", "saved-token");
  assert.equal(await store.getToken("demo"), "saved-token");
  await store.deleteToken("demo");

  assert.equal(await store.getToken("demo"), undefined);
  assert.deepEqual(calls, []);
});

test("default monobank token store passes token through stdin for Linux Secret Service", async () => {
  const calls = [];
  const store = createDefaultMonobankTokenStore({
    platform: "linux",
    serviceName: "test-ledger-token-store",
    async runCommand(file, args, options) {
      calls.push({ file, args, input: options?.input });

      if (args[0] === "lookup") {
        return { stdout: "stored-token\n", stderr: "" };
      }

      return { stdout: "", stderr: "" };
    },
  });

  await store.setToken("demo", "saved-token");
  assert.equal(await store.getToken("demo"), "stored-token");
  await store.deleteToken("demo");

  assert.deepEqual(calls, [
    {
      file: "secret-tool",
      args: [
        "store",
        "--label",
        "test-ledger-token-store Monobank token (demo)",
        "application",
        "test-ledger-token-store",
        "kind",
        "monobank-token",
        "profile",
        "demo",
      ],
      input: "saved-token",
    },
    {
      file: "secret-tool",
      args: [
        "lookup",
        "application",
        "test-ledger-token-store",
        "kind",
        "monobank-token",
        "profile",
        "demo",
      ],
      input: undefined,
    },
    {
      file: "secret-tool",
      args: [
        "clear",
        "application",
        "test-ledger-token-store",
        "kind",
        "monobank-token",
        "profile",
        "demo",
      ],
      input: undefined,
    },
  ]);
});

test("default monobank token store falls back to session storage when secure write fails", async () => {
  const store = createDefaultMonobankTokenStore({
    platform: "linux",
    async runCommand(_file, args) {
      if (args[0] === "lookup") {
        return { stdout: "stale-secure-token\n", stderr: "" };
      }

      throw new Error("secure store unavailable");
    },
  });

  await store.setToken("demo", "session-token");

  assert.equal(await store.getToken("demo"), "session-token");
});
