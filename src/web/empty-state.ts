import type {
  LocalApiMonobankTokenStatus,
  LocalAppSnapshot,
} from "./api-types.js";
import type { RouteId } from "./navigation.js";

/**
 * Routes that must show the "Sign in with Monobank" empty-state prompt
 * when the user has no token saved and no local Monobank data exists yet.
 * The Settings route hosts the actual sign-in card and is exempt; the Help
 * and Logs routes can still render useful info even before sign-in, so they
 * are also exempt.
 */
const SIGNIN_GATED_ROUTES = new Set<RouteId>([
  "overview",
  "transactions",
  "categories",
  "budgets",
  "recurring",
  "reports",
  "accounts",
  "sync",
  "rules",
  "exports",
]);

function hasLocalLedgerData(snapshot: LocalAppSnapshot): boolean {
  return (
    snapshot.summary.accounts > 0 ||
    snapshot.summary.ledgerEntries > 0 ||
    snapshot.accounts.length > 0 ||
    snapshot.jars.length > 0 ||
    snapshot.savingsGoalProgress.length > 0 ||
    snapshot.transactions.total > 0 ||
    snapshot.transactions.entries.length > 0
  );
}

/**
 * Decide whether the active route should render the first-run
 * "Sign in with Monobank" empty state instead of the route's normal
 * data view. Explicit fixture mode remains a development-only source
 * and bypasses the prompt so contributor workflows keep working. A profile
 * with existing local ledger rows is no longer first-run, even if the current
 * server session cannot see a saved token.
 *
 * Extracted as a pure function so it can be unit-tested without
 * React.
 */
export function shouldShowFirstRunSignInPrompt(
  routeId: RouteId,
  snapshot: LocalAppSnapshot | undefined,
): boolean {
  if (snapshot === undefined) {
    return false;
  }

  if (!SIGNIN_GATED_ROUTES.has(routeId)) {
    return false;
  }

  // Explicit fixture mode is a development-only opt-in.
  if (snapshot.config.source === "fixture") {
    return false;
  }

  // Once a token is saved (regardless of source), the user has
  // progressed past the first-run greeting and the empty state is
  // no longer needed.
  if (snapshot.config.token.hasToken) {
    return false;
  }

  if (hasLocalLedgerData(snapshot)) {
    return false;
  }

  return true;
}

/**
 * Build the view model for the first-run empty state card. The
 * returned object is consumed by the React component but is also
 * fully unit-testable in plain Node.
 */
export interface FirstRunEmptyStateView {
  heading: string;
  description: string;
  getTokenLabel: string;
  getTokenHref: string;
  openSettingsLabel: string;
  profile: string;
  routeId: RouteId;
}

export function buildFirstRunEmptyStateView(
  routeId: RouteId,
  token: LocalApiMonobankTokenStatus,
): FirstRunEmptyStateView {
  return {
    heading: "Sign in with Monobank to see this view",
    description:
      "This screen needs a saved Monobank token to load real accounts, jars, transactions, and statements. The token stays on this device and is never sent anywhere else.",
    getTokenLabel: "Get token on api.monobank.ua",
    getTokenHref: "https://api.monobank.ua/",
    openSettingsLabel: "Open Settings to paste token",
    profile: token.profile,
    routeId,
  };
}
