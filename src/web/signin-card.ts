import type { LocalApiMonobankTokenStatus } from "./api-types.js";

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
      heading: "Sign in with Monobank",
      description:
        "Paste a personal API token from Monobank to load your real accounts, jars, and statements into this local workspace. The token stays on this device.",
      ctaLabel: "Get token on api.monobank.ua",
      ctaHref: MONOBANK_PUBLIC_TOKEN_URL,
      inventoryStatus: "missing",
      inventoryLabel: "No token saved",
      hasToken: false,
      profile,
    };
  }

  const accounts = clientInfo?.accounts ?? 0;
  const jars = clientInfo?.jars ?? 0;
  const name = clientInfo?.name ?? "—";

  if (clientInfo === undefined || accounts === 0) {
    return {
      heading: "Monobank is connected",
      description:
        "A Monobank token is saved for this profile. Run a sync to populate the masked account summary.",
      ctaLabel: "Re-check Monobank connection",
      ctaHref: MONOBANK_PUBLIC_TOKEN_URL,
      inventoryStatus: "awaiting-sync",
      inventoryLabel: "Awaiting first sync",
      hasToken: true,
      profile,
    };
  }

  return {
    heading: "Monobank is connected",
    description: `Monobank account: ${name} · ${accounts} accounts · ${jars} jars`,
    ctaLabel: "Re-check Monobank connection",
    ctaHref: MONOBANK_PUBLIC_TOKEN_URL,
    inventoryStatus: "live",
    inventoryLabel: "Live inventory",
    hasToken: true,
    profile,
  };
}
