import type { LocalActivityEventType, LocalAppSnapshot } from "./api-types";
import { messages } from "./i18n";

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
      state: messages.token.configured,
      variant: "default",
      description: messages.token.configuredDescription,
    };
  }

  if (token.hasToken) {
    return {
      state: messages.token.sessionOnly,
      variant: "secondary",
      description:
        token.fallbackReason === "secure_storage_write_failed"
          ? messages.token.sessionWriteFailedDescription
          : messages.token.sessionDescription,
    };
  }

  return {
    state: messages.token.notConfigured,
    variant: "outline",
    description: messages.token.notConfiguredDescription,
  };
}
