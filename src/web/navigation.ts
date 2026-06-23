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

import { messages } from "./i18n.js";

export const routes = [
  {
    id: "overview",
    ...messages.routes.overview,
    icon: GaugeIcon,
  },
  {
    id: "transactions",
    ...messages.routes.transactions,
    icon: ArrowDownUpIcon,
  },
  {
    id: "categories",
    ...messages.routes.categories,
    icon: TagsIcon,
  },
  {
    id: "budgets",
    ...messages.routes.budgets,
    icon: PiggyBankIcon,
  },
  {
    id: "recurring",
    ...messages.routes.recurring,
    icon: CalendarClockIcon,
  },
  {
    id: "reports",
    ...messages.routes.reports,
    icon: ChartNoAxesCombinedIcon,
  },
  {
    id: "rules",
    ...messages.routes.rules,
    icon: ListChecksIcon,
  },
  {
    id: "sync",
    ...messages.routes.sync,
    icon: ActivityIcon,
  },
  {
    id: "accounts",
    ...messages.routes.accounts,
    icon: WalletCardsIcon,
  },
  {
    id: "exports",
    ...messages.routes.exports,
    icon: DownloadIcon,
  },
  {
    id: "logs",
    ...messages.routes.logs,
    icon: FileClockIcon,
  },
  {
    id: "settings",
    ...messages.routes.settings,
    icon: SettingsIcon,
  },
  {
    id: "help",
    ...messages.routes.help,
    icon: BadgeHelpIcon,
  },
] as const;

export type RouteId = (typeof routes)[number]["id"];

export const secondaryRoutes = [
  {
    label: messages.secondaryRoutes.localDatabase,
    icon: DatabaseIcon,
  },
  {
    label: messages.secondaryRoutes.privacyModel,
    icon: BookOpenIcon,
  },
] as const;

export function isRouteId(value: string): value is RouteId {
  return routes.some((route) => route.id === value);
}
