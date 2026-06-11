import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFirstRunEmptyStateView,
  shouldShowFirstRunSignInPrompt,
} from "../dist/web/empty-state.js";

/**
 * @param {{
 *   profile?: string,
 *   source?: "fixture" | "monobank",
 *   hasToken?: boolean,
 * }} overrides
 */
function token(overrides) {
  return {
    profile: overrides.profile ?? "default",
    hasToken: overrides.hasToken ?? false,
    storage: "secure",
    persistence: "persistent",
  };
}

/**
 * @param {{
 *   profile?: string,
 *   source?: "fixture" | "monobank",
 *   hasToken?: boolean,
 * }} overrides
 */
function snapshot(overrides) {
  return {
    config: {
      profile: overrides.profile ?? "default",
      source: overrides.source ?? "monobank",
      dataDir: "/tmp/mono-ledger-sync",
      databasePath: "/tmp/mono-ledger-sync/ledger.sqlite",
      localOnly: true,
      webhook: {
        enabled: false,
        path: "/api/webhooks/monobank",
        host: "127.0.0.1",
        port: 3000,
        url: "http://127.0.0.1:3000/api/webhooks/monobank",
      },
      token: token({
        profile: overrides.profile,
        hasToken: overrides.hasToken,
      }),
    },
    summary: { accounts: 0, ledgerEntries: 0 },
    accounts: [],
    jars: [],
    savingsGoalProgress: [],
    categories: [],
    categoryRules: [],
    merchantCleanupRules: [],
    categorySpending: [],
    budgetProgress: [],
    upcomingRecurringPayments: [],
    transactions: {
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    },
    syncRuns: [],
    webhookEvents: [],
    activityEvents: [],
  };
}

test("shows prompt on Overview when no token is saved and source is monobank", () => {
  assert.equal(shouldShowFirstRunSignInPrompt("overview", snapshot({})), true);
});

test("shows prompt on Transactions, Accounts, Rules, Sync, and Exports when no token", () => {
  for (const route of [
    "transactions",
    "accounts",
    "rules",
    "sync",
    "exports",
  ]) {
    assert.equal(
      shouldShowFirstRunSignInPrompt(route, snapshot({})),
      true,
      `expected ${route} to show prompt`,
    );
  }
});

test("does NOT show prompt on Settings, Logs, or Help routes (gated routes only)", () => {
  for (const route of ["settings", "logs", "help"]) {
    assert.equal(
      shouldShowFirstRunSignInPrompt(route, snapshot({})),
      false,
      `expected ${route} to NOT show prompt`,
    );
  }
});

test("does NOT show prompt when a token is saved", () => {
  assert.equal(
    shouldShowFirstRunSignInPrompt("overview", snapshot({ hasToken: true })),
    false,
  );
  assert.equal(
    shouldShowFirstRunSignInPrompt(
      "transactions",
      snapshot({ hasToken: true }),
    ),
    false,
  );
});

test("does NOT show prompt when the source is fixture (developer opt-in)", () => {
  assert.equal(
    shouldShowFirstRunSignInPrompt("overview", snapshot({ source: "fixture" })),
    false,
  );
  assert.equal(
    shouldShowFirstRunSignInPrompt(
      "transactions",
      snapshot({ source: "fixture" }),
    ),
    false,
  );
});

test("does NOT show prompt when snapshot is undefined (loading state)", () => {
  assert.equal(shouldShowFirstRunSignInPrompt("overview", undefined), false);
});

test("buildFirstRunEmptyStateView exposes the developer portal link", () => {
  const view = buildFirstRunEmptyStateView(
    "transactions",
    token({ profile: "personal" }),
  );
  assert.equal(view.heading, "Sign in with Monobank to see this view");
  assert.equal(view.getTokenHref, "https://api.monobank.ua/");
  assert.match(view.description, /token/i);
  assert.equal(view.profile, "personal");
  assert.equal(view.routeId, "transactions");
  assert.match(view.openSettingsLabel, /Settings/);
  assert.match(view.fixtureHint, /fixture/);
});

test("empty state view never leaks token value or header names", () => {
  const view = buildFirstRunEmptyStateView(
    "overview",
    token({ profile: "personal" }),
  );
  const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /X-Token/);
  assert.doesNotMatch(serialized, /X-Key-Id/);
  assert.doesNotMatch(serialized, /X-Sign/);
  // The description intentionally uses the word "token" in
  // human-readable copy, but no raw token value can reach the view.
  assert.doesNotMatch(serialized, /[A-Za-z0-9_-]{20,}/);
});
