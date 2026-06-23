import { DEFAULT_LOCALE, messages } from "./i18n.js";

export function currencyLabel(currencyCode: number): string {
  switch (currencyCode) {
    case 840:
      return "USD";
    case 978:
      return "EUR";
    case 980:
      return "UAH";
    default:
      return String(currencyCode);
  }
}

export function formatMinorAmount(amount: number, currencyCode = 980): string {
  return `${(amount / 100).toLocaleString(DEFAULT_LOCALE, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} ${currencyLabel(currencyCode)}`;
}

export function formatDateTime(value: string | number | undefined): string {
  if (value === undefined) {
    return messages.format.notSynced;
  }

  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(value);

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(value: number): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    day: "2-digit",
    month: "short",
  }).format(new Date(value * 1000));
}

const RELATIVE_MINUTE_MS = 60 * 1000;
const RELATIVE_HOUR_MS = 60 * RELATIVE_MINUTE_MS;
const RELATIVE_DAY_MS = 24 * RELATIVE_HOUR_MS;

export function formatRelativeAge(
  value: string | number | undefined,
  referenceTimestampMs: number = Date.now(),
): string {
  if (value === undefined) {
    return messages.format.notAvailable;
  }

  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return messages.format.notAvailable;
  }

  const diffMs = referenceTimestampMs - date.getTime();
  if (diffMs < 0) {
    return messages.format.justNow;
  }

  if (diffMs < RELATIVE_MINUTE_MS) {
    return messages.format.justNow;
  }
  const relativeFormatter = new Intl.RelativeTimeFormat(DEFAULT_LOCALE, {
    numeric: "auto",
  });

  if (diffMs < RELATIVE_HOUR_MS) {
    const minutes = Math.floor(diffMs / RELATIVE_MINUTE_MS);
    return relativeFormatter.format(-minutes, "minute");
  }
  if (diffMs < RELATIVE_DAY_MS) {
    const hours = Math.floor(diffMs / RELATIVE_HOUR_MS);
    return relativeFormatter.format(-hours, "hour");
  }
  const days = Math.floor(diffMs / RELATIVE_DAY_MS);
  return relativeFormatter.format(-days, "day");
}
