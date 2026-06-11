import assert from "node:assert/strict";
import test from "node:test";

import {
  MONOBANK_PUBLIC_TOKEN_URL,
  buildFirstRunSignInCardView,
} from "../dist/web/signin-card.js";

/**
 * @param {Partial<{
 *   profile: string,
 *   hasToken: boolean,
 *   storage: "secure" | "session",
 *   persistence: "persistent" | "session",
 *   fallbackReason: "secure_storage_unavailable" | "secure_storage_write_failed",
 *   clientInfo: {
 *     clientId: string,
 *     name: string,
 *     accounts: number,
 *     jars: number,
 *     masked: true,
 *   },
 * }>} overrides
 */
function token(overrides) {
  return {
    profile: overrides.profile ?? "default",
    hasToken: overrides.hasToken ?? false,
    storage: overrides.storage ?? "secure",
    persistence: overrides.persistence ?? "persistent",
    ...(overrides.fallbackReason !== undefined
      ? { fallbackReason: overrides.fallbackReason }
      : {}),
    ...(overrides.clientInfo !== undefined
      ? { clientInfo: overrides.clientInfo }
      : {}),
  };
}

test("MONOBANK_PUBLIC_TOKEN_URL points to the developer portal", () => {
  assert.equal(MONOBANK_PUBLIC_TOKEN_URL, "https://api.monobank.ua/");
});

test("missing-token greeting leads with Sign in with Monobank", () => {
  const view = buildFirstRunSignInCardView(
    token({ profile: "personal", hasToken: false }),
  );
  assert.equal(view.heading, "Sign in with Monobank");
  assert.equal(view.ctaLabel, "Get token on api.monobank.ua");
  assert.equal(view.ctaHref, MONOBANK_PUBLIC_TOKEN_URL);
  assert.equal(view.inventoryStatus, "missing");
  assert.equal(view.inventoryLabel, "No token saved");
  assert.equal(view.hasToken, false);
  assert.equal(view.profile, "personal");
  assert.match(view.description, /Paste a personal API token from Monobank/);
  assert.match(view.description, /local workspace/);
});

test("saved token without clientInfo shows awaiting-sync state", () => {
  const view = buildFirstRunSignInCardView(
    token({ profile: "personal", hasToken: true }),
  );
  assert.equal(view.heading, "Monobank is connected");
  assert.equal(view.inventoryStatus, "awaiting-sync");
  assert.equal(view.inventoryLabel, "Awaiting first sync");
  assert.equal(view.ctaLabel, "Re-check Monobank connection");
  assert.equal(view.ctaHref, MONOBANK_PUBLIC_TOKEN_URL);
  assert.equal(view.hasToken, true);
  assert.match(view.description, /Run a sync/);
});

test("saved token with accounts shows live masked inventory summary", () => {
  const view = buildFirstRunSignInCardView(
    token({
      profile: "personal",
      hasToken: true,
      clientInfo: {
        clientId: "abc123",
        name: "Andrii F.",
        accounts: 3,
        jars: 1,
        masked: true,
      },
    }),
  );
  assert.equal(view.heading, "Monobank is connected");
  assert.equal(view.inventoryStatus, "live");
  assert.equal(view.inventoryLabel, "Live inventory");
  assert.equal(
    view.description,
    "Monobank account: Andrii F. · 3 accounts · 1 jars",
  );
  assert.equal(view.hasToken, true);
});

test("saved token with zero accounts falls back to awaiting-sync copy", () => {
  const view = buildFirstRunSignInCardView(
    token({
      profile: "personal",
      hasToken: true,
      clientInfo: {
        clientId: "abc123",
        name: "Andrii F.",
        accounts: 0,
        jars: 0,
        masked: true,
      },
    }),
  );
  assert.equal(view.inventoryStatus, "awaiting-sync");
  assert.equal(view.inventoryLabel, "Awaiting first sync");
  assert.equal(view.hasToken, true);
  assert.match(view.description, /Run a sync/);
});

test("view model never leaks token value, only masked counts", () => {
  const view = buildFirstRunSignInCardView(
    token({
      profile: "personal",
      hasToken: true,
      clientInfo: {
        clientId: "abc123",
        name: "Andrii F.",
        accounts: 3,
        jars: 1,
        masked: true,
      },
    }),
  );
  const serialized = JSON.stringify(view);
  // The "token" word may legitimately appear in user-facing copy, but the
  // X-Token header name and any raw token value (e.g. the clientId in
  // clientInfo) must never reach the view model.
  assert.doesNotMatch(serialized, /X-Token/);
  assert.doesNotMatch(serialized, /X-Key-Id/);
  assert.doesNotMatch(serialized, /X-Sign/);
  assert.doesNotMatch(serialized, /abc123/);
  // The masked name is allowed; the description must be human-readable.
  assert.match(serialized, /Andrii F\./);
});
