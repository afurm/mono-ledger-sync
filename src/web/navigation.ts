import {
  ActivityIcon,
  ArrowDownUpIcon,
  BadgeHelpIcon,
  BookOpenIcon,
  CalendarClockIcon,
  ChartNoAxesCombinedIcon,
  DatabaseIcon,
  DownloadIcon,
  FileClockIcon,
  GaugeIcon,
  ListChecksIcon,
  PiggyBankIcon,
  SettingsIcon,
  TagsIcon,
  WalletCardsIcon,
} from "lucide-react";

export const routes = [
  {
    id: "overview",
    label: "Overview",
    title: "Money at a glance",
    description:
      "Balances, sync health, recent movement, and local ledger freshness.",
    icon: GaugeIcon,
  },
  {
    id: "transactions",
    label: "Transactions",
    title: "Ledger transactions",
    description:
      "Search, filter, review, and inspect normalized local transaction rows.",
    icon: ArrowDownUpIcon,
  },
  {
    id: "categories",
    label: "Categories",
    title: "Category spending",
    description:
      "Category totals, trend movement, and drill-downs into expense rows.",
    icon: TagsIcon,
  },
  {
    id: "budgets",
    label: "Budgets",
    title: "Budget progress",
    description:
      "Monthly category budgets, rollover choices, and overspend state.",
    icon: PiggyBankIcon,
  },
  {
    id: "recurring",
    label: "Recurring",
    title: "Recurring payments",
    description:
      "Detected subscriptions, missed payments, upcoming charges, and calendar.",
    icon: CalendarClockIcon,
  },
  {
    id: "reports",
    label: "Reports",
    title: "Local reports",
    description:
      "Spending, cashflow, savings, projection, category, and merchant reports.",
    icon: ChartNoAxesCombinedIcon,
  },
  {
    id: "rules",
    label: "Rules & Mappings",
    title: "Automation rules",
    description:
      "Categorization, merchant cleanup, duplicate review, and export mappings.",
    icon: ListChecksIcon,
  },
  {
    id: "sync",
    label: "Sync & Webhooks",
    title: "Sync control center",
    description:
      "Monobank connection, webhook delivery, schedules, storage, and activity.",
    icon: ActivityIcon,
  },
  {
    id: "accounts",
    label: "Accounts",
    title: "Connected accounts",
    description:
      "Cards, balances, currencies, jars, and local statement cursor context.",
    icon: WalletCardsIcon,
  },
  {
    id: "exports",
    label: "Exports",
    title: "Local export flows",
    description:
      "CSV, JSON, JSONL, and journal CSV files created from local ledger data.",
    icon: DownloadIcon,
  },
  {
    id: "logs",
    label: "Logs",
    title: "Diagnostics timeline",
    description:
      "Redacted sync, webhook, export, rule, warning, and error activity.",
    icon: FileClockIcon,
  },
  {
    id: "settings",
    label: "Settings",
    title: "Local workspace settings",
    description:
      "Profile, database path, token status, privacy, backups, and deletion.",
    icon: SettingsIcon,
  },
  {
    id: "help",
    label: "Help",
    title: "Local setup help",
    description:
      "Token setup, backups, export recipes, troubleshooting, and privacy model.",
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
