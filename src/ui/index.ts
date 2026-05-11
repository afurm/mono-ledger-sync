export const uiFramework = "vite";
export const componentSystem = "shadcn/ui";

export const appNavigation = [
  "overview",
  "transactions",
  "rules-and-mappings",
  "sync-and-webhooks",
  "accounts",
  "exports",
  "logs",
  "settings",
  "help",
] as const;

export type AppNavigationItem = (typeof appNavigation)[number];

export const themeTokens = {
  background: "#ffffff",
  foreground: "#111722",
  mutedForeground: "#5c626b",
  border: "#dfe4ec",
  primary: "#05962f",
  primaryForeground: "#ffffff",
  accent: "#eef8f1",
  destructive: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
} as const;
