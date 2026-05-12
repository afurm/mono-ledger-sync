import {
  ActivityIcon,
  ArrowDownUpIcon,
  BadgeHelpIcon,
  BookOpenIcon,
  DatabaseIcon,
  DownloadIcon,
  FileClockIcon,
  GaugeIcon,
  ListChecksIcon,
  SettingsIcon,
  WalletCardsIcon,
} from "lucide-react";

export const routes = [
  {
    id: "overview",
    label: "Overview",
    icon: GaugeIcon,
  },
  {
    id: "transactions",
    label: "Transactions",
    icon: ArrowDownUpIcon,
  },
  {
    id: "rules",
    label: "Rules & Mappings",
    icon: ListChecksIcon,
  },
  {
    id: "sync",
    label: "Sync & Webhooks",
    icon: ActivityIcon,
  },
  {
    id: "accounts",
    label: "Accounts",
    icon: WalletCardsIcon,
  },
  {
    id: "exports",
    label: "Exports",
    icon: DownloadIcon,
  },
  {
    id: "logs",
    label: "Logs",
    icon: FileClockIcon,
  },
  {
    id: "settings",
    label: "Settings",
    icon: SettingsIcon,
  },
  {
    id: "help",
    label: "Help",
    icon: BadgeHelpIcon,
  },
] as const;

export type RouteId = (typeof routes)[number]["id"];

export const secondaryRoutes = [
  {
    label: "Local database",
    icon: DatabaseIcon,
  },
  {
    label: "Privacy model",
    icon: BookOpenIcon,
  },
] as const;

export function isRouteId(value: string): value is RouteId {
  return routes.some((route) => route.id === value);
}
