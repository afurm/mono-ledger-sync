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
 *   accounts?: number,
 *   ledgerEntries?: number,
 *   jars?: number,
 *   savingsGoalProgress?: number,
 * }} overrides
 */
function snapshot(overrides) {
  const accountCount = overrides.accounts ?? 0;
  const ledgerEntryCount = overrides.ledgerEntries ?? 0;
  const jarCount = overrides.jars ?? 0;
  const savingsGoalProgressCount = overrides.savingsGoalProgress ?? 0;

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
    summary: { accounts: accountCount, ledgerEntries: ledgerEntryCount },
    accounts: Array.from({ length: accountCount }, (_, index) => ({
      id: `account-${index}`,
    })),
    jars: Array.from({ length: jarCount }, (_, index) => ({
      id: `jar-${index}`,
    })),
    savingsGoalProgress: Array.from(
      { length: savingsGoalProgressCount },
      (_, index) => ({
        id: `goal-${index}`,
      }),
    ),
    categories: [],
    categoryRules: [],
    merchantCleanupRules: [],
    categorySpending: [],
    budgetProgress: [],
    upcomingRecurringPayments: [],
    transactions: {
      entries: Array.from({ length: ledgerEntryCount }, (_, index) => ({
        id: `entry-${index}`,
      })),
      total: ledgerEntryCount,
      limit: 25,
      offset: 0,
    },
    syncRuns: [],
    webhookEvents: [],
    activityEvents: [],
  };
}

test("shows prompt on Overview when no token is saved, source is monobank, and no local ledger data exists", () => {
  assert.equal(shouldShowFirstRunSignInPrompt("overview", snapshot({})), true);
});

test("shows prompt on finance workspace routes when no token", () => {
  for (const route of [
    "transactions",
    "categories",
    "budgets",
    "recurring",
    "reports",
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

test("does NOT show prompt when local ledger data already exists", () => {
  for (const seededSnapshot of [
    snapshot({ accounts: 1 }),
    snapshot({ ledgerEntries: 1 }),
    snapshot({ jars: 1 }),
    snapshot({ savingsGoalProgress: 1 }),
  ]) {
    assert.equal(
      shouldShowFirstRunSignInPrompt("overview", seededSnapshot),
      false,
    );
    assert.equal(
      shouldShowFirstRunSignInPrompt("transactions", seededSnapshot),
      false,
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
  assert.equal(
    view.heading,
    "Увійдіть через Monobank, щоб переглянути цей розділ",
  );
  assert.equal(view.getTokenHref, "https://api.monobank.ua/");
  assert.match(view.description, /токена Monobank/);
  assert.equal(view.profile, "personal");
  assert.equal(view.routeId, "transactions");
  assert.match(view.openSettingsLabel, /налаштування/);
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
