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
