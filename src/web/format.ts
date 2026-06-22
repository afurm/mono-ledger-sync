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
  return `${(amount / 100).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} ${currencyLabel(currencyCode)}`;
}

export function formatDateTime(value: string | number | undefined): string {
  if (value === undefined) {
    return "Not synced";
  }

  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(value);

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(value: number): string {
  return new Intl.DateTimeFormat("en", {
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
    return "Not available";
  }

  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  const diffMs = referenceTimestampMs - date.getTime();
  if (diffMs < 0) {
    return "Just now";
  }

  if (diffMs < RELATIVE_MINUTE_MS) {
    return "Just now";
  }
  if (diffMs < RELATIVE_HOUR_MS) {
    const minutes = Math.floor(diffMs / RELATIVE_MINUTE_MS);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (diffMs < RELATIVE_DAY_MS) {
    const hours = Math.floor(diffMs / RELATIVE_HOUR_MS);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(diffMs / RELATIVE_DAY_MS);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
