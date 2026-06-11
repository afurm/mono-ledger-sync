import type { LocalApiMonobankTokenStatus, LocalAppSnapshot } from "./api.js";
import type { RouteId } from "./navigation.js";

/**
 * Routes that must show the "Sign in with Monobank" empty-state prompt
 * when the user has no token saved. The Settings route hosts the
 * actual sign-in card and is exempt; the Help and Logs routes can
 * still render useful info even before sign-in, so they are also
 * exempt. Everything else (Overview, Transactions, Categories,
 * Budgets, Recurring, Reports, Accounts, Sync, Rules, Exports)
 * shows the prompt so the user is not fed fixture demo data.
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

/**
 * Decide whether the active route should render the first-run
 * "Sign in with Monobank" empty state instead of the route's normal
 * data view. The fixture source is developer-only and bypasses the
 * prompt so contributors and screenshots keep working.
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

  // The fixture source is an explicit developer opt-in. When it is
  // active we render fixture demo data exactly as before.
  if (snapshot.config.source === "fixture") {
    return false;
  }

  // Once a token is saved (regardless of source), the user has
  // progressed past the first-run greeting and the empty state is
  // no longer needed.
  if (snapshot.config.token.hasToken) {
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
  fixtureHint: string;
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
    fixtureHint:
      "Looking for the offline demo? Switch the source to 'fixture' in developer settings.",
    profile: token.profile,
    routeId,
  };
}
