import type { LocalActivityEventType, LocalAppSnapshot } from "./api-types";

export function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" {
  if (status === "success" || status === "ok") {
    return "default";
  }

  if (status === "failed" || status === "interrupted") {
    return "destructive";
  }

  return "secondary";
}

export function activityEventTypeVariant(
  type: LocalActivityEventType,
): "default" | "secondary" | "destructive" {
  switch (type) {
    case "error":
      return "destructive";
    case "warning":
      return "secondary";
    case "sync_run":
    case "webhook_delivery":
    case "export":
    case "rule_application":
      return "default";
    default:
      return "secondary";
  }
}

export function tokenStateLabel(token: LocalAppSnapshot["config"]["token"]): {
  state: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  description: string;
} {
  if (token.hasToken && token.persistence === "persistent") {
    return {
      state: "Configured",
      variant: "default",
      description: "A Monobank token is available from secure local storage.",
    };
  }

  if (token.hasToken) {
    return {
      state: "Session only",
      variant: "secondary",
      description:
        token.fallbackReason === "secure_storage_write_failed"
          ? "Secure storage was unavailable during save, so the token is available only until this server stops."
          : "A Monobank token is available only for the running server session.",
    };
  }

  return {
    state: "Not configured",
    variant: "outline",
    description:
      "No token is configured for this workspace. Monobank sync will not run.",
  };
}
