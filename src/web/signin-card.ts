import type { LocalApiMonobankTokenStatus } from "./api-types.js";
import { messages } from "./i18n.js";

/**
 * Public Monobank developer portal URL. The local product links here
 * from the first-run greeting so a new user can copy a fresh personal
 * API token. This is a marketing/portal page, not the API host used by
 * the adapter (`https://api.monobank.ua`).
 */
export const MONOBANK_PUBLIC_TOKEN_URL = "https://api.monobank.ua/";

export interface FirstRunSignInCardView {
  heading: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  inventoryStatus: "missing" | "awaiting-sync" | "live";
  inventoryLabel: string;
  hasToken: boolean;
  profile: string;
}

/**
 * Compute the first-run sign-in card view model from a Monobank token
 * status. The greeting is the lead card for any new user without a
 * saved token, and the "connected" view is shown after a successful
 * save.
 *
 * Extracted as a pure function so the rendering stays testable without
 * spinning up a React renderer.
 */
export function buildFirstRunSignInCardView(
  token: LocalApiMonobankTokenStatus,
): FirstRunSignInCardView {
  const profile = token.profile;
  const hasToken = token.hasToken;
  const clientInfo = token.clientInfo;

  if (!hasToken) {
    return {
      heading: messages.firstRun.missingHeading,
      description: messages.firstRun.missingDescription,
      ctaLabel: messages.firstRun.getTokenLabel,
      ctaHref: MONOBANK_PUBLIC_TOKEN_URL,
      inventoryStatus: "missing",
      inventoryLabel: messages.firstRun.noTokenSaved,
      hasToken: false,
      profile,
    };
  }

  const accounts = clientInfo?.accounts ?? 0;
  const jars = clientInfo?.jars ?? 0;
  const name = clientInfo?.name ?? "—";

  if (clientInfo === undefined || accounts === 0) {
    return {
      heading: messages.firstRun.connectedHeading,
      description: messages.firstRun.awaitingSyncDescription,
      ctaLabel: messages.firstRun.recheckConnectionLabel,
      ctaHref: MONOBANK_PUBLIC_TOKEN_URL,
      inventoryStatus: "awaiting-sync",
      inventoryLabel: messages.firstRun.awaitingFirstSync,
      hasToken: true,
      profile,
    };
  }

  return {
    heading: messages.firstRun.connectedHeading,
    description: messages.firstRun.liveDescription(name, accounts, jars),
    ctaLabel: messages.firstRun.recheckConnectionLabel,
    ctaHref: MONOBANK_PUBLIC_TOKEN_URL,
    inventoryStatus: "live",
    inventoryLabel: messages.firstRun.liveInventory,
    hasToken: true,
    profile,
  };
}
