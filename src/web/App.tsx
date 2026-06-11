import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  BanIcon,
  CalendarDaysIcon,
  CheckCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  EyeIcon,
  FilterXIcon,
  FileClockIcon,
  KeyRoundIcon,
  LaptopIcon,
  MenuIcon,
  MoonIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  SplitIcon,
  XIcon,
  SunIcon,
  TagsIcon,
  StickyNoteIcon,
  StoreIcon,
  TagIcon,
  Trash2Icon,
  UserRoundIcon,
  WifiOffIcon,
} from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import {
  type CategoryRule,
  type LedgerAccount,
  type LedgerEntry,
  type LedgerEntryPage,
  type LedgerJar,
  type LedgerTransactionFilters,
  type LedgerTransactionSortDirection,
  type LedgerTransactionSortField,
  type LocalActivityEvent,
  type LocalActivityEventType,
  type LocalApiMonobankTokenStatus,
  type LocalAppSnapshot,
  type SyncRun,
  type WebhookEvent,
  confirmRecurringDetection,
  deleteMonthlyCategoryBudget,
  createMonthlyCategoryBudget,
  ignoreRecurringDetection,
  loadCategoryTrendReport,
  loadCashflowReport,
  loadLocalAppSnapshot,
  loadLedgerTransactions,
  loadMerchantTrendReport,
  loadMonthlySpendingReport,
  clearMonobankToken,
  initializeWorkspace,
  recheckMonobankConnection,
  saveMonobankToken,
  runFixtureSync,
  setMonobankSource,
  updateLedgerTransactionAnnotation,
  updateLedgerTransactionSplitPlan,
  updateLedgerTransactionsBulk,
} from "./api";
import {
  currencyLabel,
  formatDate,
  formatDateTime,
  formatMinorAmount,
} from "./format";
import { type RouteId, isRouteId, routes, secondaryRoutes } from "./navigation";
import {
  type LedgerEntryReviewCandidate,
  findLedgerEntryReviewCandidates,
} from "./review";
import { type SyncRunSummaryStats, summarizeSyncRuns } from "./sync-summary";
import {
  type FirstRunEmptyStateView,
  buildFirstRunEmptyStateView,
  shouldShowFirstRunSignInPrompt,
} from "./empty-state";
import {
  type FirstRunSignInCardView,
  buildFirstRunSignInCardView,
} from "./signin-card";

type LoadState =
  | { status: "loading"; data?: LocalAppSnapshot; error?: undefined }
  | { status: "ready"; data: LocalAppSnapshot; error?: undefined }
  | { status: "error"; data?: LocalAppSnapshot; error: string };

type ThemeMode = "system" | "light" | "dark";

interface LedgerFreshnessWarning {
  title: string;
  description: string;
}

interface SyncHealthBucket {
  key: string;
  label: string;
  success: number;
  partial: number;
  failed: number;
  skipped: number;
}

interface SyncHealthSummary {
  buckets: SyncHealthBucket[];
  totals: {
    success: number;
    partial: number;
    failed: number;
    skipped: number;
  };
  maxBucketTotal: number;
}

type TransactionFilterFormState = {
  search: string;
  accountId: string;
  categoryId: string;
  merchantName: string;
  status: "all" | "hold" | "posted";
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  page: number;
  sortBy: LedgerTransactionSortField;
  sortDirection: LedgerTransactionSortDirection;
};

type TransactionPageState =
  | { status: "loading"; data?: LedgerEntryPage; error?: undefined }
  | { status: "ready"; data: LedgerEntryPage; error?: undefined }
  | { status: "error"; data?: LedgerEntryPage; error: string };

type TransactionFilterPresetId =
  | "monthly-review"
  | "uncategorized"
  | "large-expenses"
  | "subscriptions"
  | "income";

interface TransactionFilterPreset {
  id: TransactionFilterPresetId;
  label: string;
  buildFilters: () => TransactionFilterFormState;
}

type LogEventFilterState = Record<LocalActivityEventType, boolean>;
type LogEventTypeCounts = Record<LocalActivityEventType, number>;

const DEFAULT_LOG_FILTERS: LogEventFilterState = {
  sync_run: true,
  webhook_delivery: true,
  ledger_write: true,
  export: true,
  report_refresh: true,
  rule_application: true,
  warning: true,
  error: true,
};

const LOG_EVENT_TYPE_LABELS: Readonly<Record<LocalActivityEventType, string>> =
  {
    sync_run: "Sync runs",
    webhook_delivery: "Webhook deliveries",
    ledger_write: "Ledger writes",
    report_refresh: "Report refreshes",
    export: "Exports",
    rule_application: "Rule application",
    warning: "Warnings",
    error: "Errors",
  };

const TRANSACTION_PAGE_SIZE = 25;
const OVERVIEW_TRANSACTION_LIMIT = 8;
const AMOUNT_FILTER_PATTERN = /^-?(?:\d+|\d*\.\d{1,2})$/;
const THEME_STORAGE_KEY = "mono-ledger-sync-theme";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const STALE_SYNC_THRESHOLD_MS = DAY_MS;
const SYNC_HEALTH_DAYS = 30;
const MAX_SPLIT_PLAN_LINES = 20;
const transactionSortFields = [
  "time",
  "merchant",
  "amount",
  "account",
  "category",
  "status",
] as const satisfies readonly LedgerTransactionSortField[];
const defaultTransactionSortDirections: Record<
  LedgerTransactionSortField,
  LedgerTransactionSortDirection
> = {
  time: "desc",
  merchant: "asc",
  amount: "desc",
  account: "asc",
  category: "asc",
  status: "desc",
};
function defaultTransactionFilters(): TransactionFilterFormState {
  return {
    search: "",
    accountId: "",
    categoryId: "",
    merchantName: "",
    status: "all",
    dateFrom: "",
    dateTo: "",
    amountMin: "",
    amountMax: "",
    page: 1,
    sortBy: "time",
    sortDirection: "desc",
  };
}

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function monthlyReviewFilters(): TransactionFilterFormState {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    ...defaultTransactionFilters(),
    dateFrom: dateInputValue(firstDayOfMonth),
    dateTo: dateInputValue(now),
  };
}

const transactionFilterPresets = [
  {
    id: "monthly-review",
    label: "Monthly review",
    buildFilters: monthlyReviewFilters,
  },
  {
    id: "uncategorized",
    label: "Uncategorized",
    buildFilters: () => ({
      ...defaultTransactionFilters(),
      categoryId: "uncategorized",
    }),
  },
  {
    id: "large-expenses",
    label: "Large expenses",
    buildFilters: () => ({
      ...defaultTransactionFilters(),
      amountMax: "-1000.00",
    }),
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    buildFilters: () => ({
      ...defaultTransactionFilters(),
      categoryId: "subscriptions",
    }),
  },
  {
    id: "income",
    label: "Income",
    buildFilters: () => ({
      ...defaultTransactionFilters(),
      amountMin: "0.01",
    }),
  },
] as const satisfies readonly TransactionFilterPreset[];

const builtInRuleSummaries = [
  {
    id: "income",
    label: "Income",
    priority: 10,
    conditions: "Positive amount",
    targetAction: "Set category to Income",
    editor: {
      merchantContains: "Any merchant",
      descriptionContains: "Any incoming description",
      mcc: "Not required",
      amountRange: "Greater than 0.00",
      transactionType: "Income",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "groceries",
    label: "Groceries",
    priority: 20,
    conditions: "MCC 5411 or grocery text",
    targetAction: "Set category to Groceries",
    editor: {
      merchantContains: "grocery, supermarket",
      descriptionContains: "grocery",
      mcc: "5411",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "utilities",
    label: "Utilities",
    priority: 25,
    conditions: "MCC 4900 or utility text",
    targetAction: "Set category to Utilities",
    editor: {
      merchantContains: "utility",
      descriptionContains: "utility",
      mcc: "4900",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "healthcare",
    label: "Healthcare",
    priority: 26,
    conditions: "MCC 5912 or pharmacy text",
    targetAction: "Set category to Healthcare",
    editor: {
      merchantContains: "pharmacy",
      descriptionContains: "pharmacy",
      mcc: "5912",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "shopping",
    label: "Shopping",
    priority: 27,
    conditions: "MCC 5311 or marketplace text",
    targetAction: "Set category to Shopping",
    editor: {
      merchantContains: "marketplace",
      descriptionContains: "marketplace",
      mcc: "5311",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "household",
    label: "Household",
    priority: 28,
    conditions: "MCC 5200 or household text",
    targetAction: "Set category to Household",
    editor: {
      merchantContains: "household",
      descriptionContains: "household",
      mcc: "5200",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "education",
    label: "Education",
    priority: 29,
    conditions: "MCC 8299 or education text",
    targetAction: "Set category to Education",
    editor: {
      merchantContains: "education",
      descriptionContains: "education",
      mcc: "8299",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    priority: 30,
    conditions: "MCC 5734 or subscription text",
    targetAction: "Set category to Subscriptions",
    editor: {
      merchantContains: "app store, streaming, software",
      descriptionContains: "subscription",
      mcc: "5734",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "transport",
    label: "Transport",
    priority: 40,
    conditions: "MCC 4111 or metro text",
    targetAction: "Set category to Transport",
    editor: {
      merchantContains: "metro, taxi, transport",
      descriptionContains: "metro",
      mcc: "4111",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "travel",
    label: "Travel",
    priority: 50,
    conditions: "MCC 4722 or travel text",
    targetAction: "Set category to Travel",
    editor: {
      merchantContains: "travel, airline, hotel",
      descriptionContains: "travel",
      mcc: "4722",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "dining",
    label: "Dining",
    priority: 60,
    conditions: "MCC 5814 or coffee text",
    targetAction: "Set category to Dining",
    editor: {
      merchantContains: "cafe, coffee, restaurant",
      descriptionContains: "coffee",
      mcc: "5814",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "taxes",
    label: "Taxes",
    priority: 65,
    conditions: "MCC 9311 or tax text",
    targetAction: "Set category to Taxes",
    editor: {
      merchantContains: "tax",
      descriptionContains: "tax",
      mcc: "9311",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "charity",
    label: "Charity",
    priority: 66,
    conditions: "MCC 8398 or donation text",
    targetAction: "Set category to Charity",
    editor: {
      merchantContains: "donation",
      descriptionContains: "donation",
      mcc: "8398",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "cash",
    label: "Cash",
    priority: 67,
    conditions: "MCC 6011 or ATM text",
    targetAction: "Set category to Cash",
    editor: {
      merchantContains: "atm",
      descriptionContains: "atm",
      mcc: "6011",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "fees",
    label: "Fees",
    priority: 68,
    conditions: "MCC 6012 or fee text",
    targetAction: "Set category to Fees",
    editor: {
      merchantContains: "fee",
      descriptionContains: "fee",
      mcc: "6012",
      amountRange: "Any expense amount",
      transactionType: "Expense",
      account: "All accounts",
      date: "Any date",
    },
  },
  {
    id: "transfers",
    label: "Transfers",
    priority: 70,
    conditions: "MCC 4829 or transfer text",
    targetAction: "Set category to Transfers",
    editor: {
      merchantContains: "transfer",
      descriptionContains: "transfer",
      mcc: "4829",
      amountRange: "Any amount",
      transactionType: "Transfer",
      account: "All accounts",
      date: "Any date",
    },
  },
] as const;

const ruleEditorTransactionTypeOptions = [
  "Income",
  "Expense",
  "Transfer",
  "Any",
];
const ruleEditorAccountOptions = ["All accounts"];
const ruleEditorDateOptions = ["Any date", "Current statement window"];

type CategoryRuleSummary = {
  id: string;
  categoryId: string;
  label: string;
  priority: number;
  matchType: "condition" | "fallback";
  conditions: string;
  targetAction: string;
  editor: {
    merchantContains: string;
    descriptionContains: string;
    mcc: string;
    amountRange: string;
    transactionType: string;
    account: string;
    date: string;
  };
  isEnabled: boolean;
  isSystem: boolean;
};
type RuleMatchSummary = {
  id: string;
  priority: number;
  matchType: CategoryRuleSummary["matchType"];
  editor: CategoryRuleSummary["editor"];
  isEnabled: boolean;
};

const fallbackCategoryRuleSummary: CategoryRuleSummary = {
  id: "income",
  categoryId: "income",
  label: "Income",
  priority: 10,
  matchType: "condition",
  conditions: "Positive amount",
  targetAction: "Set category to Income",
  editor: {
    merchantContains: "Any merchant",
    descriptionContains: "Any incoming description",
    mcc: "Not required",
    amountRange: "Greater than 0.00",
    transactionType: "Income",
    account: "All accounts",
    date: "Any date",
  },
  isEnabled: true,
  isSystem: true,
};

function categoryRuleConditions(rule: CategoryRule): string {
  if (rule.matchType === "fallback") {
    return "Fallback";
  }

  const conditions = [
    rule.amountDirection === "income"
      ? "income amount"
      : rule.amountDirection === "expense"
        ? "expense amount"
        : undefined,
    rule.mcc === undefined ? undefined : `MCC ${rule.mcc}`,
    rule.merchantContains === undefined
      ? undefined
      : `merchant contains ${rule.merchantContains}`,
    rule.descriptionContains === undefined
      ? undefined
      : `description contains ${rule.descriptionContains}`,
  ].filter(Boolean);

  return conditions.length > 0 ? conditions.join(" or ") : "Manual condition";
}

function categoryRuleTransactionType(rule: CategoryRule): string {
  if (rule.amountDirection === "income") {
    return "Income";
  }

  if (rule.amountDirection === "expense") {
    return "Expense";
  }

  return "Any";
}

function categoryRuleSummariesFromSnapshot(
  snapshot: LocalAppSnapshot | undefined,
): readonly CategoryRuleSummary[] {
  if (!snapshot?.categoryRules.length) {
    return builtInRuleSummaries.map((rule) => ({
      ...rule,
      categoryId: rule.id,
      matchType: "condition",
      isEnabled: true,
      isSystem: true,
    }));
  }

  const categoryNames = new Map(
    snapshot.categories.map((category) => [category.id, category.name]),
  );

  return snapshot.categoryRules.map((rule) => {
    const categoryName = categoryNames.get(rule.categoryId) ?? rule.categoryId;

    return {
      id: rule.id,
      categoryId: rule.categoryId,
      label: rule.name,
      priority: rule.priority,
      matchType: rule.matchType,
      conditions: categoryRuleConditions(rule),
      targetAction: `Set category to ${categoryName}`,
      editor: {
        merchantContains: rule.merchantContains ?? "Any merchant",
        descriptionContains:
          rule.descriptionContains ?? "Any transaction description",
        mcc: rule.mcc === undefined ? "Not required" : String(rule.mcc),
        amountRange:
          rule.amountDirection === "income"
            ? "Greater than 0.00"
            : rule.amountDirection === "expense"
              ? "Less than 0.00"
              : "Any amount",
        transactionType: categoryRuleTransactionType(rule),
        account: "All accounts",
        date: "Any date",
      },
      isEnabled: rule.isEnabled !== false,
      isSystem: rule.isSystem === true,
    };
  });
}

interface RuleTestSample {
  merchantName: string;
  description: string;
  mcc: string;
  amount: number;
  transactionType: string;
  account: string;
  currencyCode: number;
}

interface RuleTestCheck {
  id: string;
  label: string;
  detail: string;
  matched: boolean;
}

interface RuleConflictPreview {
  entry: LedgerEntry;
  rules: readonly CategoryRuleSummary[];
}

function getInitialRoute(): RouteId {
  const hashRoute = window.location.hash.replace("#", "");
  const [route] = hashRoute.split("?");

  return route && isRouteId(route) ? route : "overview";
}

function isTransactionSortField(
  value: string | null,
): value is LedgerTransactionSortField {
  return transactionSortFields.includes(value as LedgerTransactionSortField);
}

function isTransactionSortDirection(
  value: string | null,
): value is LedgerTransactionSortDirection {
  return value === "asc" || value === "desc";
}

function readTransactionFiltersFromHash(): TransactionFilterFormState {
  const filters = defaultTransactionFilters();
  const [, queryString] = window.location.hash.replace("#", "").split("?");

  if (!queryString) {
    return filters;
  }

  const params = new URLSearchParams(queryString);
  const status = params.get("status");
  const sortBy = params.get("sortBy");
  const sortDirection = params.get("sortDirection");
  const page = Number.parseInt(params.get("page") ?? "", 10);

  return normalizeTransactionFilters({
    search: params.get("search") ?? "",
    accountId: params.get("accountId") ?? "",
    categoryId: params.get("categoryId") ?? "",
    merchantName: params.get("merchantName") ?? "",
    status: status === "hold" || status === "posted" ? status : "all",
    dateFrom: params.get("dateFrom") ?? "",
    dateTo: params.get("dateTo") ?? "",
    amountMin: params.get("amountMin") ?? "",
    amountMax: params.get("amountMax") ?? "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    sortBy: isTransactionSortField(sortBy) ? sortBy : "time",
    sortDirection: isTransactionSortDirection(sortDirection)
      ? sortDirection
      : "desc",
  });
}

function buildTransactionFiltersHash(filters: TransactionFilterFormState) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === "" || value === "all" || (key === "page" && value === 1)) {
      continue;
    }

    if (key === "sortBy" && value === "time") {
      continue;
    }

    if (key === "sortDirection" && value === "desc") {
      continue;
    }

    params.set(key, String(value));
  }

  const query = params.toString();
  return `#transactions${query ? `?${query}` : ""}`;
}

function writeTransactionFiltersToHash(
  filters: TransactionFilterFormState,
): void {
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${buildTransactionFiltersHash(filters)}`,
  );
}

function dateInputToEpoch(value: string, endOfDay = false): number | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  const epoch = Math.floor(date.getTime() / 1000);

  return Number.isFinite(epoch) ? epoch : undefined;
}

function amountInputToMinor(value: string): number | undefined {
  const trimmed = value.trim();

  if (!trimmed || !AMOUNT_FILTER_PATTERN.test(trimmed)) {
    return undefined;
  }

  const amount = Number(trimmed);
  const minorAmount = Math.round(amount * 100);

  return Number.isSafeInteger(minorAmount) ? minorAmount : undefined;
}

function getAmountInputError(label: string, value: string): string | undefined {
  const trimmed = value.trim();

  if (!trimmed || AMOUNT_FILTER_PATTERN.test(trimmed)) {
    return undefined;
  }

  return `${label} must use digits, an optional minus sign, and up to 2 decimals.`;
}

function normalizeAmountInput(value: string): string {
  return amountInputToMinor(value) === undefined ? "" : value.trim();
}

function normalizeTransactionFilters(
  filters: TransactionFilterFormState,
): TransactionFilterFormState {
  return {
    ...filters,
    search: filters.search.trim(),
    merchantName: filters.merchantName.trim(),
    amountMin: normalizeAmountInput(filters.amountMin),
    amountMax: normalizeAmountInput(filters.amountMax),
  };
}

function matchesTransactionPreset(
  filters: TransactionFilterFormState,
  preset: TransactionFilterPreset,
): boolean {
  const presetFilters = preset.buildFilters();
  const normalizedFilters = normalizeTransactionFilters(filters);

  return (
    normalizedFilters.search === presetFilters.search &&
    normalizedFilters.accountId === presetFilters.accountId &&
    normalizedFilters.categoryId === presetFilters.categoryId &&
    normalizedFilters.merchantName === presetFilters.merchantName &&
    normalizedFilters.status === presetFilters.status &&
    normalizedFilters.dateFrom === presetFilters.dateFrom &&
    normalizedFilters.dateTo === presetFilters.dateTo &&
    normalizedFilters.amountMin === presetFilters.amountMin &&
    normalizedFilters.amountMax === presetFilters.amountMax
  );
}

function activeTransactionPreset(
  filters: TransactionFilterFormState,
): TransactionFilterPreset | undefined {
  return transactionFilterPresets.find((preset) =>
    matchesTransactionPreset(filters, preset),
  );
}

function filtersToApiQuery(
  filters: TransactionFilterFormState,
): LedgerTransactionFilters {
  const query: LedgerTransactionFilters = {
    limit: TRANSACTION_PAGE_SIZE,
    offset: (filters.page - 1) * TRANSACTION_PAGE_SIZE,
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
  };
  const from = dateInputToEpoch(filters.dateFrom);
  const to = dateInputToEpoch(filters.dateTo, true);
  const amountMin = amountInputToMinor(filters.amountMin);
  const amountMax = amountInputToMinor(filters.amountMax);

  if (filters.search.trim()) {
    query.search = filters.search.trim();
  }

  if (filters.accountId) {
    query.accountId = filters.accountId;
  }

  if (filters.categoryId) {
    query.categoryId = filters.categoryId;
  }

  if (filters.merchantName.trim()) {
    query.merchantName = filters.merchantName.trim();
  }

  if (filters.status !== "all") {
    query.status = filters.status;
  }

  if (from !== undefined) {
    query.from = from;
  }

  if (to !== undefined) {
    query.to = to;
  }

  if (amountMin !== undefined) {
    query.amountMin = amountMin;
  }

  if (amountMax !== undefined) {
    query.amountMax = amountMax;
  }

  return query;
}

function hasActiveTransactionFilters(
  filters: TransactionFilterFormState,
): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.accountId !== "" ||
    filters.categoryId !== "" ||
    filters.merchantName.trim() !== "" ||
    filters.status !== "all" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    amountInputToMinor(filters.amountMin) !== undefined ||
    amountInputToMinor(filters.amountMax) !== undefined
  );
}

function canUseSnapshotTransactionFallback(
  filters: TransactionFilterFormState,
): boolean {
  const defaultFilters = defaultTransactionFilters();

  return (
    !hasActiveTransactionFilters(filters) &&
    filters.page === 1 &&
    filters.sortBy === defaultFilters.sortBy &&
    filters.sortDirection === defaultFilters.sortDirection
  );
}

function snapshotTransactionFallbackPage(
  snapshot: LocalAppSnapshot,
): LedgerEntryPage {
  return {
    ...snapshot.transactions,
    total: snapshot.transactions.entries.length,
    limit: snapshot.transactions.entries.length,
    offset: 0,
  };
}

function hasTransactionFilterInput(
  filters: TransactionFilterFormState,
): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.accountId !== "" ||
    filters.categoryId !== "" ||
    filters.merchantName.trim() !== "" ||
    filters.status !== "all" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.amountMin.trim() !== "" ||
    filters.amountMax.trim() !== ""
  );
}

function getNextSortDirection(
  current: TransactionFilterFormState,
  sortBy: LedgerTransactionSortField,
): LedgerTransactionSortDirection {
  if (current.sortBy !== sortBy) {
    return defaultTransactionSortDirections[sortBy];
  }

  return current.sortDirection === "asc" ? "desc" : "asc";
}

function routeMetadata(routeId: RouteId) {
  return routes.find((route) => route.id === routeId) ?? routes[0];
}

function routeFromHash(): RouteId {
  return getInitialRoute();
}

function routeContextLine(
  routeId: RouteId,
  snapshot: LocalAppSnapshot | undefined,
): string {
  const metadata = routeMetadata(routeId);
  const localContext = snapshot
    ? `${snapshot.config.profile} profile / ${snapshot.config.source} source`
    : "Waiting for local API";

  return `${metadata.description} ${localContext}.`;
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function readInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  try {
    const storedThemeMode = window.localStorage.getItem(THEME_STORAGE_KEY);

    return isThemeMode(storedThemeMode) ? storedThemeMode : "system";
  } catch {
    return "system";
  }
}

function resolveThemeMode(themeMode: ThemeMode): "light" | "dark" {
  if (themeMode !== "system" || typeof window === "undefined") {
    return themeMode === "dark" ? "dark" : "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyThemeMode(themeMode: ThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }

  const resolvedThemeMode = resolveThemeMode(themeMode);

  document.documentElement.classList.toggle(
    "dark",
    resolvedThemeMode === "dark",
  );
  document.documentElement.style.colorScheme = resolvedThemeMode;
}

function themeModeLabel(themeMode: ThemeMode): string {
  switch (themeMode) {
    case "dark":
      return "Dark";
    case "light":
      return "Light";
    case "system":
      return "System";
  }
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" {
  if (status === "success" || status === "ok") {
    return "default";
  }

  if (status === "failed") {
    return "destructive";
  }

  return "secondary";
}

function activityEventTypeVariant(
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

function dataFreshnessLabel(lastSyncedAt: string | undefined): string {
  return lastSyncedAt
    ? `Updated ${formatDateTime(lastSyncedAt)}`
    : "Waiting for first sync";
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function syncHealthBucketLabel(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function getSyncHealthSummary(
  runs: readonly SyncRun[],
  now = Date.now(),
): SyncHealthSummary {
  const today = new Date(now);
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const buckets: SyncHealthBucket[] = Array.from(
    { length: SYNC_HEALTH_DAYS },
    (_, index) => {
      const date = new Date(
        todayStart.getTime() - (SYNC_HEALTH_DAYS - index - 1) * DAY_MS,
      );

      return {
        key: localDayKey(date),
        label: syncHealthBucketLabel(date),
        success: 0,
        partial: 0,
        failed: 0,
        skipped: 0,
      };
    },
  );
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const run of runs) {
    const startedAt = new Date(run.startedAt);

    if (Number.isNaN(startedAt.getTime())) {
      continue;
    }

    const bucket = bucketMap.get(localDayKey(startedAt));

    if (!bucket) {
      continue;
    }

    if (run.status === "success") {
      bucket.success += 1;
    } else if (run.status === "partial") {
      bucket.partial += 1;
    } else if (run.status === "failed") {
      bucket.failed += 1;
    }

    bucket.skipped += run.itemsSkipped;
  }

  const totals = buckets.reduce(
    (currentTotals, bucket) => ({
      success: currentTotals.success + bucket.success,
      partial: currentTotals.partial + bucket.partial,
      failed: currentTotals.failed + bucket.failed,
      skipped: currentTotals.skipped + bucket.skipped,
    }),
    { success: 0, partial: 0, failed: 0, skipped: 0 },
  );
  const maxBucketTotal = Math.max(
    1,
    ...buckets.map(
      (bucket) =>
        bucket.success + bucket.partial + bucket.failed + bucket.skipped,
    ),
  );

  return { buckets, totals, maxBucketTotal };
}

function formatSyncAge(ageMs: number): string {
  const safeAgeMs = Math.max(0, ageMs);

  if (safeAgeMs < HOUR_MS) {
    return "less than 1 hour ago";
  }

  if (safeAgeMs < DAY_MS) {
    const hours = Math.floor(safeAgeMs / HOUR_MS);

    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  const days = Math.floor(safeAgeMs / DAY_MS);

  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function getLedgerFreshnessWarning(
  snapshot: LocalAppSnapshot | undefined,
  now = Date.now(),
): LedgerFreshnessWarning | undefined {
  if (!snapshot) {
    return undefined;
  }

  const lastSyncedAt = snapshot.summary.lastSyncedAt;

  if (!lastSyncedAt) {
    return {
      title: "No completed sync yet",
      description: `${snapshot.config.profile} has no successful sync timestamp. Run sync before reviewing reports or exporting local files.`,
    };
  }

  const lastSyncedTime = Date.parse(lastSyncedAt);

  if (!Number.isFinite(lastSyncedTime)) {
    return {
      title: "Sync timestamp needs attention",
      description: `The local ledger has an unreadable sync timestamp for ${snapshot.config.profile}. Run sync to refresh the local status.`,
    };
  }

  const oldestCursorUpdatedAt = snapshot.summary.oldestSyncCursorUpdatedAt;

  if (oldestCursorUpdatedAt) {
    const oldestCursorTime = Date.parse(oldestCursorUpdatedAt);

    if (!Number.isFinite(oldestCursorTime)) {
      return {
        title: "Sync cursor needs attention",
        description: `The local ledger has an unreadable cursor timestamp for ${snapshot.config.profile}. Run sync to refresh local statement progress.`,
      };
    }

    const cursorAgeMs = now - oldestCursorTime;

    if (cursorAgeMs > STALE_SYNC_THRESHOLD_MS) {
      return {
        title: "Statement cursor may be stale",
        description: `${snapshot.config.profile} has a statement cursor last updated ${formatSyncAge(
          cursorAgeMs,
        )}. Run sync before reviewing reports or exporting local files.`,
      };
    }
  }

  const ageMs = now - lastSyncedTime;

  if (ageMs <= STALE_SYNC_THRESHOLD_MS) {
    return undefined;
  }

  return {
    title: "Local data may be stale",
    description: `${snapshot.config.profile} last synced ${formatSyncAge(
      ageMs,
    )}. Run sync before reviewing reports or exporting local files.`,
  };
}

function formatSyncRunDuration(run: SyncRun): string {
  if (!run.finishedAt) {
    return run.status === "running" ? "Running" : "Not finished";
  }

  const startedAt = Date.parse(run.startedAt);
  const finishedAt = Date.parse(run.finishedAt);

  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(finishedAt) ||
    finishedAt < startedAt
  ) {
    return "Unknown";
  }

  const totalSeconds = Math.round((finishedAt - startedAt) / 1000);

  if (totalSeconds < 1) {
    return "<1 sec";
  }

  if (totalSeconds < 60) {
    return `${totalSeconds} sec`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function SyncRunStats({ run }: { run: SyncRun }) {
  const stats = [
    { label: "Seen", value: run.itemsSeen },
    { label: "API Calls", value: run.apiCalls },
    { label: "Windows", value: run.windowsFetched },
    { label: "Inserted", value: run.itemsInserted },
    { label: "Updated", value: run.itemsUpdated },
    { label: "Skipped", value: run.itemsSkipped },
    { label: "Rate-limited", value: run.rateLimited },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => (
        <div className="rounded-lg border bg-muted/30 p-2" key={stat.label}>
          <p className="text-xs text-muted-foreground">{stat.label}</p>
          <p className="text-sm font-semibold">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

function SyncRunSummaryStatsPanel({
  summary,
}: {
  summary: SyncRunSummaryStats;
}) {
  const stats = [
    { label: "Runs", value: summary.runs },
    { label: "API calls", value: summary.apiCalls },
    { label: "Windows fetched", value: summary.windowsFetched },
    { label: "Items seen", value: summary.itemsSeen },
    { label: "Inserted", value: summary.itemsInserted },
    { label: "Updated", value: summary.itemsUpdated },
    { label: "Skipped", value: summary.itemsSkipped },
    { label: "Rate-limited", value: summary.rateLimited },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          className="rounded-md border bg-muted/30 px-3 py-2"
          key={stat.label}
        >
          <p className="text-xs text-muted-foreground">{stat.label}</p>
          <p className="text-base font-semibold tabular-nums">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

function SyncHealthMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function SyncHealthSegment({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className: string;
}) {
  if (value === 0) {
    return null;
  }

  return (
    <div
      className={className}
      style={{ height: `${Math.max(6, (value / max) * 100)}%` }}
    />
  );
}

function SyncHealthChart({ runs }: { runs: readonly SyncRun[] }) {
  const summary = getSyncHealthSummary(runs);
  const totalActivity =
    summary.totals.success +
    summary.totals.partial +
    summary.totals.failed +
    summary.totals.skipped;
  const chartMax = Math.max(5, Math.ceil(summary.maxBucketTotal * 1.25));
  const firstBucketLabel = summary.buckets[0]?.label ?? "";
  const middleBucketLabel =
    summary.buckets[Math.floor(summary.buckets.length / 2)]?.label ?? "";
  const lastBucketLabel =
    summary.buckets[summary.buckets.length - 1]?.label ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>30-day sync health</CardTitle>
        <CardDescription>
          Successful, partial, failed, and skipped activity from local sync
          runs.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <SyncHealthMetric
            label="Successful"
            value={summary.totals.success}
            detail="Completed sync runs"
          />
          <SyncHealthMetric
            label="Partial"
            value={summary.totals.partial}
            detail="Runs with partial completion"
          />
          <SyncHealthMetric
            label="Failed"
            value={summary.totals.failed}
            detail="Runs that need attention"
          />
          <SyncHealthMetric
            label="Skipped"
            value={summary.totals.skipped}
            detail="Statement items skipped"
          />
        </div>

        {totalActivity === 0 ? (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>No sync activity in the last 30 days</AlertTitle>
            <AlertDescription>
              Run sync from the top bar to start building local health history.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-3">
            <div
              aria-label="Last 30 days sync health"
              className="rounded-lg border bg-muted/20 p-3"
              role="img"
            >
              <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Daily activity</span>
                <span>Peak day: {summary.maxBucketTotal}</span>
              </div>
              <div
                className="grid h-24 items-end gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${summary.buckets.length}, minmax(0, 1fr))`,
                }}
              >
                {summary.buckets.map((bucket, index) => {
                  const bucketTotal =
                    bucket.success +
                    bucket.partial +
                    bucket.failed +
                    bucket.skipped;

                  return (
                    <div
                      aria-label={`${bucket.label}: ${bucket.success} successful, ${bucket.partial} partial, ${bucket.failed} failed, ${bucket.skipped} skipped`}
                      className="flex h-full min-w-0 flex-col items-center justify-end"
                      key={bucket.key}
                      title={`${bucket.label}: ${bucketTotal} total`}
                    >
                      <div className="flex h-full w-full max-w-4 flex-col justify-end overflow-hidden rounded-sm bg-background shadow-inner sm:max-w-5">
                        {bucketTotal === 0 ? (
                          <div className="h-1 rounded-sm bg-muted" />
                        ) : (
                          <>
                            <SyncHealthSegment
                              value={bucket.skipped}
                              max={chartMax}
                              className="bg-slate-400"
                            />
                            <SyncHealthSegment
                              value={bucket.failed}
                              max={chartMax}
                              className="bg-destructive"
                            />
                            <SyncHealthSegment
                              value={bucket.partial}
                              max={chartMax}
                              className="bg-amber-500"
                            />
                            <SyncHealthSegment
                              value={bucket.success}
                              max={chartMax}
                              className="bg-emerald-600"
                            />
                          </>
                        )}
                      </div>
                      <span className="sr-only">
                        {index + 1} of {summary.buckets.length}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                <span>{firstBucketLabel}</span>
                <span>{middleBucketLabel}</span>
                <span>{lastBucketLabel}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-emerald-600" />
                Successful
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-amber-500" />
                Partial
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-destructive" />
                Failed
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-slate-400" />
                Skipped
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function activityEventCounts(
  events: readonly LocalActivityEvent[],
): LogEventTypeCounts {
  const counts: LogEventTypeCounts = {
    sync_run: 0,
    webhook_delivery: 0,
    ledger_write: 0,
    export: 0,
    report_refresh: 0,
    rule_application: 0,
    warning: 0,
    error: 0,
  };

  for (const event of events) {
    counts[event.type] += 1;
  }

  return counts;
}

function LogsEventRow({ event }: { event: LocalActivityEvent }) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">{event.title}</CardTitle>
            <CardDescription>
              {formatDateTime(event.timestamp)} · {event.source}
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Badge variant={activityEventTypeVariant(event.type)}>
              {LOG_EVENT_TYPE_LABELS[event.type]}
            </Badge>
            <Badge variant={statusVariant(event.severity)}>
              {event.severity}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{event.details}</p>
        {event.referenceId ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Reference {event.referenceId}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LogsRoute({ snapshot }: { snapshot: LocalAppSnapshot | undefined }) {
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] =
    useState<LogEventFilterState>(DEFAULT_LOG_FILTERS);

  const events = snapshot?.activityEvents ?? [];
  const eventCounts = useMemo(() => activityEventCounts(events), [events]);
  const activeFiltersCount = useMemo(
    () => Object.values(activeFilters).filter(Boolean).length,
    [activeFilters],
  );
  const searchValue = search.trim().toLowerCase();

  const visibleEvents = useMemo(() => {
    if (events.length === 0) {
      return [];
    }

    return events.filter((event) => {
      if (!activeFilters[event.type]) {
        return false;
      }

      if (!searchValue) {
        return true;
      }

      const text =
        `${event.title} ${event.details} ${event.source} ${event.referenceId ?? ""}`.toLowerCase();

      return text.includes(searchValue);
    });
  }, [events, activeFilters, searchValue]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Diagnostics timeline</CardTitle>
          <CardDescription>
            Filtered sync, webhook, export, rule, warning, and error events from
            the local activity stream.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              Object.keys(
                DEFAULT_LOG_FILTERS,
              ) as readonly LocalActivityEventType[]
            ).map((type) => (
              <Button
                key={type}
                size="sm"
                type="button"
                variant={activeFilters[type] ? "default" : "outline"}
                onClick={() =>
                  setActiveFilters((current) => ({
                    ...current,
                    [type]: !current[type],
                  }))
                }
              >
                {LOG_EVENT_TYPE_LABELS[type]}
                <Badge
                  className="ml-2"
                  variant={activeFilters[type] ? "secondary" : "outline"}
                >
                  {eventCounts[type]}
                </Badge>
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Search event messages
            </label>
            <Input
              type="search"
              placeholder="Search by title, details, or reference"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {activeFiltersCount === 0
              ? "No filters enabled"
              : `${activeFiltersCount} of ${Object.keys(DEFAULT_LOG_FILTERS).length} filter groups enabled`}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Latest local activity</CardTitle>
          <CardDescription>
            {events.length === 0
              ? "No activity events yet"
              : `${visibleEvents.length} event(s) match current filters`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <Alert>
              <AlertCircleIcon />
              <AlertTitle>No activity yet</AlertTitle>
              <AlertDescription>
                Run sync and webhook reconciliation to seed local diagnostics.
              </AlertDescription>
            </Alert>
          ) : visibleEvents.length === 0 ? (
            <Alert>
              <AlertCircleIcon />
              <AlertTitle>No matching events</AlertTitle>
              <AlertDescription>
                Adjust search text or enable filters to show matching events.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-3">
              {visibleEvents.map((event) => (
                <LogsEventRow event={event} key={event.id} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function webhookDeliveryKey(event: WebhookEvent): string {
  return `${event.accountId}:${event.statementItemId ?? event.id}`;
}

function webhookDeliveryStatus(event: WebhookEvent): string {
  switch (event.status) {
    case "processed":
      return "reconciled";
    case "pending":
      return "pending reconcile";
    case "duplicate":
      return "duplicate";
    case "ignored":
      return "ignored";
    case "failed":
      return "failed";
  }
}

function webhookEventLabel(event: WebhookEvent): string {
  return event.type === "StatementItem" ? "Statement item" : event.type;
}

function webhookDeliveryDestination(event: WebhookEvent): string {
  return event.statementItemId ? "Statement pull queue" : "Local webhook inbox";
}

function webhookDeliveryAttemptCounts(
  events: readonly WebhookEvent[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const event of events) {
    const key = webhookDeliveryKey(event);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function RecentWebhookDeliveriesCard({
  events,
  onRouteChange,
  limit = 3,
}: {
  events: readonly WebhookEvent[];
  onRouteChange: (routeId: RouteId) => void;
  limit?: number;
}) {
  const visibleEvents = events.slice(0, limit);
  const attemptCounts = webhookDeliveryAttemptCounts(events);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest webhook deliveries</CardTitle>
        <CardDescription>
          Local delivery hints waiting for statement pull reconciliation.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => onRouteChange("sync")}
          >
            <FileClockIcon data-icon="inline-start" />
            Webhooks
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {visibleEvents.length === 0 ? (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>No webhook deliveries recorded</AlertTitle>
            <AlertDescription>
              Monobank webhook events will appear here as local pull-required
              hints.
            </AlertDescription>
          </Alert>
        ) : (
          visibleEvents.map((event) => {
            const attempts = attemptCounts.get(webhookDeliveryKey(event)) ?? 1;

            return (
              <div
                className="flex flex-col gap-3 rounded-lg border p-3"
                key={event.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {webhookEventLabel(event)}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {event.statementItemId ?? event.id}
                    </p>
                  </div>
                  <Badge
                    variant={
                      event.status === "failed"
                        ? "destructive"
                        : event.status === "processed"
                          ? "default"
                          : event.status === "duplicate"
                            ? "outline"
                            : "secondary"
                    }
                  >
                    {webhookDeliveryStatus(event)}
                  </Badge>
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Source account</p>
                    <p className="truncate font-medium">{event.accountId}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Local destination</p>
                    <p className="font-medium">
                      {webhookDeliveryDestination(event)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Attempts</p>
                    <p className="font-medium">{attempts}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Received</p>
                    <p className="font-medium">
                      {formatDateTime(event.receivedAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function RecentSyncRunsCard({
  runs,
  onRouteChange,
  limit = 3,
}: {
  runs: readonly SyncRun[];
  onRouteChange: (routeId: RouteId) => void;
  limit?: number;
}) {
  const visibleRuns = runs.slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent sync jobs</CardTitle>
        <CardDescription>
          Latest local sync activity with transaction counts and duration.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => onRouteChange("logs")}
          >
            <FileClockIcon data-icon="inline-start" />
            Logs
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {visibleRuns.length === 0 ? (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>No sync runs recorded</AlertTitle>
            <AlertDescription>
              Run fixture sync from the top bar to create the first local run.
            </AlertDescription>
          </Alert>
        ) : (
          visibleRuns.map((run) => (
            <div
              className="flex flex-col gap-3 rounded-lg border p-3"
              key={run.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{run.id}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(run.startedAt)} /{" "}
                    {formatSyncRunDuration(run)}
                  </p>
                </div>
                <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
              </div>
              <SyncRunStats run={run} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SyncRunsTable({ runs }: { runs: readonly SyncRun[] }) {
  if (runs.length === 0) {
    return (
      <Alert>
        <AlertCircleIcon />
        <AlertTitle>No sync runs recorded</AlertTitle>
        <AlertDescription>
          Run fixture sync from the top bar to create the first local run.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Run</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Transactions</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.slice(0, 10).map((run) => (
            <TableRow key={run.id}>
              <TableCell>
                <div className="max-w-52">
                  <p className="truncate font-mono text-xs">{run.id}</p>
                  <p className="text-xs text-muted-foreground">{run.profile}</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDateTime(run.startedAt)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatSyncRunDuration(run)}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{run.itemsSeen} seen</Badge>
                  <Badge variant="outline">{run.itemsInserted} inserted</Badge>
                  <Badge variant="outline">{run.itemsUpdated} updated</Badge>
                  <Badge variant="outline">{run.itemsSkipped} skipped</Badge>
                  <Badge variant="outline">{run.apiCalls} API calls</Badge>
                  <Badge variant="outline">{run.windowsFetched} windows</Badge>
                  {run.rateLimited > 0 ? (
                    <Badge variant="destructive">
                      {run.rateLimited} rate-limited
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{run.source}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function WebhookSettingsPanel({
  config,
}: {
  config: LocalAppSnapshot["config"] | undefined;
}) {
  const webhook = config?.webhook;
  const settings = [
    {
      label: "Profile",
      value: config?.profile ?? "Waiting for local API",
      mono: false,
    },
    {
      label: "Port",
      value: webhook ? String(webhook.port) : "Unknown",
      mono: true,
    },
    {
      label: "Path",
      value: webhook?.path ?? "Unknown",
      mono: true,
    },
    {
      label: "Enabled",
      value: webhook?.enabled ? "Enabled" : "Disabled",
      mono: false,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhook settings</CardTitle>
        <CardDescription>
          Local endpoint configuration used by the Monobank personal API.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100">
          <AlertCircleIcon />
          <AlertTitle>Personal webhook payloads are hints</AlertTitle>
          <AlertDescription className="text-amber-900/85 dark:text-amber-100/85">
            Until Monobank documents a verifiable personal webhook signature,
            treat every payload as advisory and reconcile it through statement
            pulls before relying on ledger changes.
          </AlertDescription>
        </Alert>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {settings.map((setting) => (
            <div
              className="rounded-md border border-border bg-muted/30 px-3 py-2"
              key={setting.label}
            >
              <p className="text-xs text-muted-foreground">{setting.label}</p>
              {setting.label === "Enabled" ? (
                <Badge variant={webhook?.enabled ? "default" : "secondary"}>
                  {setting.value}
                </Badge>
              ) : (
                <p
                  className={
                    setting.mono
                      ? "break-all font-mono text-sm font-medium"
                      : "break-all text-sm font-medium"
                  }
                >
                  {setting.value}
                </p>
              )}
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Webhook endpoint</p>
          <p className="break-all font-mono text-sm font-medium">
            {webhook?.url ?? "Waiting for local API"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StaleDataBanner({
  snapshot,
  syncing,
  onRunSync,
  onRouteChange,
}: {
  snapshot: LocalAppSnapshot | undefined;
  syncing: boolean;
  onRunSync: () => void;
  onRouteChange: (routeId: RouteId) => void;
}) {
  const warning = getLedgerFreshnessWarning(snapshot);

  if (!warning) {
    return null;
  }

  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100">
      <AlertCircleIcon />
      <AlertTitle>{warning.title}</AlertTitle>
      <AlertDescription className="text-amber-900/85 dark:text-amber-100/85">
        {warning.description}
      </AlertDescription>
      <AlertAction className="static col-start-2 mt-2 flex flex-wrap gap-2">
        <Button size="sm" type="button" disabled={syncing} onClick={onRunSync}>
          <RefreshCwIcon data-icon="inline-start" />
          {syncing ? "Syncing" : "Run Sync"}
        </Button>
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => onRouteChange("sync")}
        >
          Sync controls
        </Button>
      </AlertAction>
    </Alert>
  );
}

function OfflineBrowsingBanner({
  error,
  snapshot,
  loading,
  onRefresh,
}: {
  error: string | undefined;
  snapshot: LocalAppSnapshot | undefined;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (!error || !snapshot) {
    return null;
  }

  return (
    <Alert className="border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-900/70 dark:bg-sky-950/25 dark:text-sky-100">
      <WifiOffIcon />
      <AlertTitle>Browsing last local snapshot</AlertTitle>
      <AlertDescription className="text-sky-900/85 dark:text-sky-100/85">
        The local API did not respond: {error}. Existing ledger data for{" "}
        {snapshot.config.profile} is still visible from the last successful load
        {snapshot.offline
          ? ` at ${formatDateTime(snapshot.offline.cachedAt)}`
          : ""}
        .
      </AlertDescription>
      <AlertAction className="static col-start-2 mt-2 flex flex-wrap gap-2">
        <Button size="sm" type="button" disabled={loading} onClick={onRefresh}>
          <RefreshCwIcon data-icon="inline-start" />
          {loading ? "Refreshing" : "Retry API"}
        </Button>
      </AlertAction>
    </Alert>
  );
}

function LocalOnlyIndicator({
  snapshot,
  loading,
}: {
  snapshot: LocalAppSnapshot | undefined;
  loading: boolean;
}) {
  const label = snapshot
    ? snapshot.config.localOnly
      ? "Local only"
      : "External connection"
    : loading
      ? "Checking local"
      : "Local unavailable";
  const detail = snapshot
    ? `${snapshot.health.status} API / ${snapshot.config.source} source`
    : "Waiting for the local Fastify API";
  const variant = snapshot?.config.localOnly
    ? "secondary"
    : snapshot
      ? "destructive"
      : "outline";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className="hidden md:inline-flex" variant={variant}>
          <ShieldCheckIcon data-icon="inline-start" />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}

function ProfileMenu({ snapshot }: { snapshot: LocalAppSnapshot | undefined }) {
  const profile = snapshot?.config.profile ?? "Loading";
  const source = snapshot?.config.source ?? "fixture";
  const databasePath = snapshot?.config.databasePath ?? "Waiting for local API";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="hidden max-w-48 justify-start lg:inline-flex"
          size="sm"
          type="button"
          variant="outline"
        >
          <UserRoundIcon data-icon="inline-start" />
          <span className="truncate">{profile}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Local profile</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={profile}>
          <DropdownMenuRadioItem value={profile}>
            {profile}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled>
            <DatabaseIcon data-icon="inline-start" />
            {source} source
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <FileClockIcon data-icon="inline-start" />
            <span className="truncate">{databasePath}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeModeControl({
  themeMode,
  onThemeModeChange,
}: {
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
}) {
  const ThemeIcon =
    themeMode === "dark"
      ? MoonIcon
      : themeMode === "light"
        ? SunIcon
        : LaptopIcon;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button size="icon" type="button" variant="outline">
              <ThemeIcon data-icon="inline-start" />
              <span className="sr-only">Theme mode</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Theme: {themeModeLabel(themeMode)}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={themeMode}
          onValueChange={(value) => {
            if (isThemeMode(value)) {
              onThemeModeChange(value);
            }
          }}
        >
          <DropdownMenuRadioItem value="system">
            <LaptopIcon data-icon="inline-start" />
            System
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <SunIcon data-icon="inline-start" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon data-icon="inline-start" />
            Dark
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppSidebar({
  activeRoute,
  onRouteChange,
  snapshot,
}: {
  activeRoute: RouteId;
  onRouteChange: (routeId: RouteId) => void;
  snapshot: LocalAppSnapshot | undefined;
}) {
  const healthStatus = snapshot?.health.status ?? "checking";
  const appVersion = snapshot?.health.version
    ? `v${snapshot.health.version}`
    : "pending";
  const databasePath = snapshot?.config.databasePath ?? "Waiting for local API";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <DatabaseIcon />
          </div>
          <div className="grid min-w-0 text-sm">
            <span className="truncate font-semibold">mono-ledger-sync</span>
            <span className="truncate text-xs text-sidebar-foreground/70">
              Local ledger
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {routes.map((route) => (
                <SidebarMenuItem key={route.id}>
                  <SidebarMenuButton
                    isActive={activeRoute === route.id}
                    onClick={() => onRouteChange(route.id)}
                    tooltip={route.label}
                  >
                    <route.icon />
                    <span>{route.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Local context</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryRoutes.map((route) => (
                <SidebarMenuItem key={route.label}>
                  <SidebarMenuButton tooltip={route.label}>
                    <route.icon />
                    <span>{route.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex flex-col gap-3 rounded-lg border bg-sidebar-accent/55 p-3 text-xs group-data-[collapsible=icon]:hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Local status</span>
            <Badge variant={healthStatus === "ok" ? "default" : "secondary"}>
              {healthStatus}
            </Badge>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sidebar-foreground/70">Version</span>
              <span className="font-medium">{appVersion}</span>
            </div>
            <div className="grid gap-1">
              <span className="text-sidebar-foreground/70">Database</span>
              <p className="line-clamp-2 break-all text-sidebar-foreground/80">
                {databasePath}
              </p>
            </div>
          </div>
          <Button
            className="w-full justify-start"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => onRouteChange("logs")}
          >
            <FileClockIcon data-icon="inline-start" />
            Diagnostics
          </Button>
        </div>
        <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Diagnostics"
              onClick={() => onRouteChange("logs")}
            >
              <FileClockIcon />
              <span>Diagnostics</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function MobileNav({
  activeRoute,
  onRouteChange,
}: {
  activeRoute: RouteId;
  onRouteChange: (routeId: RouteId) => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="md:hidden" size="icon" variant="outline">
          <MenuIcon data-icon="inline-start" />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Choose a workspace route.
          </SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4">
          {routes.map((route) => (
            <SheetClose asChild key={route.id}>
              <Button
                className="justify-start"
                variant={activeRoute === route.id ? "secondary" : "ghost"}
                onClick={() => onRouteChange(route.id)}
              >
                <route.icon data-icon="inline-start" />
                {route.label}
              </Button>
            </SheetClose>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MetricCard({
  title,
  value,
  description,
  freshness,
  drillDownHref,
  drillDownLabel,
}: {
  title: string;
  value: string;
  description: string;
  freshness: string;
  drillDownHref: string;
  drillDownLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        <Badge className="w-fit" variant="secondary">
          {freshness}
        </Badge>
        <Button asChild className="w-fit" size="sm" variant="outline">
          <a href={drillDownHref}>
            {drillDownLabel}
            <ChevronRightIcon data-icon="inline-end" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

function MetricLoadingGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TableLoadingSkeleton({
  columns,
  rows,
}: {
  columns: number;
  rows: number;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: columns }).map((_, index) => (
              <TableHead key={index}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: columns }).map((_, columnIndex) => (
                <TableCell key={columnIndex}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OverviewLoadingSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Overview loading"
      className="flex flex-col gap-4"
    >
      <MetricLoadingGrid />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="flex flex-col gap-2" key={index}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardHeader>
          <CardContent>
            <TableLoadingSkeleton columns={6} rows={6} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton className="h-24 w-full" key={index} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TransactionsLoadingSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Transactions loading">
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton className="h-9 w-full" key={index} />
          ))}
        </div>
        <TableLoadingSkeleton columns={7} rows={8} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-4 w-36" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SyncLoadingSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Sync and webhooks loading"
      className="flex flex-col gap-2"
    >
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton className="h-9 w-24" key={index} />
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent>
          <TableLoadingSkeleton columns={6} rows={6} />
        </CardContent>
      </Card>
    </div>
  );
}

function AccountsLoadingSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Accounts loading"
      className="flex flex-col gap-4"
    >
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="flex flex-col gap-2" key={index}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton className="h-44 w-full" key={index} />
        ))}
      </div>
    </div>
  );
}

function PlaceholderLoadingSkeleton({ routeId }: { routeId: RouteId }) {
  const metadata = routeMetadata(routeId);

  return (
    <Card aria-busy="true" aria-label={`${metadata.title} loading`}>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton className="h-24 w-full" key={index} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RouteLoadingSkeleton({ routeId }: { routeId: RouteId }) {
  switch (routeId) {
    case "overview":
      return <OverviewLoadingSkeleton />;
    case "transactions":
      return <TransactionsLoadingSkeleton />;
    case "sync":
      return <SyncLoadingSkeleton />;
    case "settings":
      return <SettingsLoadingSkeleton />;
    case "accounts":
      return <AccountsLoadingSkeleton />;
    default:
      return <PlaceholderLoadingSkeleton routeId={routeId} />;
  }
}

function SettingsLoadingSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Settings loading">
      <CardHeader>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </CardHeader>
      <CardContent className="grid gap-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </CardContent>
    </Card>
  );
}

function OverviewStatusItem({
  label,
  value,
  detail,
  badge,
  badgeVariant = "secondary",
}: {
  label: string;
  value: string;
  detail: string;
  badge?: string | undefined;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-lg font-semibold">{value}</span>
        {badge && (
          <Badge className="shrink-0" variant={badgeVariant}>
            {badge}
          </Badge>
        )}
      </div>
      <p className="line-clamp-2 break-all text-sm text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function SortableTableHead({
  field,
  label,
  sortBy,
  sortDirection,
  className,
  align = "left",
  onSortChange,
}: {
  field: LedgerTransactionSortField;
  label: string;
  sortBy: LedgerTransactionSortField | undefined;
  sortDirection: LedgerTransactionSortDirection | undefined;
  className?: string;
  align?: "left" | "right";
  onSortChange: ((field: LedgerTransactionSortField) => void) | undefined;
}) {
  const isActive = sortBy === field;
  const ariaSort = isActive
    ? sortDirection === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const SortIcon = isActive
    ? sortDirection === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon
    : ArrowUpDownIcon;

  if (!onSortChange) {
    return <TableHead className={className}>{label}</TableHead>;
  }

  return (
    <TableHead className={className} aria-sort={ariaSort}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`h-7 px-2 font-medium ${
          align === "right" ? "ml-auto" : "-ml-2"
        } ${isActive ? "text-foreground" : "text-muted-foreground"}`}
        onClick={() => onSortChange(field)}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <SortIcon data-icon="inline-end" />
      </Button>
    </TableHead>
  );
}

function TransactionDetailField({
  label,
  value,
  valueClassName = "text-foreground",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`break-words text-sm ${valueClassName}`}>{value}</dd>
    </div>
  );
}

function optionalAmount(value: number | undefined, currencyCode: number) {
  return value === undefined
    ? "Not provided"
    : formatMinorAmount(value, currencyCode);
}

function transactionCategoryLabel(entry: LedgerEntry): string {
  return entry.categoryName ?? entry.categoryId ?? "Uncategorized";
}

function transactionCategoryBadgeClassName(entry: LedgerEntry): string {
  const categoryKey =
    `${entry.categoryId ?? ""} ${entry.categoryName ?? ""}`.toLowerCase();

  if (
    categoryKey.includes("failed") ||
    categoryKey.includes("declined") ||
    categoryKey.includes("rejected")
  ) {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300";
  }

  if (categoryKey.includes("cashback") || categoryKey.includes("cash back")) {
    return "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300";
  }

  if (
    categoryKey.includes("fuel") ||
    categoryKey.includes("gas") ||
    categoryKey.includes("charging")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
  }

  if (
    categoryKey.includes("transport") ||
    categoryKey.includes("metro") ||
    categoryKey.includes("taxi")
  ) {
    return "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/60 dark:bg-purple-950/30 dark:text-purple-300";
  }

  if (
    categoryKey.includes("grocery") ||
    categoryKey.includes("groceries") ||
    categoryKey.includes("subscription") ||
    categoryKey.includes("travel") ||
    categoryKey.includes("info")
  ) {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300";
  }

  if (entry.amount > 0 || categoryKey.includes("income")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300";
  }

  return "border-border bg-background text-muted-foreground";
}

function TransactionCategoryBadge({
  entry,
  className = "",
}: {
  entry: LedgerEntry;
  className?: string;
}) {
  return (
    <Badge
      className={`${transactionCategoryBadgeClassName(entry)} ${className}`}
      variant="outline"
    >
      {transactionCategoryLabel(entry)}
    </Badge>
  );
}

function transactionCategoryRuleMatch(entry: LedgerEntry): string {
  if (entry.categorySource === "manual") {
    return "Manual category override";
  }

  if (entry.categorySource === "user_rule" && entry.categoryRuleId) {
    return `User rule ${entry.categoryRuleId}`;
  }

  if (entry.categorySource === "system_rule" && entry.categoryRuleId) {
    return `System rule ${entry.categoryRuleId}`;
  }

  switch (entry.categoryId) {
    case "income":
      return "Built-in positive amount rule";
    case "groceries":
      return "Built-in groceries rule: MCC 5411 or grocery text";
    case "subscriptions":
      return "Built-in subscription rule: MCC 5734 or subscription text";
    case "transport":
      return "Built-in transport rule: MCC 4111 or metro text";
    case "travel":
      return "Built-in travel rule: MCC 4722 or travel text";
    case "dining":
      return "Built-in dining rule: MCC 5814 or coffee text";
    case "utilities":
      return "Built-in utilities rule: MCC 4900 or utility text";
    case "healthcare":
      return "Built-in healthcare rule: MCC 5912 or pharmacy text";
    case "shopping":
      return "Built-in shopping rule: MCC 5311 or marketplace text";
    case "household":
      return "Built-in household rule: MCC 5200 or household text";
    case "education":
      return "Built-in education rule: MCC 8299 or education text";
    case "taxes":
      return "Built-in taxes rule: MCC 9311 or tax text";
    case "charity":
      return "Built-in charity rule: MCC 8398 or donation text";
    case "cash":
      return "Built-in cash rule: MCC 6011 or ATM text";
    case "fees":
      return "Built-in fees rule: MCC 6012 or fee text";
    case "transfers":
      return "Built-in transfer rule: MCC 4829 or transfer text";
    case "uncategorized":
      return "Fallback: no built-in category rule matched";
    default:
      return entry.categoryId
        ? `Stored local category: ${entry.categoryId}`
        : "No category assignment stored";
  }
}

type SplitPlanLineInput = {
  category: string;
  amount: string;
};

type ParsedSplitPlanLine = {
  category: string;
  amount: number;
};

function splitPlanLineInputAmount(amount: number): string {
  return (amount / 100).toFixed(2).replace(/\.?0+$/, "");
}

function splitPlanLinesFromEntry(entry: LedgerEntry): SplitPlanLineInput[] {
  const lines = entry.splitPlan;

  if (lines && lines.length > 0) {
    return lines.map((line) => ({
      category: line.category,
      amount: splitPlanLineInputAmount(line.amount),
    }));
  }

  return [
    {
      category: transactionCategoryLabel(entry),
      amount: splitPlanLineInputAmount(entry.amount),
    },
  ];
}

function transactionCategoryHistory(entry: LedgerEntry): string {
  if (!entry.categoryId || entry.categoryId === "uncategorized") {
    return "Initial ledger assignment only; no category changes recorded";
  }

  if (entry.categorySource === "manual") {
    return "Category was manually assigned";
  }

  if (entry.categoryRuleVersion) {
    return `Assigned from current sync rules at version ${entry.categoryRuleVersion}`;
  }

  return "Initial ledger assignment from the current sync rules";
}

function syncSourceLabel(
  source: LocalAppSnapshot["config"]["source"] | undefined,
) {
  switch (source) {
    case "fixture":
      return "Fixture sync";
    case "monobank":
      return "Monobank personal API sync";
    default:
      return "Local sync";
  }
}

function latestSyncRunSummary(run: SyncRun | undefined): string {
  if (!run) {
    return "No sync run recorded";
  }

  const finished = run.finishedAt
    ? `finished ${formatDateTime(run.finishedAt)}`
    : "not finished";

  return `${run.status}, ${finished}; ${run.itemsSeen} seen, ${run.itemsInserted} inserted, ${run.itemsUpdated} updated`;
}

function matchingWebhookHint(
  entry: LedgerEntry,
  events: readonly WebhookEvent[],
): WebhookEvent | undefined {
  return events.find(
    (event) => event.statementItemId === entry.rawStatementItemId,
  );
}

function webhookHintSummary(event: WebhookEvent | undefined): string {
  if (!event) {
    return "No matching webhook hint recorded";
  }

  const processed =
    event.status === "processed"
      ? `processed ${formatDateTime(event.processedAt ?? event.receivedAt)}`
      : event.status === "failed"
        ? `failed ${formatDateTime(event.receivedAt)}`
        : event.status === "duplicate"
          ? "duplicate ignored"
          : event.status === "ignored"
            ? "ignored"
            : "pending reconcile";

  return `${event.type} received ${formatDateTime(event.receivedAt)}; ${processed}`;
}

function tagsInputValue(tags: readonly string[] | undefined): string {
  return tags?.join(", ") ?? "";
}

function parseTagsInput(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

function splitPlanLineStateFromDraft(
  line: SplitPlanLineInput,
): ParsedSplitPlanLine | undefined {
  const category = line.category.trim();
  const amount = amountInputToMinor(line.amount);

  if (!category || amount === undefined) {
    return undefined;
  }

  return { category, amount };
}

function splitPlanLineStateToPayload(lines: readonly SplitPlanLineInput[]) {
  return lines
    .map((line) => splitPlanLineStateFromDraft(line))
    .filter((line): line is ParsedSplitPlanLine => line !== undefined);
}

function splitPlanLinesMatch(
  left: readonly ParsedSplitPlanLine[],
  right: readonly ParsedSplitPlanLine[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => {
    const other = right[index];

    return (
      other !== undefined &&
      entry.category === other.category &&
      entry.amount === other.amount
    );
  });
}

function TransactionDetailDrawer({
  entry,
  open,
  onOpenChange,
  onEntryUpdated,
  source,
  syncRuns = [],
  webhookEvents = [],
}: {
  entry: LedgerEntry | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEntryUpdated: (entry: LedgerEntry) => void;
  source: LocalAppSnapshot["config"]["source"] | undefined;
  syncRuns: readonly SyncRun[] | undefined;
  webhookEvents: readonly WebhookEvent[] | undefined;
}) {
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [splitPlanLines, setSplitPlanLines] = useState<
    readonly SplitPlanLineInput[]
  >([]);
  const [splitPlanSaveState, setSplitPlanSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const openRef = useRef(open);
  const entryIdRef = useRef(entry?.id);
  const title = entry?.merchantName ?? entry?.description ?? "Transaction";
  const status = entry?.hold ? "Hold" : "Posted";
  const latestRun = syncRuns[0];
  const webhookHint = entry
    ? matchingWebhookHint(entry, webhookEvents)
    : undefined;
  const annotationChanged =
    entry !== undefined &&
    (note !== (entry.note ?? "") || tags !== tagsInputValue(entry.tags));
  const splitPlanParsedLines = useMemo(
    () => splitPlanLineStateToPayload(splitPlanLines),
    [splitPlanLines],
  );
  const splitPlanLinesTotal = useMemo(
    () => splitPlanParsedLines.reduce((total, line) => total + line.amount, 0),
    [splitPlanParsedLines],
  );
  const splitPlanBaselineLines = useMemo(() => {
    if (!entry) {
      return [];
    }

    return splitPlanLineStateToPayload(splitPlanLinesFromEntry(entry));
  }, [entry]);
  const splitPlanHasInvalidLine =
    splitPlanParsedLines.length !== splitPlanLines.length;
  const splitPlanHasInvalidTotal =
    !!entry &&
    splitPlanParsedLines.length > 0 &&
    splitPlanLinesTotal !== entry.amount;
  const splitPlanChanged =
    !splitPlanLinesMatch(splitPlanParsedLines, splitPlanBaselineLines) ||
    splitPlanParsedLines.length !== splitPlanBaselineLines.length;
  const canSaveSplitPlan =
    splitPlanChanged &&
    !splitPlanHasInvalidLine &&
    !splitPlanHasInvalidTotal &&
    splitPlanSaveState !== "saving";

  useEffect(() => {
    setNote(entry?.note ?? "");
    setTags(tagsInputValue(entry?.tags));
    setSaveState("idle");
    setSplitPlanLines(entry ? splitPlanLinesFromEntry(entry) : []);
    setSplitPlanSaveState("idle");
  }, [entry]);

  useEffect(() => {
    openRef.current = open;
    entryIdRef.current = entry?.id;
  }, [entry?.id, open]);

  async function saveAnnotation(): Promise<void> {
    if (!entry || saveState === "saving") {
      return;
    }

    const savedEntryId = entry.id;

    setSaveState("saving");

    try {
      const updatedEntry = await updateLedgerTransactionAnnotation(entry.id, {
        note,
        tags: parseTagsInput(tags),
      });

      if (!openRef.current || entryIdRef.current !== savedEntryId) {
        return;
      }

      onEntryUpdated(updatedEntry);
      setSaveState("saved");
    } catch {
      if (!openRef.current || entryIdRef.current !== savedEntryId) {
        return;
      }

      setSaveState("error");
    }
  }

  function addSplitPlanLine(): void {
    if (splitPlanLines.length >= MAX_SPLIT_PLAN_LINES) {
      return;
    }

    setSplitPlanLines((current) => [...current, { category: "", amount: "" }]);
    setSplitPlanSaveState("idle");
  }

  function removeSplitPlanLine(index: number): void {
    setSplitPlanLines((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
    setSplitPlanSaveState("idle");
  }

  function updateSplitPlanLine(
    index: number,
    value: string,
    field: "category" | "amount",
  ): void {
    setSplitPlanLines((current) => {
      return current.map((line, lineIndex) => {
        if (lineIndex !== index) {
          return line;
        }

        return {
          ...line,
          [field]: value,
        };
      });
    });
    setSplitPlanSaveState("idle");
  }

  async function saveSplitPlan(): Promise<void> {
    if (!entry || splitPlanSaveState === "saving" || splitPlanHasInvalidLine) {
      return;
    }

    const savedEntryId = entry.id;

    setSplitPlanSaveState("saving");

    try {
      const updatedEntry = await updateLedgerTransactionSplitPlan(entry.id, {
        lines: splitPlanParsedLines,
      });

      if (!openRef.current || entryIdRef.current !== savedEntryId) {
        return;
      }

      onEntryUpdated(updatedEntry);
      setSplitPlanSaveState("saved");
    } catch {
      if (!openRef.current || entryIdRef.current !== savedEntryId) {
        return;
      }

      setSplitPlanSaveState("error");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {entry
              ? `${formatDateTime(entry.time)} · ${formatMinorAmount(
                  entry.amount,
                  entry.currencyCode,
                )}`
              : "Transaction details"}
          </SheetDescription>
        </SheetHeader>

        {entry && (
          <div className="flex flex-col gap-5 px-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Amount
                </span>
                <span className="text-2xl font-semibold text-foreground">
                  {formatMinorAmount(entry.amount, entry.currencyCode)}
                </span>
              </div>
              <Badge variant={entry.hold ? "secondary" : "outline"}>
                {status}
              </Badge>
            </div>

            <Separator />

            <section className="grid gap-3">
              <h3 className="text-sm font-medium text-foreground">
                Normalized fields
              </h3>
              <dl className="grid gap-3">
                <TransactionDetailField
                  label="Date"
                  value={formatDateTime(entry.time)}
                />
                <TransactionDetailField
                  label="Merchant"
                  value={entry.merchantName ?? "Not provided"}
                />
                <TransactionDetailField
                  label="Description"
                  value={entry.description}
                />
                <TransactionDetailField
                  label="Account"
                  value={entry.accountId}
                />
                <div className="grid gap-1">
                  <dt className="text-xs font-medium text-muted-foreground">
                    Category
                  </dt>
                  <dd>
                    <TransactionCategoryBadge entry={entry} />
                  </dd>
                </div>
                <TransactionDetailField
                  label="Currency"
                  value={String(entry.currencyCode)}
                />
              </dl>
            </section>

            <Separator />

            <section className="grid gap-3">
              <h3 className="text-sm font-medium text-foreground">
                Category provenance
              </h3>
              <dl className="grid gap-3">
                <div className="grid gap-1">
                  <dt className="text-xs font-medium text-muted-foreground">
                    Current assignment
                  </dt>
                  <dd>
                    <TransactionCategoryBadge entry={entry} />
                  </dd>
                </div>
                <TransactionDetailField
                  label="Rule match"
                  value={transactionCategoryRuleMatch(entry)}
                />
                <TransactionDetailField
                  label="History"
                  value={transactionCategoryHistory(entry)}
                />
              </dl>
            </section>

            <Separator />

            <section className="grid gap-3">
              <h3 className="text-sm font-medium text-foreground">
                Local annotations
              </h3>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Note
                </span>
                <textarea
                  className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  maxLength={2000}
                  placeholder="Local review note"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    setSaveState("idle");
                  }}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Tags
                </span>
                <Input
                  placeholder="tax, travel, reimbursable"
                  value={tags}
                  onChange={(event) => {
                    setTags(event.target.value);
                    setSaveState("idle");
                  }}
                />
              </label>
              {entry.tags && entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {entry.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    void saveAnnotation();
                  }}
                  disabled={!annotationChanged || saveState === "saving"}
                >
                  <StickyNoteIcon data-icon="inline-start" />
                  {saveState === "saving" ? "Saving" : "Save annotations"}
                </Button>
                {saveState === "saved" && (
                  <span className="text-xs text-muted-foreground">Saved</span>
                )}
                {saveState === "error" && (
                  <span className="text-xs text-destructive">
                    Could not save annotations
                  </span>
                )}
              </div>
            </section>

            <Separator />

            <section className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-foreground">
                  Split planning
                </h3>
                <Badge variant="secondary">Local draft</Badge>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Line</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-10"> </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {splitPlanLines.map((line, index) => {
                      const amountInputIsInvalid =
                        amountInputToMinor(line.amount) === undefined;
                      const categoryError = !line.category.trim();
                      const amountError =
                        !line.amount.trim() || amountInputIsInvalid;

                      return (
                        <TableRow key={`${entry.id}-${index}`}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell className="space-y-1">
                            <Input
                              value={line.category}
                              placeholder="Category"
                              onChange={(event) => {
                                updateSplitPlanLine(
                                  index,
                                  event.target.value,
                                  "category",
                                );
                              }}
                            />
                            {categoryError && (
                              <span className="text-xs text-destructive">
                                Enter a category
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="space-y-1">
                            <Input
                              inputMode="decimal"
                              placeholder="-12.34"
                              value={line.amount}
                              onChange={(event) => {
                                updateSplitPlanLine(
                                  index,
                                  event.target.value,
                                  "amount",
                                );
                              }}
                            />
                            {amountError && (
                              <span className="text-xs text-destructive">
                                Enter a valid amount
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove split line ${index + 1}`}
                              onClick={() => {
                                removeSplitPlanLine(index);
                              }}
                            >
                              <XIcon />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {splitPlanLines.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <span className="text-xs text-muted-foreground">
                            No split lines yet.
                          </span>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Split drafts stay local in review data and do not rewrite raw
                Monobank payloads.
              </p>
              {entry && splitPlanParsedLines.length > 0 ? (
                <p className="text-xs">
                  <span
                    className={
                      splitPlanHasInvalidTotal
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }
                  >
                    Total draft:{" "}
                    {formatMinorAmount(splitPlanLinesTotal, entry.currencyCode)}
                  </span>
                  <span className="text-muted-foreground"> · Target: </span>
                  <span
                    className={
                      splitPlanHasInvalidTotal
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }
                  >
                    {formatMinorAmount(entry.amount, entry.currencyCode)}
                  </span>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    addSplitPlanLine();
                  }}
                  disabled={splitPlanLines.length >= MAX_SPLIT_PLAN_LINES}
                >
                  <PlusIcon data-icon="inline-start" />
                  Add split line
                </Button>
                <Button
                  type="button"
                  disabled={!canSaveSplitPlan}
                  onClick={() => {
                    void saveSplitPlan();
                  }}
                >
                  <SplitIcon data-icon="inline-start" />
                  Save split plan
                </Button>
                {splitPlanSaveState === "saved" && (
                  <span className="text-xs text-muted-foreground">Saved</span>
                )}
                {splitPlanSaveState === "error" && (
                  <span className="text-xs text-destructive">
                    Could not save split plan
                  </span>
                )}
              </div>
            </section>

            <Separator />

            <section className="grid gap-3">
              <h3 className="text-sm font-medium text-foreground">
                Sync provenance
              </h3>
              <dl className="grid gap-3">
                <TransactionDetailField
                  label="Source"
                  value={syncSourceLabel(source)}
                />
                <TransactionDetailField
                  label="Latest local sync"
                  value={latestSyncRunSummary(latestRun)}
                />
                <TransactionDetailField
                  label="Ledger created"
                  value={
                    entry.createdAt
                      ? formatDateTime(entry.createdAt)
                      : "Not available"
                  }
                />
                <TransactionDetailField
                  label="Ledger updated"
                  value={
                    entry.updatedAt
                      ? formatDateTime(entry.updatedAt)
                      : "Not available"
                  }
                />
                <TransactionDetailField
                  label="Webhook hint"
                  value={webhookHintSummary(webhookHint)}
                />
              </dl>
            </section>

            <Separator />

            <section className="grid gap-3">
              <h3 className="text-sm font-medium text-foreground">
                Ledger metadata
              </h3>
              <dl className="grid gap-3">
                <TransactionDetailField
                  label="Ledger entry ID"
                  value={entry.id}
                  valueClassName="font-mono text-xs text-foreground"
                />
                <TransactionDetailField
                  label="Raw statement item ID"
                  value={entry.rawStatementItemId}
                  valueClassName="font-mono text-xs text-foreground"
                />
                <TransactionDetailField
                  label="Operation amount"
                  value={optionalAmount(
                    entry.operationAmount,
                    entry.currencyCode,
                  )}
                />
                <TransactionDetailField
                  label="Balance after transaction"
                  value={optionalAmount(entry.balance, entry.currencyCode)}
                />
              </dl>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TransactionTable({
  entries,
  sortBy,
  sortDirection,
  onSortChange,
  onViewDetails,
  emptyTitle = "No local transactions yet",
  emptyDescription = "Run fixture sync to populate the local SQLite ledger before reviewing transactions.",
}: {
  entries: readonly LedgerEntry[];
  sortBy?: LedgerTransactionSortField;
  sortDirection?: LedgerTransactionSortDirection;
  onSortChange?: (field: LedgerTransactionSortField) => void;
  onViewDetails?: (entry: LedgerEntry) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (entries.length === 0) {
    return (
      <Alert>
        <AlertCircleIcon />
        <AlertTitle>{emptyTitle}</AlertTitle>
        <AlertDescription>{emptyDescription}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableTableHead
            field="time"
            label="Date"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
          />
          <SortableTableHead
            field="merchant"
            label="Merchant"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
          />
          <SortableTableHead
            field="category"
            label="Category"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
            className="hidden sm:table-cell"
          />
          <SortableTableHead
            field="account"
            label="Account"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
            className="hidden lg:table-cell"
          />
          <SortableTableHead
            field="status"
            label="Status"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
            className="hidden md:table-cell"
          />
          <SortableTableHead
            field="amount"
            label="Amount"
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
            className="text-right"
            align="right"
          />
          {onViewDetails && (
            <TableHead className="w-12 text-right">Actions</TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>{formatDate(entry.time)}</TableCell>
            <TableCell className="max-w-[8.5rem] sm:max-w-none">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-medium">
                  {entry.merchantName ?? entry.description}
                </span>
                <TransactionCategoryBadge
                  className="w-fit sm:hidden"
                  entry={entry}
                />
              </div>
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              <TransactionCategoryBadge entry={entry} />
            </TableCell>
            <TableCell className="hidden max-w-44 truncate text-muted-foreground lg:table-cell">
              {entry.accountId}
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <Badge variant={entry.hold ? "secondary" : "outline"}>
                {entry.hold ? "Hold" : "Posted"}
              </Badge>
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatMinorAmount(entry.amount, entry.currencyCode)}
            </TableCell>
            {onViewDetails && (
              <TableCell className="text-right">
                <TransactionRowActions
                  entry={entry}
                  onViewDetails={onViewDetails}
                />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TransactionRowActions({
  entry,
  onViewDetails,
}: {
  entry: LedgerEntry;
  onViewDetails: (entry: LedgerEntry) => void;
}) {
  const label = entry.merchantName ?? entry.description;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label={`Open actions for ${label}`}
        >
          <MoreHorizontalIcon />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Transaction actions</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => onViewDetails(entry)}>
            <EyeIcon />
            View details
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled>
            <TagIcon />
            Edit category
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <StoreIcon />
            Edit merchant
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onViewDetails(entry)}>
            <StickyNoteIcon />
            Add note
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onViewDetails(entry)}>
            <TagsIcon />
            Add tags
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onViewDetails(entry)}>
            <SplitIcon />
            Split transaction
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled>
            <BanIcon />
            Ignore
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <CheckCheckIcon />
            Mark reviewed
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PrivacyOnboardingCard({
  snapshot,
  onRouteChange,
}: {
  snapshot: LocalAppSnapshot;
  onRouteChange: (routeId: RouteId) => void;
}) {
  const tokenStatus = tokenStateLabel(snapshot.config.token);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle>Privacy-first local setup</CardTitle>
        <CardDescription>
          Review where sensitive data lives before connecting a Monobank token
          or syncing statements.
        </CardDescription>
        <CardAction>
          <Badge variant="outline">No cloud account required</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-border bg-background/80 p-3">
            <DatabaseIcon className="mb-2 size-4 text-primary" />
            <p className="text-sm font-medium">Local database</p>
            <p className="break-all text-sm text-muted-foreground">
              {snapshot.config.databasePath}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background/80 p-3">
            <ShieldCheckIcon className="mb-2 size-4 text-primary" />
            <p className="text-sm font-medium">Token control</p>
            <p className="text-sm text-muted-foreground">
              {tokenStatus.description}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background/80 p-3">
            <DownloadIcon className="mb-2 size-4 text-primary" />
            <p className="text-sm font-medium">Portable records</p>
            <p className="text-sm text-muted-foreground">
              Backups and exports stay as local files you control.
            </p>
          </div>
        </div>
        <Alert>
          <ShieldCheckIcon />
          <AlertTitle>Local-first privacy model</AlertTitle>
          <AlertDescription>
            Tokens, raw Monobank payloads, ledger data, backups, and exports
            stay on this machine. There is no hosted token relay or required
            cloud account for local setup.
          </AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => onRouteChange("settings")}>
          <ShieldCheckIcon data-icon="inline-start" />
          Review privacy settings
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onRouteChange("sync")}
        >
          <RefreshCwIcon data-icon="inline-start" />
          Continue to sync
        </Button>
      </CardFooter>
    </Card>
  );
}

function CategorySpendingCard({ snapshot }: { snapshot: LocalAppSnapshot }) {
  const rows = snapshot.categorySpending.slice(0, 6);
  const maxAmount = Math.max(...rows.map((row) => row.amount), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by category</CardTitle>
        <CardDescription>
          Expense categories from the local ledger snapshot.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No expense categories found in the current ledger.
          </p>
        ) : (
          rows.map((row) => {
            const width =
              maxAmount > 0 ? Math.max(4, (row.amount / maxAmount) * 100) : 0;
            const href = buildTransactionFiltersHash({
              ...defaultTransactionFilters(),
              categoryId: row.categoryId,
              amountMax: "-0.01",
            });

            return (
              <a
                className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                href={href}
                key={`${row.categoryId}:${row.currencyCode}`}
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.categoryName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.transactionCount} transactions
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">
                      {formatMinorAmount(row.amount, row.currencyCode)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {currencyLabel(row.currencyCode)}
                    </p>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </a>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function MonthlySpendingReportCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const [selectedMonth, setSelectedMonth] = useState(
    snapshot.monthlySpendingReport.month,
  );
  const [report, setReport] = useState<
    LocalAppSnapshot["monthlySpendingReport"]
  >(snapshot.monthlySpendingReport);
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const rows = report.categories.slice(0, 6);
  const maxAmount = Math.max(...rows.map((row) => row.amount), 0);
  const singleCurrencyTotal =
    report.currencyTotals.length === 1 ? report.currencyTotals[0] : undefined;
  const totalLabel =
    singleCurrencyTotal === undefined
      ? report.currencyTotals.length === 0
        ? "0"
        : `${report.currencyTotals.length} currencies`
      : formatMinorAmount(
          singleCurrencyTotal.amount,
          singleCurrencyTotal.currencyCode,
        );
  const averageLabel =
    singleCurrencyTotal === undefined
      ? report.transactionCount === 0
        ? "0"
        : "Mixed"
      : formatMinorAmount(
          singleCurrencyTotal.averageTransactionAmount,
          singleCurrencyTotal.currencyCode,
        );

  useEffect(() => {
    setSelectedMonth(snapshot.monthlySpendingReport.month);
    setReport(snapshot.monthlySpendingReport);
    setStatus({ state: "idle" });
  }, [snapshot.monthlySpendingReport]);

  async function refreshReport() {
    setStatus({ state: "loading" });

    try {
      setReport(await loadMonthlySpendingReport({ month: selectedMonth }));
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Monthly spending report could not be loaded.",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly spending report</CardTitle>
        <CardDescription>
          {report.from} through {report.to}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{report.month}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void refreshReport();
          }}
        >
          <Input
            aria-label="Report month"
            className="h-9 w-[150px]"
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
          />
          <Button disabled={status.state === "loading"} size="sm" type="submit">
            <RefreshCwIcon />
            {status.state === "loading" ? "Loading" : "Load"}
          </Button>
        </form>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Spent</p>
            <p className="mt-1 truncate text-sm font-semibold">{totalLabel}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="mt-1 text-sm font-semibold">
              {report.transactionCount}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Average</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {averageLabel}
            </p>
          </div>
        </div>

        {report.currencyTotals.length > 1 ? (
          <div className="grid gap-2">
            {report.currencyTotals.map((total) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                key={total.currencyCode}
              >
                <div>
                  <p className="text-sm font-medium">
                    {currencyLabel(total.currencyCode)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {total.transactionCount} transactions
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  {formatMinorAmount(total.amount, total.currencyCode)}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No expense transactions found for this month.
          </p>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => {
              const width =
                maxAmount > 0 ? Math.max(4, (row.amount / maxAmount) * 100) : 0;
              const href = buildTransactionFiltersHash({
                ...defaultTransactionFilters(),
                dateFrom: report.from,
                dateTo: report.to,
                categoryId: row.categoryId,
                amountMax: "-0.01",
              });

              return (
                <a
                  className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                  href={href}
                  key={`${row.categoryId}:${row.currencyCode}`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.categoryName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.transactionCount} transactions ·{" "}
                        {row.sharePercentage.toFixed(1).replace(/\.0$/, "")}%
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">
                        {formatMinorAmount(row.amount, row.currencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {currencyLabel(row.currencyCode)}
                      </p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {status.state === "error" ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CashflowReportCard({ snapshot }: { snapshot: LocalAppSnapshot }) {
  const [months, setMonths] = useState(String(snapshot.cashflowReport.months));
  const [report, setReport] = useState<LocalAppSnapshot["cashflowReport"]>(
    snapshot.cashflowReport,
  );
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const rows = report.points.slice(-8);
  const maxActivity = Math.max(
    ...rows.map((row) => row.income + row.expenses),
    0,
  );
  const singleCurrencyTotal =
    report.totals.length === 1 ? report.totals[0] : undefined;
  const incomeLabel =
    singleCurrencyTotal === undefined
      ? report.totals.length === 0
        ? "0"
        : `${report.totals.length} currencies`
      : formatMinorAmount(
          singleCurrencyTotal.income,
          singleCurrencyTotal.currencyCode,
        );
  const expenseLabel =
    singleCurrencyTotal === undefined
      ? report.totals.length === 0
        ? "0"
        : `${report.totals.length} currencies`
      : formatMinorAmount(
          singleCurrencyTotal.expenses,
          singleCurrencyTotal.currencyCode,
        );
  const netLabel =
    singleCurrencyTotal === undefined
      ? report.totals.length === 0
        ? "0"
        : "Mixed"
      : formatMinorAmount(
          singleCurrencyTotal.net,
          singleCurrencyTotal.currencyCode,
        );

  useEffect(() => {
    setMonths(String(snapshot.cashflowReport.months));
    setReport(snapshot.cashflowReport);
    setStatus({ state: "idle" });
  }, [snapshot.cashflowReport]);

  async function refreshReport() {
    const parsedMonths = Number(months);

    setStatus({ state: "loading" });

    try {
      setReport(await loadCashflowReport({ months: parsedMonths }));
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Cashflow report could not be loaded.",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cashflow report</CardTitle>
        <CardDescription>
          {report.from} through {report.to}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{report.months} months</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void refreshReport();
          }}
        >
          <Input
            aria-label="Cashflow months"
            className="h-9 w-[110px]"
            max={24}
            min={1}
            type="number"
            value={months}
            onChange={(event) => setMonths(event.target.value)}
          />
          <Button disabled={status.state === "loading"} size="sm" type="submit">
            <RefreshCwIcon />
            {status.state === "loading" ? "Loading" : "Load"}
          </Button>
        </form>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Income</p>
            <p className="mt-1 truncate text-sm font-semibold">{incomeLabel}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Expenses</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {expenseLabel}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Net</p>
            <p className="mt-1 truncate text-sm font-semibold">{netLabel}</p>
          </div>
        </div>

        {report.totals.length > 1 ? (
          <div className="grid gap-2">
            {report.totals.map((total) => (
              <div
                className="grid gap-2 rounded-md border border-border p-3"
                key={total.currencyCode}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {currencyLabel(total.currencyCode)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {total.transactionCount} transactions
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatMinorAmount(total.net, total.currencyCode)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>
                    +{formatMinorAmount(total.income, total.currencyCode)}
                  </span>
                  <span className="text-right">
                    -{formatMinorAmount(total.expenses, total.currencyCode)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cashflow activity found for this window.
          </p>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => {
              const activity = row.income + row.expenses;
              const incomeWidth =
                maxActivity > 0
                  ? Math.max(4, (row.income / maxActivity) * 100)
                  : 0;
              const expenseWidth =
                maxActivity > 0
                  ? Math.max(4, (row.expenses / maxActivity) * 100)
                  : 0;
              const href = buildTransactionFiltersHash({
                ...defaultTransactionFilters(),
                dateFrom: row.from,
                dateTo: row.to,
              });

              return (
                <a
                  className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                  href={href}
                  key={`${row.month}:${row.currencyCode}`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.month} · {currencyLabel(row.currencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.transactionCount} transactions
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">
                        {formatMinorAmount(row.net, row.currencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activity === 0
                          ? "No movement"
                          : `${formatMinorAmount(row.income, row.currencyCode)} in`}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${incomeWidth}%` }}
                      />
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-destructive"
                        style={{ width: `${expenseWidth}%` }}
                      />
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {status.state === "error" ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CategoryTrendReportCard({ snapshot }: { snapshot: LocalAppSnapshot }) {
  const [months, setMonths] = useState(
    String(snapshot.categoryTrendReport.months),
  );
  const [report, setReport] = useState<LocalAppSnapshot["categoryTrendReport"]>(
    snapshot.categoryTrendReport,
  );
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const rows = report.categories.slice(0, 6);
  const maxAmount = Math.max(...rows.map((row) => row.amount), 0);
  const singleCurrencyCode =
    report.currencies.length === 1 ? report.currencies[0] : undefined;
  const totalLabel =
    singleCurrencyCode === undefined
      ? report.currencies.length === 0
        ? "0"
        : `${report.currencies.length} currencies`
      : formatMinorAmount(report.totalExpenses, singleCurrencyCode);
  const averageLabel =
    singleCurrencyCode === undefined
      ? report.transactionCount === 0
        ? "0"
        : "Mixed"
      : formatMinorAmount(
          Math.round(report.totalExpenses / Math.max(1, report.months)),
          singleCurrencyCode,
        );

  useEffect(() => {
    setMonths(String(snapshot.categoryTrendReport.months));
    setReport(snapshot.categoryTrendReport);
    setStatus({ state: "idle" });
  }, [snapshot.categoryTrendReport]);

  async function refreshReport() {
    const parsedMonths = Number(months);

    setStatus({ state: "loading" });

    try {
      setReport(await loadCategoryTrendReport({ months: parsedMonths }));
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Category trend report could not be loaded.",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category trend report</CardTitle>
        <CardDescription>
          {report.from} through {report.to}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{report.months} months</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void refreshReport();
          }}
        >
          <Input
            aria-label="Category trend months"
            className="h-9 w-[110px]"
            max={24}
            min={1}
            type="number"
            value={months}
            onChange={(event) => setMonths(event.target.value)}
          />
          <Button disabled={status.state === "loading"} size="sm" type="submit">
            <RefreshCwIcon />
            {status.state === "loading" ? "Loading" : "Load"}
          </Button>
        </form>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Spent</p>
            <p className="mt-1 truncate text-sm font-semibold">{totalLabel}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Categories</p>
            <p className="mt-1 text-sm font-semibold">
              {report.categories.length}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Monthly avg</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {averageLabel}
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No category spending found for this window.
          </p>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => {
              const width =
                maxAmount > 0 ? Math.max(4, (row.amount / maxAmount) * 100) : 0;
              const href = buildTransactionFiltersHash({
                ...defaultTransactionFilters(),
                dateFrom: report.from,
                dateTo: report.to,
                categoryId: row.categoryId,
                amountMax: "-0.01",
              });

              return (
                <a
                  className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                  href={href}
                  key={`${row.categoryId}:${row.currencyCode}`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.categoryName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.transactionCount} transactions · avg{" "}
                        {formatMinorAmount(
                          row.averageMonthlyAmount,
                          row.currencyCode,
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">
                        {formatMinorAmount(row.amount, row.currencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {currencyLabel(row.currencyCode)}
                      </p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {status.state === "error" ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MerchantTrendReportCard({ snapshot }: { snapshot: LocalAppSnapshot }) {
  const [months, setMonths] = useState(
    String(snapshot.merchantTrendReport.months),
  );
  const [report, setReport] = useState<LocalAppSnapshot["merchantTrendReport"]>(
    snapshot.merchantTrendReport,
  );
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const rows = report.merchants.slice(0, 6);
  const maxAmount = Math.max(...rows.map((row) => row.amount), 0);
  const singleCurrencyCode =
    report.currencies.length === 1 ? report.currencies[0] : undefined;
  const totalLabel =
    singleCurrencyCode === undefined
      ? report.currencies.length === 0
        ? "0"
        : `${report.currencies.length} currencies`
      : formatMinorAmount(report.totalExpenses, singleCurrencyCode);
  const averageLabel =
    singleCurrencyCode === undefined
      ? report.transactionCount === 0
        ? "0"
        : "Mixed"
      : formatMinorAmount(
          Math.round(report.totalExpenses / Math.max(1, report.months)),
          singleCurrencyCode,
        );

  useEffect(() => {
    setMonths(String(snapshot.merchantTrendReport.months));
    setReport(snapshot.merchantTrendReport);
    setStatus({ state: "idle" });
  }, [snapshot.merchantTrendReport]);

  async function refreshReport() {
    const parsedMonths = Number(months);

    setStatus({ state: "loading" });

    try {
      setReport(await loadMerchantTrendReport({ months: parsedMonths }));
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Merchant trend report could not be loaded.",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Merchant trend report</CardTitle>
        <CardDescription>
          {report.from} through {report.to}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{report.months} months</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void refreshReport();
          }}
        >
          <Input
            aria-label="Merchant trend months"
            className="h-9 w-[110px]"
            max={24}
            min={1}
            type="number"
            value={months}
            onChange={(event) => setMonths(event.target.value)}
          />
          <Button disabled={status.state === "loading"} size="sm" type="submit">
            <RefreshCwIcon />
            {status.state === "loading" ? "Loading" : "Load"}
          </Button>
        </form>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Spent</p>
            <p className="mt-1 truncate text-sm font-semibold">{totalLabel}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Merchants</p>
            <p className="mt-1 text-sm font-semibold">
              {report.merchants.length}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Monthly avg</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {averageLabel}
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No merchant spending found for this window.
          </p>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => {
              const width =
                maxAmount > 0 ? Math.max(4, (row.amount / maxAmount) * 100) : 0;
              const href = buildTransactionFiltersHash({
                ...defaultTransactionFilters(),
                dateFrom: report.from,
                dateTo: report.to,
                merchantName: row.merchantName,
                amountMax: "-0.01",
              });

              return (
                <a
                  className="grid gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                  href={href}
                  key={`${row.merchantName}:${row.currencyCode}`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.merchantName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.transactionCount} transactions · avg{" "}
                        {formatMinorAmount(
                          row.averageMonthlyAmount,
                          row.currencyCode,
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">
                        {formatMinorAmount(row.amount, row.currencyCode)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {currencyLabel(row.currencyCode)}
                      </p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {status.state === "error" ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function recurringPaymentAmountLabel(payment: {
  expectedAmountMin?: number;
  expectedAmountMax?: number;
  currencyCode: number;
}): string {
  if (
    payment.expectedAmountMin !== undefined &&
    payment.expectedAmountMax !== undefined &&
    payment.expectedAmountMin !== payment.expectedAmountMax
  ) {
    return `${formatMinorAmount(
      payment.expectedAmountMin,
      payment.currencyCode,
    )} - ${formatMinorAmount(payment.expectedAmountMax, payment.currencyCode)}`;
  }

  const amount = payment.expectedAmountMax ?? payment.expectedAmountMin;

  return amount === undefined
    ? currencyLabel(payment.currencyCode)
    : formatMinorAmount(amount, payment.currencyCode);
}

function missedRecurringPaymentLabel(
  payment: LocalAppSnapshot["missedRecurringPayments"][number],
): string {
  return `${payment.daysOverdue}d missed`;
}

function subscriptionIncreaseBadgeLabel(
  alert: LocalAppSnapshot["subscriptionIncreaseAlerts"][number],
): string {
  return `+${formatMinorAmount(alert.increaseAmount, alert.currencyCode)}`;
}

function SubscriptionIncreaseAlertsCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const rows = snapshot.subscriptionIncreaseAlerts.slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription increase alerts</CardTitle>
        <CardDescription>
          Latest charges above expected recurring ranges.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No subscription increases found in the current ledger.
          </p>
        ) : (
          rows.map((alert) => {
            const href = buildTransactionFiltersHash({
              ...defaultTransactionFilters(),
              accountId: alert.accountId,
              ...(alert.categoryId === undefined
                ? {}
                : { categoryId: alert.categoryId }),
              ...(alert.merchantName === undefined
                ? {}
                : { merchantName: alert.merchantName }),
            });

            return (
              <a
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                href={href}
                key={alert.id}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <AlertCircleIcon className="size-4 shrink-0 text-destructive" />
                    <p className="truncate text-sm font-medium">
                      {alert.merchantName ?? alert.recurringItemId}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(Date.parse(alert.occurredAt) / 1000)} · +
                    {alert.increasePercentage}%
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {formatMinorAmount(alert.actualAmount, alert.currencyCode)}
                  </p>
                  <Badge variant="destructive">
                    {subscriptionIncreaseBadgeLabel(alert)}
                  </Badge>
                </div>
              </a>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function RecurringDetectionCandidatesCard({
  snapshot,
  onRefresh,
}: {
  snapshot: LocalAppSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const rows = snapshot.recurringDetectionCandidates.slice(0, 6);
  const [decisionState, setDecisionState] = useState<{
    candidateId: string;
    action: "confirm" | "ignore";
  } | null>(null);
  const [message, setMessage] = useState<
    | { state: "idle" }
    | { state: "saved"; text: string }
    | { state: "error"; text: string }
  >({ state: "idle" });

  async function onDecision(
    candidate: LocalAppSnapshot["recurringDetectionCandidates"][number],
    action: "confirm" | "ignore",
  ) {
    if (decisionState !== null) {
      return;
    }

    setDecisionState({ candidateId: candidate.id, action });
    setMessage({ state: "idle" });

    try {
      if (action === "confirm") {
        await confirmRecurringDetection(candidate.id);
        setMessage({ state: "saved", text: "Recurring schedule confirmed." });
      } else {
        await ignoreRecurringDetection(candidate.id);
        setMessage({ state: "saved", text: "Recurring suggestion ignored." });
      }

      await onRefresh();
    } catch (error) {
      setMessage({
        state: "error",
        text:
          error instanceof Error
            ? error.message
            : "Recurring suggestion could not be updated.",
      });
    } finally {
      setDecisionState(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring suggestions</CardTitle>
        <CardDescription>
          Detected recurring charges awaiting a decision.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recurring suggestions found in the current ledger.
          </p>
        ) : (
          rows.map((candidate) => {
            const isConfirming =
              decisionState?.candidateId === candidate.id &&
              decisionState.action === "confirm";
            const isIgnoring =
              decisionState?.candidateId === candidate.id &&
              decisionState.action === "ignore";

            return (
              <div
                className="grid gap-3 rounded-md border border-border p-3"
                key={candidate.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileClockIcon className="size-4 shrink-0 text-primary" />
                      <p className="truncate text-sm font-medium">
                        {candidate.merchantName}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {candidate.occurrences} occurrences ·{" "}
                      {candidate.frequency} ·{" "}
                      {Math.round(candidate.confidence * 100)}% confidence
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">
                    {recurringPaymentAmountLabel(candidate)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    type="button"
                    disabled={decisionState !== null}
                    onClick={() => void onDecision(candidate, "confirm")}
                  >
                    <CheckCheckIcon />
                    {isConfirming ? "Confirming" : "Confirm"}
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    disabled={decisionState !== null}
                    onClick={() => void onDecision(candidate, "ignore")}
                  >
                    <XIcon />
                    {isIgnoring ? "Ignoring" : "Ignore"}
                  </Button>
                </div>
              </div>
            );
          })
        )}
        {message.state === "error" ? (
          <p className="text-sm text-destructive">{message.text}</p>
        ) : message.state === "saved" ? (
          <p className="text-sm text-muted-foreground">{message.text}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MissedRecurringPaymentsCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const rows = snapshot.missedRecurringPayments.slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Missed recurring payments</CardTitle>
        <CardDescription>
          Expected charges not found in local posted transactions.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No missed recurring payments found in the current ledger.
          </p>
        ) : (
          rows.map((payment) => {
            const href = buildTransactionFiltersHash({
              ...defaultTransactionFilters(),
              accountId: payment.accountId,
              ...(payment.categoryId === undefined
                ? {}
                : { categoryId: payment.categoryId }),
              ...(payment.merchantName === undefined
                ? {}
                : { merchantName: payment.merchantName }),
            });

            return (
              <a
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                href={href}
                key={payment.id}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <AlertCircleIcon className="size-4 shrink-0 text-destructive" />
                    <p className="truncate text-sm font-medium">
                      {payment.merchantName ?? payment.recurringItemId}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(Date.parse(payment.expectedDueAt) / 1000)} ·{" "}
                    {payment.frequency}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {recurringPaymentAmountLabel(payment)}
                  </p>
                  <Badge variant="destructive">
                    {missedRecurringPaymentLabel(payment)}
                  </Badge>
                </div>
              </a>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function recurringPaymentDueLabel(
  payment: LocalAppSnapshot["upcomingRecurringPayments"][number],
): string {
  if (payment.daysUntilDue < 0) {
    return `${Math.abs(payment.daysUntilDue)}d overdue`;
  }

  if (payment.daysUntilDue === 0) {
    return "Due today";
  }

  return `Due in ${payment.daysUntilDue}d`;
}

function UpcomingRecurringPaymentsCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot;
}) {
  const rows = snapshot.upcomingRecurringPayments.slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming recurring payments</CardTitle>
        <CardDescription>
          Active recurring charges projected from local schedule data.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active recurring payments found in the current ledger.
          </p>
        ) : (
          rows.map((payment) => {
            const href = buildTransactionFiltersHash({
              ...defaultTransactionFilters(),
              accountId: payment.accountId,
              ...(payment.categoryId === undefined
                ? {}
                : { categoryId: payment.categoryId }),
              ...(payment.merchantName === undefined
                ? {}
                : { merchantName: payment.merchantName }),
            });

            return (
              <a
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                href={href}
                key={payment.id}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileClockIcon className="size-4 shrink-0 text-primary" />
                    <p className="truncate text-sm font-medium">
                      {payment.merchantName ?? payment.recurringItemId}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(Date.parse(payment.nextDueAt) / 1000)} ·{" "}
                    {payment.frequency}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {recurringPaymentAmountLabel(payment)}
                  </p>
                  <Badge
                    variant={payment.isOverdue ? "destructive" : "secondary"}
                  >
                    {recurringPaymentDueLabel(payment)}
                  </Badge>
                </div>
              </a>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function recurringCalendarAmountLabel(
  event: LocalAppSnapshot["recurringCalendar"][number],
): string {
  if (
    event.expectedAmountMin !== undefined &&
    event.expectedAmountMax !== undefined &&
    event.expectedAmountMin !== event.expectedAmountMax
  ) {
    return `${formatMinorAmount(
      event.expectedAmountMin,
      event.currencyCode,
    )} - ${formatMinorAmount(event.expectedAmountMax, event.currencyCode)}`;
  }

  const amount = event.expectedAmountMax ?? event.expectedAmountMin;

  return amount === undefined
    ? currencyLabel(event.currencyCode)
    : formatMinorAmount(amount, event.currencyCode);
}

function RecurringCalendarCard({ snapshot }: { snapshot: LocalAppSnapshot }) {
  const rows = snapshot.recurringCalendar.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring calendar</CardTitle>
        <CardDescription>
          Projected schedule for confirmed local recurring payments.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recurring calendar events found for the current range.
          </p>
        ) : (
          rows.map((event) => {
            const href = buildTransactionFiltersHash({
              ...defaultTransactionFilters(),
              accountId: event.accountId,
              ...(event.categoryId === undefined
                ? {}
                : { categoryId: event.categoryId }),
              ...(event.merchantName === undefined
                ? {}
                : { merchantName: event.merchantName }),
            });

            return (
              <a
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/60"
                href={href}
                key={event.id}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <CalendarDaysIcon className="size-4 shrink-0 text-primary" />
                    <p className="truncate text-sm font-medium">
                      {event.merchantName ?? event.recurringItemId}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(Date.parse(event.dueAt) / 1000)} ·{" "}
                    {event.frequency}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {recurringCalendarAmountLabel(event)}
                  </p>
                  <Badge variant={event.isPast ? "destructive" : "secondary"}>
                    {event.month}
                  </Badge>
                </div>
              </a>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function budgetProgressBadgeVariant(
  status: LocalAppSnapshot["budgetProgress"][number]["status"],
) {
  switch (status) {
    case "overspent":
      return "destructive";
    case "near_limit":
      return "secondary";
    case "on_track":
      return "outline";
  }
}

function budgetProgressStatusLabel(
  status: LocalAppSnapshot["budgetProgress"][number]["status"],
): string {
  switch (status) {
    case "overspent":
      return "Overspent";
    case "near_limit":
      return "Near limit";
    case "on_track":
      return "On track";
  }
}

function currentBudgetMonth(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${now.getFullYear()}-${month}`;
}

function BudgetProgressCard({
  snapshot,
  onRefresh,
}: {
  snapshot: LocalAppSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const rows = snapshot.budgetProgress.slice(0, 6);
  const categories = snapshot.categories.filter(
    (category) => category.id !== "uncategorized",
  );
  const defaultCategoryId = categories[0]?.id ?? "";
  const defaultCurrencyCode =
    snapshot.accounts[0]?.currencyCode ??
    snapshot.categorySpending[0]?.currencyCode ??
    980;
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [month, setMonth] = useState(currentBudgetMonth);
  const [amount, setAmount] = useState("");
  const [rollover, setRollover] = useState(false);
  const [deletingBudgetPeriodId, setDeletingBudgetPeriodId] = useState<
    string | null
  >(null);
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "saving" }
    | { state: "deleting" }
    | { state: "error"; message: string }
    | { state: "saved"; message: string }
  >({ state: "idle" });

  useEffect(() => {
    if (!categoryId && defaultCategoryId) {
      setCategoryId(defaultCategoryId);
    }
  }, [categoryId, defaultCategoryId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedAmount = Number(amount);

    if (!categoryId || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setStatus({
        state: "error",
        message: "Choose a category and enter a positive monthly limit.",
      });
      return;
    }

    setStatus({ state: "saving" });

    try {
      await createMonthlyCategoryBudget({
        categoryId,
        currencyCode: defaultCurrencyCode,
        month,
        amountLimit: Math.round(parsedAmount * 100),
        rollover,
      });
      setAmount("");
      setRollover(false);
      setStatus({ state: "saved", message: "Monthly budget saved." });
      await onRefresh();
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Monthly budget could not be saved.",
      });
    }
  }

  async function onDelete(budgetPeriodId: string) {
    if (deletingBudgetPeriodId !== null) {
      return;
    }

    const row = rows.find((item) => item.id === budgetPeriodId);

    if (
      row === undefined ||
      !window.confirm(
        `Delete budget for ${row.categoryName} (${row.periodStart}…${row.periodEnd})?`,
      )
    ) {
      return;
    }

    setDeletingBudgetPeriodId(budgetPeriodId);
    setStatus({ state: "deleting" });

    try {
      await deleteMonthlyCategoryBudget(row.id);
      setStatus({ state: "saved", message: "Monthly budget deleted." });
      await onRefresh();
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Monthly budget could not be deleted.",
      });
    } finally {
      setDeletingBudgetPeriodId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget progress</CardTitle>
        <CardDescription>
          Current budget periods ranked by overspend risk.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form
          className="grid gap-2 rounded-md border border-border p-3"
          onSubmit={(event) => void onSubmit(event)}
        >
          <div className="grid gap-2 sm:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger aria-label="Budget category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Input
              aria-label="Budget month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
            <Input
              aria-label="Monthly budget limit"
              inputMode="decimal"
              min="0"
              placeholder="Limit"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <Button
              type="submit"
              disabled={status.state === "saving" || categories.length === 0}
            >
              <PlusIcon />
              Add
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Rollover remaining budget from previous month
            </span>
            <Toggle
              aria-label="Enable budget rollover"
              pressed={rollover}
              onPressedChange={setRollover}
            />
          </div>
          {status.state === "error" ? (
            <p className="text-xs text-destructive">{status.message}</p>
          ) : status.state === "saved" ? (
            <p className="text-xs text-muted-foreground">{status.message}</p>
          ) : null}
        </form>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active budget periods found in the current ledger.
          </p>
        ) : (
          rows.map((row) => {
            const width = Math.min(Math.max(row.progressPercentage, 2), 100);
            const href = buildTransactionFiltersHash({
              ...defaultTransactionFilters(),
              categoryId: row.categoryId,
              dateFrom: row.periodStart,
              dateTo: row.periodEnd,
            });

            return (
              <div
                className="grid gap-2 rounded-md border border-border p-3"
                key={row.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.categoryName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.periodStart} through {row.periodEnd}
                    </p>
                  </div>
                  <Badge variant={budgetProgressBadgeVariant(row.status)}>
                    {budgetProgressStatusLabel(row.status)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">
                    {formatMinorAmount(row.actualAmount, row.currencyCode)} /{" "}
                    {formatMinorAmount(row.amountLimit, row.currencyCode)}
                  </span>
                  <span className="font-medium">{row.progressPercentage}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      row.status === "overspent"
                        ? "h-full rounded-full bg-destructive"
                        : "h-full rounded-full bg-primary"
                    }
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={href}>Transactions</a>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={deletingBudgetPeriodId === row.id}
                    aria-label={`Delete budget for ${row.categoryName} in ${row.periodStart} through ${row.periodEnd}`}
                    onClick={() => void onDelete(row.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function NetWorthTrendCard({ snapshot }: { snapshot: LocalAppSnapshot }) {
  if (
    !snapshot.netWorthTrend.enabled ||
    snapshot.netWorthTrend.points.length === 0
  ) {
    return null;
  }

  const points = snapshot.netWorthTrend.points.slice(-8);
  const amounts = points.map((point) => point.amount);
  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);
  const latest = points[points.length - 1];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Net worth trend</CardTitle>
        <CardDescription>
          Manual accounts and assets included in local net worth history.
        </CardDescription>
        {latest ? (
          <CardAction>
            <Badge variant="outline">
              {formatMinorAmount(latest.amount, latest.currencyCode)}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="flex h-32 items-end gap-2">
          {points.map((point) => {
            const range = maxAmount - minAmount;
            const height =
              range > 0 ? 20 + ((point.amount - minAmount) / range) * 80 : 60;

            return (
              <div
                className="flex min-w-0 flex-1 flex-col items-center gap-2"
                key={`${point.date}:${point.currencyCode}`}
              >
                <div
                  className="w-full rounded-t-md bg-primary"
                  style={{ height: `${height}%` }}
                />
                <span className="truncate text-[10px] text-muted-foreground">
                  {point.date}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewRoute({
  snapshot,
  loading,
  onRouteChange,
  onRefresh,
}: {
  snapshot: LocalAppSnapshot | undefined;
  loading: boolean;
  onRouteChange: (routeId: RouteId) => void;
  onRefresh: () => Promise<void>;
}) {
  if (loading && !snapshot) {
    return <OverviewLoadingSkeleton />;
  }

  if (!snapshot) {
    return null;
  }

  const transactionsHref = buildTransactionFiltersHash(
    defaultTransactionFilters(),
  );
  const monthToDate = snapshot.summary.monthToDate;
  const monthFilters = {
    ...defaultTransactionFilters(),
    dateFrom: monthToDate.from === "cached" ? "" : monthToDate.from,
    dateTo: monthToDate.to === "cached" ? "" : monthToDate.to,
  };
  const incomeHref = buildTransactionFiltersHash({
    ...monthFilters,
    amountMin: "0.01",
  });
  const expensesHref = buildTransactionFiltersHash({
    ...monthFilters,
    amountMax: "-0.01",
  });
  const monthHref = buildTransactionFiltersHash(monthFilters);
  const monthDetail =
    monthToDate.from === "cached"
      ? "Cached snapshot totals"
      : `${monthToDate.from} through ${monthToDate.to}`;
  const freshness = dataFreshnessLabel(snapshot.summary.lastSyncedAt);
  const webhookHints = snapshot.fixtures?.webhookEvents ?? 0;
  const databaseHealth = snapshot.health.status;
  const showPrivacyOnboarding =
    snapshot.summary.accounts === 0 && snapshot.summary.ledgerEntries === 0;

  return (
    <div className="flex flex-col gap-4">
      {showPrivacyOnboarding ? (
        <PrivacyOnboardingCard
          snapshot={snapshot}
          onRouteChange={onRouteChange}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Accounts"
          value={String(snapshot.summary.accounts)}
          description={`${snapshot.accounts.length} local account records`}
          freshness={freshness}
          drillDownHref="#accounts"
          drillDownLabel="View accounts"
        />
        <MetricCard
          title="Transactions"
          value={String(snapshot.summary.ledgerEntries)}
          description={`${snapshot.transactions.total} rows available to review`}
          freshness={freshness}
          drillDownHref={transactionsHref}
          drillDownLabel="Review rows"
        />
        <MetricCard
          title="MTD income"
          value={formatMinorAmount(monthToDate.income)}
          description={monthDetail}
          freshness={freshness}
          drillDownHref={incomeHref}
          drillDownLabel="Review MTD income"
        />
        <MetricCard
          title="MTD expenses"
          value={formatMinorAmount(monthToDate.expenses)}
          description={monthDetail}
          freshness={freshness}
          drillDownHref={expensesHref}
          drillDownLabel="Review MTD expenses"
        />
        <MetricCard
          title="MTD net cashflow"
          value={formatMinorAmount(monthToDate.net)}
          description={monthDetail}
          freshness={monthToDate.month}
          drillDownHref={monthHref}
          drillDownLabel="Review month"
        />
      </div>

      <SyncHealthChart runs={snapshot.syncRuns} />

      <NetWorthTrendCard snapshot={snapshot} />

      <Card>
        <CardHeader>
          <CardTitle>Workspace status</CardTitle>
          <CardDescription>
            Local ledger state from the current app snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <OverviewStatusItem
            label="Connected accounts"
            value={String(snapshot.summary.accounts)}
            detail={`${snapshot.accounts.length} account records loaded locally`}
            badge={snapshot.config.source}
          />
          <OverviewStatusItem
            label="Synced transactions"
            value={String(snapshot.summary.ledgerEntries)}
            detail={`${snapshot.transactions.total} rows available for review`}
            badge="ledger"
          />
          <OverviewStatusItem
            label="Last sync"
            value={formatDateTime(snapshot.summary.lastSyncedAt)}
            detail={freshness}
            badge={snapshot.syncRuns[0]?.status ?? "none"}
            badgeVariant={statusVariant(snapshot.syncRuns[0]?.status ?? "")}
          />
          <OverviewStatusItem
            label="Webhook hints"
            value={String(webhookHints)}
            detail="Stored as pull-required hints before reconciliation"
            badge={webhookHints > 0 ? "pending" : "clear"}
          />
          <OverviewStatusItem
            label="Database health"
            value={databaseHealth}
            detail={snapshot.config.databasePath}
            badge={snapshot.config.localOnly ? "local" : undefined}
            badgeVariant={statusVariant(databaseHealth)}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>
              Local ledger rows from the latest fixture-backed sync.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TransactionTable
              entries={snapshot.transactions.entries.slice(
                0,
                OVERVIEW_TRANSACTION_LIMIT,
              )}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <RecentWebhookDeliveriesCard
            events={snapshot.webhookEvents}
            onRouteChange={onRouteChange}
          />
          <BudgetProgressCard snapshot={snapshot} onRefresh={onRefresh} />
          <RecurringDetectionCandidatesCard
            snapshot={snapshot}
            onRefresh={onRefresh}
          />
          <MissedRecurringPaymentsCard snapshot={snapshot} />
          <SubscriptionIncreaseAlertsCard snapshot={snapshot} />
          <UpcomingRecurringPaymentsCard snapshot={snapshot} />
          <RecurringCalendarCard snapshot={snapshot} />
          <CashflowReportCard snapshot={snapshot} />
          <CategoryTrendReportCard snapshot={snapshot} />
          <MerchantTrendReportCard snapshot={snapshot} />
          <MonthlySpendingReportCard snapshot={snapshot} />
          <CategorySpendingCard snapshot={snapshot} />
          <RecentSyncRunsCard
            runs={snapshot.syncRuns}
            onRouteChange={onRouteChange}
          />
        </div>
      </div>
    </div>
  );
}

function TransactionsRoute({
  snapshot,
}: {
  snapshot: LocalAppSnapshot | undefined;
}) {
  const [filters, setFilters] = useState<TransactionFilterFormState>(
    readTransactionFiltersFromHash,
  );
  const [draftFilters, setDraftFilters] =
    useState<TransactionFilterFormState>(filters);
  const [pageState, setPageState] = useState<TransactionPageState>({
    status: "loading",
  });
  const [selectedTransaction, setSelectedTransaction] = useState<
    LedgerEntry | undefined
  >();
  const [transactionsReloadToken, setTransactionsReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setPageState((current) => ({
      status: "loading",
      ...(current.data ? { data: current.data } : {}),
    }));

    void loadLedgerTransactions(filtersToApiQuery(filters))
      .then((data) => {
        if (!cancelled) {
          setPageState({ status: "ready", data });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const cachedTransactions =
            snapshot?.offline && canUseSnapshotTransactionFallback(filters)
              ? snapshotTransactionFallbackPage(snapshot)
              : undefined;

          if (cachedTransactions) {
            setPageState({ status: "ready", data: cachedTransactions });
            return;
          }

          setPageState((current) => ({
            status: "error",
            ...(current.data ? { data: current.data } : {}),
            error:
              error instanceof Error
                ? error.message
                : "Unable to load transactions",
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    filters,
    snapshot?.offline,
    snapshot?.summary.lastSyncedAt,
    snapshot?.summary.ledgerEntries,
    snapshot?.transactions,
    transactionsReloadToken,
  ]);

  const categoryOptions = useMemo(() => {
    const categories = new Map<string, string>();

    for (const category of snapshot?.categories ?? []) {
      categories.set(category.id, category.name);
    }

    for (const entry of [
      ...(snapshot?.transactions.entries ?? []),
      ...(pageState.data?.entries ?? []),
    ]) {
      if (entry.categoryId) {
        categories.set(
          entry.categoryId,
          entry.categoryName ?? entry.categoryId,
        );
      }
    }

    if (filters.categoryId && !categories.has(filters.categoryId)) {
      categories.set(filters.categoryId, filters.categoryId);
    }

    return [...categories.entries()].map(([id, label]) => ({ id, label }));
  }, [
    filters.categoryId,
    pageState.data?.entries,
    snapshot?.categories,
    snapshot?.transactions.entries,
  ]);

  const selectedPreset = useMemo(
    () => activeTransactionPreset(filters),
    [filters],
  );

  const activeFilters = useMemo(() => {
    const labels: string[] = [];
    const account = snapshot?.accounts.find(
      (item) => item.id === filters.accountId,
    );
    const category = categoryOptions.find(
      (item) => item.id === filters.categoryId,
    );

    if (selectedPreset) {
      labels.push(`Preset: ${selectedPreset.label}`);
    }

    if (filters.search.trim()) {
      labels.push(`Search: ${filters.search.trim()}`);
    }

    if (filters.accountId) {
      labels.push(`Account: ${account?.id ?? filters.accountId}`);
    }

    if (filters.categoryId) {
      labels.push(`Category: ${category?.label ?? filters.categoryId}`);
    }

    if (filters.merchantName.trim()) {
      labels.push(`Merchant: ${filters.merchantName.trim()}`);
    }

    if (filters.status !== "all") {
      labels.push(`Status: ${filters.status === "hold" ? "Hold" : "Posted"}`);
    }

    if (filters.dateFrom || filters.dateTo) {
      labels.push(
        `Date: ${filters.dateFrom || "start"} to ${filters.dateTo || "today"}`,
      );
    }

    const hasAmountMin = amountInputToMinor(filters.amountMin) !== undefined;
    const hasAmountMax = amountInputToMinor(filters.amountMax) !== undefined;

    if (hasAmountMin || hasAmountMax) {
      labels.push(
        `Amount: ${hasAmountMin ? filters.amountMin : "min"} to ${
          hasAmountMax ? filters.amountMax : "max"
        }`,
      );
    }

    return labels;
  }, [categoryOptions, filters, selectedPreset, snapshot?.accounts]);

  const transactions = pageState.data;
  const loading = pageState.status === "loading";
  const hasFilters = hasActiveTransactionFilters(filters);
  const hasDraftInput = hasTransactionFilterInput(draftFilters);
  const amountMinError = getAmountInputError(
    "Min amount",
    draftFilters.amountMin,
  );
  const amountMaxError = getAmountInputError(
    "Max amount",
    draftFilters.amountMax,
  );
  const hasAmountInputErrors =
    amountMinError !== undefined || amountMaxError !== undefined;
  const totalPages = Math.max(
    1,
    Math.ceil((transactions?.total ?? 0) / TRANSACTION_PAGE_SIZE),
  );
  const firstVisible =
    transactions && transactions.total > 0 ? transactions.offset + 1 : 0;
  const lastVisible = transactions
    ? Math.min(
        transactions.offset + transactions.entries.length,
        transactions.total,
      )
    : 0;

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (hasAmountInputErrors) {
      return;
    }

    const nextFilters = normalizeTransactionFilters({
      ...draftFilters,
      page: 1,
    });

    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    writeTransactionFiltersToHash(nextFilters);
  }

  function resetFilters(): void {
    const nextFilters = defaultTransactionFilters();

    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    writeTransactionFiltersToHash(nextFilters);
  }

  function applyPreset(preset: TransactionFilterPreset): void {
    const nextFilters = preset.buildFilters();

    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    writeTransactionFiltersToHash(nextFilters);
  }

  function setPage(page: number): void {
    const nextFilters = {
      ...filters,
      page,
    };

    setFilters(nextFilters);
    setDraftFilters((current) => ({
      ...current,
      page,
    }));
    writeTransactionFiltersToHash(nextFilters);
  }

  function setSort(sortBy: LedgerTransactionSortField): void {
    const nextFilters = {
      ...filters,
      sortBy,
      sortDirection: getNextSortDirection(filters, sortBy),
      page: 1,
    };

    setFilters(nextFilters);
    setDraftFilters((current) => ({
      ...current,
      sortBy: nextFilters.sortBy,
      sortDirection: nextFilters.sortDirection,
      page: 1,
    }));
    writeTransactionFiltersToHash(nextFilters);
  }

  function handleTransactionUpdated(entry: LedgerEntry): void {
    setSelectedTransaction(entry);
    setTransactionsReloadToken((current) => current + 1);
    setPageState((current) => {
      if (!current.data) {
        return current;
      }

      return {
        ...current,
        data: {
          ...current.data,
          entries: current.data.entries.map((item) =>
            item.id === entry.id ? entry : item,
          ),
        },
      };
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
        <CardDescription>
          Dense review table with local filters and raw-safe transaction labels.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Saved presets
          </span>
          <ToggleGroup
            type="single"
            value={selectedPreset?.id ?? ""}
            variant="outline"
            size="sm"
            className="w-full flex-wrap justify-start"
            aria-label="Transaction filter presets"
            onValueChange={(presetId) => {
              const preset = transactionFilterPresets.find(
                (item) => item.id === presetId,
              );

              if (preset) {
                applyPreset(preset);
              }
            }}
          >
            {transactionFilterPresets.map((preset) => (
              <ToggleGroupItem
                key={preset.id}
                value={preset.id}
                aria-label={`Apply ${preset.label} filters`}
              >
                {preset.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <form className="grid gap-3 lg:grid-cols-4" onSubmit={applyFilters}>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Search
            </span>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Description, merchant, category"
                type="search"
                value={draftFilters.search}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
              />
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Merchant
            </span>
            <Input
              placeholder="Merchant name"
              value={draftFilters.merchantName}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  merchantName: event.target.value,
                }))
              }
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Account
            </span>
            <Select
              value={draftFilters.accountId || "all"}
              onValueChange={(value) =>
                setDraftFilters((current) => ({
                  ...current,
                  accountId: value === "all" ? "" : value,
                }))
              }
            >
              <SelectTrigger className="w-full" aria-label="Account filter">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All accounts</SelectItem>
                  {(snapshot?.accounts ?? []).map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.id}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Category
            </span>
            <Select
              value={draftFilters.categoryId || "all"}
              onValueChange={(value) =>
                setDraftFilters((current) => ({
                  ...current,
                  categoryId: value === "all" ? "" : value,
                }))
              }
            >
              <SelectTrigger className="w-full" aria-label="Category filter">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All categories</SelectItem>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Status
            </span>
            <Select
              value={draftFilters.status}
              onValueChange={(value) =>
                setDraftFilters((current) => ({
                  ...current,
                  status:
                    value === "hold" || value === "posted" ? value : "all",
                }))
              }
            >
              <SelectTrigger className="w-full" aria-label="Status filter">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="posted">Posted</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              From
            </span>
            <Input
              type="date"
              value={draftFilters.dateFrom}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  dateFrom: event.target.value,
                }))
              }
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              To
            </span>
            <Input
              type="date"
              value={draftFilters.dateTo}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  dateTo: event.target.value,
                }))
              }
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Min amount
              </span>
              <Input
                inputMode="decimal"
                placeholder="-1000.00"
                aria-describedby={
                  amountMinError ? "transaction-amount-min-error" : undefined
                }
                aria-invalid={amountMinError ? true : undefined}
                value={draftFilters.amountMin}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    amountMin: event.target.value,
                  }))
                }
              />
              {amountMinError && (
                <span
                  id="transaction-amount-min-error"
                  className="text-xs text-destructive"
                >
                  {amountMinError}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Max amount
              </span>
              <Input
                inputMode="decimal"
                placeholder="5000.00"
                aria-describedby={
                  amountMaxError ? "transaction-amount-max-error" : undefined
                }
                aria-invalid={amountMaxError ? true : undefined}
                value={draftFilters.amountMax}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    amountMax: event.target.value,
                  }))
                }
              />
              {amountMaxError && (
                <span
                  id="transaction-amount-max-error"
                  className="text-xs text-destructive"
                >
                  {amountMaxError}
                </span>
              )}
            </label>
          </div>

          <div className="flex items-end gap-2 lg:col-span-2">
            <Button type="submit" disabled={hasAmountInputErrors}>
              Apply filters
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={resetFilters}
              disabled={!hasFilters && !hasDraftInput}
            >
              <FilterXIcon data-icon="inline-start" />
              Reset
            </Button>
          </div>
        </form>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((label) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))}
          </div>
        )}

        {pageState.status === "error" && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Unable to load transactions</AlertTitle>
            <AlertDescription>{pageState.error}</AlertDescription>
          </Alert>
        )}

        {loading && !transactions ? (
          <div className="grid gap-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton className="h-9 w-full" key={index} />
            ))}
          </div>
        ) : (
          <TransactionTable
            entries={transactions?.entries ?? []}
            sortBy={filters.sortBy}
            sortDirection={filters.sortDirection}
            onSortChange={setSort}
            onViewDetails={setSelectedTransaction}
            emptyTitle={
              hasFilters
                ? "No matching transactions"
                : "No local transactions yet"
            }
            emptyDescription={
              hasFilters
                ? "Adjust or reset the filters to review local ledger entries."
                : "Run fixture sync to populate the local SQLite ledger before reviewing transactions."
            }
          />
        )}

        <TransactionDetailDrawer
          entry={selectedTransaction}
          open={selectedTransaction !== undefined}
          source={snapshot?.config.source}
          syncRuns={snapshot?.syncRuns}
          webhookEvents={snapshot?.webhookEvents}
          onEntryUpdated={handleTransactionUpdated}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedTransaction(undefined);
            }
          }}
        />

        <Separator />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {transactions && transactions.total > 0
              ? `Showing ${firstVisible}-${lastVisible} of ${transactions.total}`
              : "No rows to show"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={filters.page <= 1 || loading}
              onClick={() => setPage(filters.page - 1)}
            >
              <ChevronLeftIcon data-icon="inline-start" />
              Previous
            </Button>
            <Badge variant="outline">
              Page {filters.page} of {totalPages}
            </Badge>
            <Button
              type="button"
              variant="outline"
              disabled={filters.page >= totalPages || loading}
              onClick={() => setPage(filters.page + 1)}
            >
              Next
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SyncRoute({
  snapshot,
  onRouteChange,
}: {
  snapshot: LocalAppSnapshot | undefined;
  onRouteChange: (routeId: RouteId) => void;
}) {
  const syncRuns = snapshot?.syncRuns ?? [];
  const summaryStats = summarizeSyncRuns(syncRuns);

  return (
    <Tabs defaultValue="runs">
      <TabsList>
        <TabsTrigger value="runs">Runs</TabsTrigger>
        <TabsTrigger value="storage">Storage</TabsTrigger>
        <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
      </TabsList>
      <TabsContent value="runs">
        <Card>
          <CardHeader>
            <CardTitle>Recent sync runs</CardTitle>
            <CardDescription>
              Local execution history from the SQLite sync_runs table.
            </CardDescription>
            <CardAction>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => onRouteChange("logs")}
              >
                <FileClockIcon data-icon="inline-start" />
                Logs
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SyncRunSummaryStatsPanel summary={summaryStats} />
            <SyncRunsTable runs={syncRuns} />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="storage">
        <Card>
          <CardHeader>
            <CardTitle>Local storage</CardTitle>
            <CardDescription>
              Profile-scoped SQLite location and source configuration.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Database path</p>
              <p className="break-all font-medium">
                {snapshot?.config.databasePath ?? "Waiting for local API"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Data directory</p>
              <p className="break-all font-medium">
                {snapshot?.config.dataDir ?? "Waiting for local API"}
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="webhooks">
        <div className="grid gap-4">
          <Alert>
            <ShieldCheckIcon />
            <AlertTitle>Webhook events are sync hints</AlertTitle>
            <AlertDescription>
              Personal webhook payloads stay local and require reconciliation
              before becoming ledger truth. Until Monobank publishes a
              verifiable webhook signature, webhook payloads are treated as
              advisory hints and must pass local reconciliation to affect the
              ledger.
            </AlertDescription>
          </Alert>

          <WebhookSettingsPanel config={snapshot?.config} />
        </div>
      </TabsContent>
    </Tabs>
  );
}

function tokenStateLabel(token: LocalAppSnapshot["config"]["token"]): {
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

function normalizePastedToken(value: string): string {
  return value.trim();
}

function validateTokenInput(value: string): string | undefined {
  const normalized = value.trim();

  if (!normalized) {
    return "Monobank token cannot be empty or whitespace.";
  }

  if (/\s/.test(normalized)) {
    return "Monobank token cannot contain spaces or line breaks.";
  }

  return undefined;
}

function maskTokenPreview(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    return "No token entered";
  }

  if (normalized.length <= 4) {
    return "••••";
  }

  return `•••• ${normalized.slice(-4)}`;
}

function FirstRunEmptyStatePrompt({
  view,
  onOpenSettings,
}: {
  view: FirstRunEmptyStateView;
  onOpenSettings: () => void;
}) {
  return (
    <Card data-testid="empty-state-signin-prompt">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <KeyRoundIcon
                aria-hidden="true"
                className="size-4 text-primary"
              />
              <span data-testid="empty-state-signin-heading">
                {view.heading}
              </span>
            </CardTitle>
            <CardDescription>{view.description}</CardDescription>
          </div>
          <Badge variant="outline">{view.profile}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a
              href={view.getTokenHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="empty-state-get-token"
            >
              <ExternalLinkIcon data-icon="inline-start" />
              {view.getTokenLabel}
            </a>
          </Button>
          <Button
            size="sm"
            variant="default"
            type="button"
            onClick={onOpenSettings}
            data-testid="empty-state-open-settings"
          >
            {view.openSettingsLabel}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{view.fixtureHint}</p>
      </CardContent>
    </Card>
  );
}

function FirstRunSignInCard({
  token,
  profile,
  onRecheckRefresh,
}: {
  token: LocalApiMonobankTokenStatus;
  profile: string;
  onRecheckRefresh: () => Promise<void>;
}) {
  const view = buildFirstRunSignInCardView(token);
  const hasInventory = view.inventoryStatus === "live";
  const [recheckState, setRecheckState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; checkedAt: string }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [isRechecking, setIsRechecking] = useState(false);

  async function handleRecheck(): Promise<void> {
    setIsRechecking(true);
    setRecheckState({ status: "loading" });
    try {
      const result = await recheckMonobankConnection();
      if ("error" in result && result.error !== undefined) {
        setRecheckState({
          status: "error",
          message: result.message ?? "Re-check failed.",
        });
      } else {
        setRecheckState({
          status: "success",
          checkedAt: new Date().toISOString(),
        });
        await onRecheckRefresh();
      }
    } catch (error) {
      setRecheckState({
        status: "error",
        message: error instanceof Error ? error.message : "Re-check failed.",
      });
    } finally {
      setIsRechecking(false);
    }
  }

  return (
    <Card data-testid="first-run-signin-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <KeyRoundIcon
                aria-hidden="true"
                className="size-4 text-primary"
              />
              <span data-testid="first-run-signin-heading">{view.heading}</span>
            </CardTitle>
            <CardDescription data-testid="first-run-signin-description">
              {view.description}
            </CardDescription>
          </div>
          <Badge variant={token.hasToken ? "default" : "outline"}>
            {profile}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {!token.hasToken && (
          <div className="grid gap-2">
            <p className="text-muted-foreground">
              Open the Monobank developer portal to copy a fresh personal API
              token, then paste it into the form below.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <a
                  href={view.ctaHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="open-monobank-portal"
                >
                  <ExternalLinkIcon data-icon="inline-start" />
                  {view.ctaLabel}
                </a>
              </Button>
            </div>
          </div>
        )}
        {token.hasToken && (
          <div className="grid gap-2">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={hasInventory ? "default" : "secondary"}>
                  {view.inventoryLabel}
                </Badge>
                <span className="text-muted-foreground">
                  {hasInventory
                    ? "Your masked account summary is loaded from a live client-info probe."
                    : "Save changes or run a sync to populate the masked account summary."}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => void handleRecheck()}
                disabled={isRechecking}
                data-testid="recheck-monobank-connection"
              >
                <RefreshCwIcon data-icon="inline-start" />
                {isRechecking ? "Re-checking..." : view.ctaLabel}
              </Button>
            </div>
            {recheckState.status === "success" && (
              <Alert data-testid="recheck-success">
                <CheckCircle2Icon />
                <AlertTitle>Connection verified</AlertTitle>
                <AlertDescription>
                  Monobank client-info re-checked successfully at{" "}
                  {new Date(recheckState.checkedAt).toLocaleString()}.
                </AlertDescription>
              </Alert>
            )}
            {recheckState.status === "error" && (
              <Alert variant="destructive" data-testid="recheck-error">
                <AlertCircleIcon />
                <AlertTitle>Re-check failed</AlertTitle>
                <AlertDescription>{recheckState.message}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsRoute({
  snapshot,
  loading,
  onRefresh,
}: {
  snapshot: LocalAppSnapshot | undefined;
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [tokenInput, setTokenInput] = useState("");
  const [tokenError, setTokenError] = useState<string | undefined>();
  const [tokenActionError, setTokenActionError] = useState<
    string | undefined
  >();
  const [tokenActionMessage, setTokenActionMessage] = useState<
    string | undefined
  >();
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [isDeletingToken, setIsDeletingToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [acknowledgedLocalToken, setAcknowledgedLocalToken] = useState(false);
  const [confirmedTokenRemoval, setConfirmedTokenRemoval] = useState(false);
  const [isSwitchingSource, setIsSwitchingSource] = useState(false);
  const [sourceActionError, setSourceActionError] = useState<
    string | undefined
  >();
  const [sourceActionMessage, setSourceActionMessage] = useState<
    string | undefined
  >();
  const [isInitializingWorkspace, setIsInitializingWorkspace] = useState(false);
  const [workspaceActionError, setWorkspaceActionError] = useState<
    string | undefined
  >();
  const [workspaceActionMessage, setWorkspaceActionMessage] = useState<
    string | undefined
  >();

  if (loading && !snapshot) {
    return <SettingsLoadingSkeleton />;
  }

  if (!snapshot) {
    return null;
  }

  const {
    state: tokenState,
    variant: tokenVariant,
    description,
  } = tokenStateLabel(snapshot.config.token);
  const isBusy = isSavingToken || isDeletingToken;
  const tokenValidationMessage = tokenInput
    ? validateTokenInput(tokenInput)
    : undefined;
  const isTokenInputValid =
    tokenInput.trim().length > 0 &&
    tokenValidationMessage === undefined &&
    acknowledgedLocalToken;
  const maskedTokenPreview = maskTokenPreview(tokenInput);
  const isMonobankSource = snapshot.config.source === "monobank";
  const isConfigBusy = isSavingToken || isDeletingToken || isSwitchingSource;
  const activeProfile = snapshot.config.profile;

  async function saveToken(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const nextToken = tokenInput.trim();
    const validationMessage = validateTokenInput(tokenInput);

    if (validationMessage !== undefined) {
      setTokenError(validationMessage);
      return;
    }

    if (!acknowledgedLocalToken) {
      setTokenError("Confirm local-only token handling before saving.");
      return;
    }

    setIsSavingToken(true);
    setTokenError(undefined);
    setTokenActionError(undefined);
    setTokenActionMessage(undefined);

    try {
      const tokenStatus = await saveMonobankToken(nextToken, activeProfile);
      setTokenInput("");
      setShowToken(false);
      setAcknowledgedLocalToken(false);
      setConfirmedTokenRemoval(false);
      setTokenActionMessage(
        `Monobank token saved for the ${tokenStatus.profile} local profile.`,
      );
      await onRefresh();
    } catch (error) {
      setTokenActionError(
        error instanceof Error ? error.message : "Unable to save token.",
      );
    } finally {
      setIsSavingToken(false);
    }
  }

  async function removeToken(): Promise<void> {
    if (!confirmedTokenRemoval) {
      setTokenActionError("Confirm token removal before deleting it.");
      return;
    }

    setIsDeletingToken(true);
    setTokenActionError(undefined);
    setTokenActionMessage(undefined);

    try {
      const tokenStatus = await clearMonobankToken();
      setAcknowledgedLocalToken(false);
      setConfirmedTokenRemoval(false);
      setTokenActionMessage(
        `Monobank token removed from the ${tokenStatus.profile} local profile.`,
      );
      await onRefresh();
    } catch (error) {
      setTokenActionError(
        error instanceof Error ? error.message : "Unable to remove token.",
      );
    } finally {
      setIsDeletingToken(false);
    }
  }

  async function setSource(
    nextSource: LocalAppSnapshot["config"]["source"],
  ): Promise<void> {
    setIsSwitchingSource(true);
    setSourceActionError(undefined);
    setSourceActionMessage(undefined);

    try {
      await setMonobankSource(nextSource);
      setSourceActionMessage(
        `Source switched to ${nextSource} mode for the local API session.`,
      );
      await onRefresh();
    } catch (error) {
      setSourceActionError(
        error instanceof Error ? error.message : "Unable to switch source.",
      );
    } finally {
      setIsSwitchingSource(false);
    }
  }

  async function setupWorkspace(): Promise<void> {
    setIsInitializingWorkspace(true);
    setWorkspaceActionError(undefined);
    setWorkspaceActionMessage(undefined);

    try {
      const config = await initializeWorkspace();
      setWorkspaceActionMessage(
        `Workspace ${config.profile} is ready at ${config.databasePath}.`,
      );
      await onRefresh();
    } catch (error) {
      setWorkspaceActionError(
        error instanceof Error ? error.message : "Unable to set up workspace.",
      );
    } finally {
      setIsInitializingWorkspace(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FirstRunSignInCard
        token={snapshot.config.token}
        profile={activeProfile}
        onRecheckRefresh={onRefresh}
      />
      <Card>
        <CardHeader>
          <CardTitle>Workspace setup</CardTitle>
          <CardDescription>
            Create the local profile workspace and SQLite database before
            importing data.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">{activeProfile}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Database
            </span>
            <span className="break-all font-medium">
              {snapshot.config.databasePath}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={isInitializingWorkspace || loading}
              onClick={() => void setupWorkspace()}
            >
              <DatabaseIcon data-icon="inline-start" />
              {isInitializingWorkspace ? "Creating..." : "Create workspace"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void onRefresh()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              Refresh status
            </Button>
          </div>
          {workspaceActionError && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Workspace setup failed</AlertTitle>
              <AlertDescription>{workspaceActionError}</AlertDescription>
            </Alert>
          )}
          {workspaceActionMessage && (
            <Alert>
              <CheckCircle2Icon />
              <AlertTitle>Workspace ready</AlertTitle>
              <AlertDescription>{workspaceActionMessage}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monobank token</CardTitle>
          <CardDescription>
            Manage local token onboarding and deletion for the selected profile.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">{activeProfile}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Token status
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={tokenVariant}>{tokenState}</Badge>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          <form className="grid gap-3" onSubmit={saveToken}>
            <label className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Monobank personal API token
              </span>
              <Input
                type={showToken ? "text" : "password"}
                value={tokenInput}
                placeholder={
                  isMonobankSource
                    ? "Paste token from Monobank"
                    : "Enter token for Monobank when switching source"
                }
                autoComplete="new-password"
                inputMode="text"
                onChange={(event) => {
                  setTokenInput(event.target.value);
                  setTokenError(validateTokenInput(event.target.value));
                  setTokenActionError(undefined);
                  setTokenActionMessage(undefined);
                }}
                onPaste={(event) => {
                  event.preventDefault();
                  const pasted = normalizePastedToken(
                    event.clipboardData.getData("text"),
                  );

                  setTokenInput(pasted);
                  setTokenError(validateTokenInput(pasted));
                  setTokenActionError(undefined);
                  setTokenActionMessage(undefined);
                }}
                aria-invalid={tokenError ? true : undefined}
                aria-describedby={
                  tokenError ? "monobank-token-error" : undefined
                }
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{maskedTokenPreview}</Badge>
                <span>
                  Paste trims surrounding whitespace before validation.
                </span>
              </div>
              {tokenError && (
                <span
                  id="monobank-token-error"
                  className="text-xs text-destructive"
                >
                  {tokenError}
                </span>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setShowToken((current) => !current)}
                >
                  {showToken ? (
                    <>
                      <EyeOffIcon data-icon="inline-start" />
                      Hide token
                    </>
                  ) : (
                    <>
                      <EyeIcon data-icon="inline-start" />
                      Show token
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setTokenInput("");
                    setTokenError(undefined);
                    setAcknowledgedLocalToken(false);
                  }}
                  disabled={tokenInput.length === 0}
                >
                  <XIcon data-icon="inline-start" />
                  Clear input
                </Button>
              </div>
            </label>

            <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={acknowledgedLocalToken}
                onChange={(event) => {
                  setAcknowledgedLocalToken(event.target.checked);
                  setTokenError(
                    tokenInput ? validateTokenInput(tokenInput) : undefined,
                  );
                }}
              />
              <span className="text-muted-foreground">
                I understand this token is used only by the local API on this
                device for the {activeProfile} profile.
              </span>
            </label>

            {snapshot.config.token.hasToken && (
              <label className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-destructive"
                  checked={confirmedTokenRemoval}
                  disabled={isBusy}
                  onChange={(event) => {
                    setConfirmedTokenRemoval(event.target.checked);
                    setTokenActionError(undefined);
                    setTokenActionMessage(undefined);
                  }}
                />
                <span className="text-muted-foreground">
                  Delete the saved Monobank token for the {activeProfile} local
                  profile.
                </span>
              </label>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={isBusy || !isTokenInputValid || loading}
              >
                {isSavingToken ? "Saving..." : "Save token"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  isBusy ||
                  !snapshot.config.token.hasToken ||
                  !confirmedTokenRemoval
                }
                onClick={removeToken}
              >
                <Trash2Icon data-icon="inline-start" />
                {isDeletingToken ? "Removing..." : "Remove token"}
              </Button>
            </div>
          </form>

          {tokenActionError && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Token update failed</AlertTitle>
              <AlertDescription>{tokenActionError}</AlertDescription>
            </Alert>
          )}

          {tokenActionMessage && (
            <Alert>
              <CheckCircle2Icon />
              <AlertTitle>Token state updated</AlertTitle>
              <AlertDescription>{tokenActionMessage}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Local runtime guidance</CardTitle>
          <CardDescription>
            Token scope and workspace behavior for local-first mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <Alert>
            <ShieldCheckIcon />
            <AlertTitle>Local-only token policy</AlertTitle>
            <AlertDescription>
              Tokens are used only by the local API server process. They are not
              included in exported payloads or persisted to the local ledger.{" "}
              {snapshot.config.token.hasToken &&
              snapshot.config.token.persistence === "persistent"
                ? "This profile is using persistent secure token storage."
                : snapshot.config.token.hasToken
                  ? "This profile is using session-only token handling; restarting the local process drops the cached token."
                  : "No Monobank token is currently configured for this profile."}
            </AlertDescription>
          </Alert>

          <p className="text-muted-foreground">
            Source:{" "}
            <span className="font-medium">{snapshot.config.source}</span>
          </p>
          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Data source
            </span>
            <div className="flex items-center gap-2">
              <Select
                value={snapshot.config.source}
                onValueChange={(value) =>
                  void setSource(value as LocalAppSnapshot["config"]["source"])
                }
                disabled={isConfigBusy}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="fixture">
                      Fixture (offline demo)
                    </SelectItem>
                    <SelectItem value="monobank">Monobank API</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                {isConfigBusy ? "Updating source..." : "Switch source"}
              </span>
            </div>
          </div>
          <p className="text-muted-foreground">
            Data directory:{" "}
            <span className="break-all font-medium">
              {snapshot.config.dataDir}
            </span>
          </p>
          <p className="text-muted-foreground">
            Database:{" "}
            <span className="break-all font-medium">
              {snapshot.config.databasePath}
            </span>
          </p>
        </CardContent>
      </Card>
      {sourceActionError && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Source update failed</AlertTitle>
          <AlertDescription>{sourceActionError}</AlertDescription>
        </Alert>
      )}

      {sourceActionMessage && (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>Source updated</AlertTitle>
          <AlertDescription>{sourceActionMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function AccountDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

function AccountCard({ account }: { account: LedgerAccount }) {
  const maskedIdentifiers =
    account.maskedPan && account.maskedPan.length > 0
      ? account.maskedPan.join(" · ")
      : "No masked identifiers";

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{account.id}</CardDescription>
        <CardTitle>
          {formatMinorAmount(account.balance, account.currencyCode)}
        </CardTitle>
        <CardAction>
          <Badge variant="outline">{currencyLabel(account.currencyCode)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <AccountDetailRow label="Type" value={account.type} />
        <AccountDetailRow
          label="Credit limit"
          value={formatMinorAmount(account.creditLimit, account.currencyCode)}
        />
        <Separator />
        <div className="grid gap-1">
          <span className="text-muted-foreground">Masked identifiers</span>
          <p className="break-all font-medium">{maskedIdentifiers}</p>
        </div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        Updated {formatDateTime(account.updatedAt)}
      </CardFooter>
    </Card>
  );
}

function JarCard({ jar }: { jar: LedgerJar }) {
  const progress =
    jar.goal > 0
      ? Math.min(100, Math.max(0, (jar.balance / jar.goal) * 100))
      : 0;

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{jar.id}</CardDescription>
        <CardTitle>{jar.title}</CardTitle>
        <CardAction>
          <Badge variant="outline">{currencyLabel(jar.currencyCode)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <AccountDetailRow
          label="Balance"
          value={formatMinorAmount(jar.balance, jar.currencyCode)}
        />
        <AccountDetailRow
          label="Goal"
          value={formatMinorAmount(jar.goal, jar.currencyCode)}
        />
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{jar.description}</p>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        Updated {formatDateTime(jar.updatedAt)}
      </CardFooter>
    </Card>
  );
}

function AccountsRoute({
  snapshot,
}: {
  snapshot: LocalAppSnapshot | undefined;
}) {
  if (!snapshot) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton className="h-44 w-full" key={index} />
          ))}
        </CardContent>
      </Card>
    );
  }

  const latestRun = snapshot.syncRuns[0];
  const jarCount = snapshot.jars.length;
  const currencies = snapshot.summary.currencies.map(currencyLabel).join(", ");
  const syncHealth =
    latestRun === undefined
      ? "No sync run recorded"
      : `${latestRun.status}: ${latestSyncRunSummary(latestRun)}`;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            Local Monobank accounts synced into the profile-scoped ledger.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">{snapshot.config.source}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <OverviewStatusItem
            label="Local accounts"
            value={String(snapshot.accounts.length)}
            detail={`${snapshot.summary.accounts} accounts in ledger summary`}
          />
          <OverviewStatusItem
            label="Local jars"
            value={String(jarCount)}
            detail="Local jars loaded from the profile ledger"
          />
          <OverviewStatusItem
            label="Currencies"
            value={currencies || "None"}
            detail="Currency set present in local ledger rows"
          />
          <OverviewStatusItem
            label="Latest sync"
            value={formatDateTime(snapshot.summary.lastSyncedAt)}
            detail={dataFreshnessLabel(snapshot.summary.lastSyncedAt)}
            badge={latestRun?.status ?? "none"}
            badgeVariant={statusVariant(latestRun?.status ?? "")}
          />
          <OverviewStatusItem
            label="Sync health"
            value={latestRun?.status ?? "none"}
            detail={syncHealth}
            badge={snapshot.config.source}
          />
        </CardContent>
      </Card>

      {snapshot.accounts.length === 0 ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>No accounts synced</AlertTitle>
          <AlertDescription>
            Run fixture sync from the top bar to populate local account cards.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {snapshot.accounts.map((account) => (
            <AccountCard account={account} key={account.id} />
          ))}
        </div>
      )}

      {snapshot.jars.length === 0 ? null : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {snapshot.jars.map((jar) => (
            <JarCard jar={jar} key={jar.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleEditorPreviewField({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <Input id={id} readOnly value={value} className="bg-background" />
    </div>
  );
}

function RuleEditorPreviewSelect({
  label,
  options,
  value,
}: {
  label: string;
  options: readonly string[];
  value: string;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select disabled value={value}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function ruleConstraintTerms(value: string): string[] {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue === "any merchant" ||
    normalizedValue === "any incoming description" ||
    normalizedValue === "any transaction description" ||
    normalizedValue === "not required"
  ) {
    return [];
  }

  return value
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
}

function firstRuleConstraintTerm(value: string, fallback: string): string {
  return ruleConstraintTerms(value)[0] ?? fallback;
}

function ruleConstraintTermVariants(term: string): readonly string[] {
  const normalizedTerm = term.toLowerCase();
  const variants = [
    normalizedTerm,
    `${normalizedTerm}s`,
    `${normalizedTerm}es`,
  ];

  if (normalizedTerm.endsWith("y")) {
    variants.push(`${normalizedTerm.slice(0, -1)}ies`);
  }

  return variants;
}

function tokenizeRuleConstraintText(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function tokenSequenceIncludes(
  textTokens: readonly string[],
  termTokens: readonly string[],
): boolean {
  if (termTokens.length === 0 || termTokens.length > textTokens.length) {
    return false;
  }

  return textTokens.some((_, startIndex) => {
    return termTokens.every(
      (termToken, offset) => textTokens[startIndex + offset] === termToken,
    );
  });
}

function textMatchesRuleConstraint(value: string, text: string): boolean {
  const terms = ruleConstraintTerms(value);
  const textTokens = tokenizeRuleConstraintText(text);
  const textTokenSet = new Set(textTokens);

  return (
    terms.length === 0 ||
    terms.some((term) => {
      const termTokens = tokenizeRuleConstraintText(term);

      if (termTokens.length > 1) {
        return tokenSequenceIncludes(textTokens, termTokens);
      }

      return ruleConstraintTermVariants(term).some((variant) =>
        textTokenSet.has(variant),
      );
    })
  );
}

function createRuleTestSample(
  rule: CategoryRuleSummary,
  account: LedgerAccount | undefined,
): RuleTestSample {
  const transactionType = rule.editor.transactionType;
  const amount =
    transactionType === "Income"
      ? 250_000
      : transactionType === "Transfer"
        ? -150_000
        : -42_000;
  const merchantName = firstRuleConstraintTerm(
    rule.editor.merchantContains,
    transactionType === "Income" ? "salary payout" : "sample merchant",
  );
  const description = firstRuleConstraintTerm(
    rule.editor.descriptionContains,
    transactionType === "Income" ? "salary payout" : merchantName,
  );

  return {
    merchantName,
    description,
    mcc: rule.editor.mcc === "Not required" ? "N/A" : rule.editor.mcc,
    amount,
    transactionType,
    account: account?.id ?? rule.editor.account,
    currencyCode: account?.currencyCode ?? 980,
  };
}

function createRuleTestChecks(
  rule: CategoryRuleSummary,
  sample: RuleTestSample,
): RuleTestCheck[] {
  const amountTypeMatches =
    sample.transactionType === rule.editor.transactionType &&
    (rule.editor.transactionType === "Income"
      ? sample.amount > 0
      : rule.editor.transactionType === "Expense"
        ? sample.amount < 0
        : true);

  return [
    {
      id: "merchant",
      label: "Merchant text",
      detail: rule.editor.merchantContains,
      matched: textMatchesRuleConstraint(
        rule.editor.merchantContains,
        sample.merchantName,
      ),
    },
    {
      id: "description",
      label: "Description text",
      detail: rule.editor.descriptionContains,
      matched: textMatchesRuleConstraint(
        rule.editor.descriptionContains,
        sample.description,
      ),
    },
    {
      id: "mcc",
      label: "MCC",
      detail: rule.editor.mcc,
      matched:
        rule.editor.mcc === "Not required" || sample.mcc === rule.editor.mcc,
    },
    {
      id: "amount-type",
      label: "Amount and type",
      detail: `${rule.editor.amountRange} / ${rule.editor.transactionType}`,
      matched: amountTypeMatches,
    },
  ];
}

function RuleTestSampleField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-muted/30 px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="truncate text-sm">{value}</span>
    </div>
  );
}

function RuleTestCheckRow({ check }: { check: RuleTestCheck }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          {check.matched ? (
            <CheckCircle2Icon className="size-4 text-green-600" />
          ) : (
            <AlertCircleIcon className="size-4 text-amber-600" />
          )}
          <span>{check.label}</span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {check.detail}
        </p>
      </div>
      <Badge
        className={
          check.matched
            ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300"
            : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
        }
        variant="outline"
      >
        {check.matched ? "Match" : "Review"}
      </Badge>
    </div>
  );
}

function RuleTestPanel({
  account,
  rule,
}: {
  account: LedgerAccount | undefined;
  rule: CategoryRuleSummary;
}) {
  const sample = createRuleTestSample(rule, account);
  const checks = createRuleTestChecks(rule, sample);
  const matchedChecks = checks.filter((check) => check.matched).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sample rule test</CardTitle>
        <CardDescription>
          Read-only evaluation for the selected built-in rule.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">
            {matchedChecks}/{checks.length} match
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <RuleTestSampleField label="Merchant" value={sample.merchantName} />
          <RuleTestSampleField label="Description" value={sample.description} />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <RuleTestSampleField label="MCC" value={sample.mcc} />
            <RuleTestSampleField
              label="Amount"
              value={formatMinorAmount(sample.amount, sample.currencyCode)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <RuleTestSampleField label="Type" value={sample.transactionType} />
            <RuleTestSampleField label="Account" value={sample.account} />
          </div>
        </div>
        <Separator />
        <div className="grid gap-2">
          {checks.map((check) => (
            <RuleTestCheckRow check={check} key={check.id} />
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button disabled size="sm" type="button" variant="outline">
          <SearchIcon data-icon="inline-start" />
          Historical preview
        </Button>
        <Button disabled size="sm" type="button" variant="outline">
          <CheckCheckIcon data-icon="inline-start" />
          Apply to history
        </Button>
      </CardFooter>
    </Card>
  );
}

function ledgerEntryMatchesRule(
  entry: LedgerEntry,
  rule: RuleMatchSummary,
): boolean {
  if (!rule.isEnabled || rule.matchType === "fallback") {
    return false;
  }

  const merchantText = entry.merchantName ?? "";
  const descriptionText = entry.description;
  const merchantTerms = ruleConstraintTerms(rule.editor.merchantContains);
  const descriptionTerms = ruleConstraintTerms(rule.editor.descriptionContains);
  const hasTextConstraint =
    merchantTerms.length > 0 || descriptionTerms.length > 0;
  const hasMccConstraint = rule.editor.mcc !== "Not required";

  if (hasMccConstraint && !hasTextConstraint) {
    return false;
  }

  const textMatches =
    !hasTextConstraint ||
    (merchantTerms.length > 0 &&
      textMatchesRuleConstraint(rule.editor.merchantContains, merchantText)) ||
    (descriptionTerms.length > 0 &&
      textMatchesRuleConstraint(
        rule.editor.descriptionContains,
        descriptionText,
      ));
  const amountTypeMatches =
    rule.editor.transactionType === "Income"
      ? entry.amount > 0
      : rule.editor.transactionType === "Expense"
        ? entry.amount < 0
        : true;

  return textMatches && amountTypeMatches;
}

function ruleHasMccOnlyHistoryConstraint(rule: RuleMatchSummary): boolean {
  return (
    rule.editor.mcc !== "Not required" &&
    ruleConstraintTerms(rule.editor.merchantContains).length === 0 &&
    ruleConstraintTerms(rule.editor.descriptionContains).length === 0
  );
}

function ledgerEntryMatchesRuleAmountType(
  entry: LedgerEntry,
  rule: RuleMatchSummary,
): boolean {
  return rule.editor.transactionType === "Income"
    ? entry.amount > 0
    : rule.editor.transactionType === "Expense"
      ? entry.amount < 0
      : true;
}

function rulePrecedes(
  left: RuleMatchSummary,
  right: RuleMatchSummary,
): boolean {
  return (
    left.priority < right.priority ||
    (left.priority === right.priority && left.id < right.id)
  );
}

function findRuleHistoricalMatches(
  entries: readonly LedgerEntry[],
  rule: CategoryRuleSummary,
  rules: readonly CategoryRuleSummary[],
): readonly LedgerEntry[] {
  if (!rule.isEnabled) {
    return [];
  }

  if (ruleHasMccOnlyHistoryConstraint(rule)) {
    return [];
  }

  if (rule.matchType !== "fallback") {
    return entries.filter((entry) => ledgerEntryMatchesRule(entry, rule));
  }

  const earlierRules = rules.filter(
    (candidate) =>
      candidate.id !== rule.id &&
      candidate.isEnabled &&
      candidate.matchType !== "fallback" &&
      rulePrecedes(candidate, rule),
  );

  return entries.filter(
    (entry) =>
      ledgerEntryMatchesRuleAmountType(entry, rule) &&
      !earlierRules.some((candidate) =>
        ledgerEntryMatchesRule(entry, candidate),
      ),
  );
}

function findRuleConflicts(
  entries: readonly LedgerEntry[],
  rules: readonly CategoryRuleSummary[],
): RuleConflictPreview[] {
  const activeRules = rules.filter(
    (rule) => rule.isEnabled && rule.matchType !== "fallback",
  );

  return entries
    .map((entry) => ({
      entry,
      rules: activeRules.filter((rule) => ledgerEntryMatchesRule(entry, rule)),
    }))
    .filter((preview) => preview.rules.length > 1);
}

function RuleHistoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function RuleHistoricalPreviewPanel({
  entries,
  onApplied,
  rule,
  rules,
  totalRows,
}: {
  entries: readonly LedgerEntry[];
  onApplied: () => Promise<void>;
  rule: CategoryRuleSummary;
  rules: readonly CategoryRuleSummary[];
  totalRows: number;
}) {
  const [applyState, setApplyState] = useState<
    "idle" | "applying" | "applied" | "error"
  >("idle");
  const matchedEntries = useMemo(
    () => findRuleHistoricalMatches(entries, rule, rules),
    [entries, rule, rules],
  );
  const mccOnlyPreviewUnavailable = ruleHasMccOnlyHistoryConstraint(rule);
  const previewEntries = matchedEntries.slice(0, 3);
  const applyDisabled =
    applyState === "applying" ||
    mccOnlyPreviewUnavailable ||
    !rule.isEnabled ||
    matchedEntries.length === 0;
  const previewDescription = mccOnlyPreviewUnavailable
    ? "MCC-only impact needs raw statement metadata that is not available in loaded ledger rows."
    : rule.matchType === "fallback"
      ? "Fallback estimate for rows that do not match earlier active rules."
      : "Read-only impact estimate against loaded local rows.";

  useEffect(() => {
    setApplyState("idle");
  }, [rule.id, matchedEntries.length]);

  async function applyPreviewedChanges(): Promise<void> {
    if (applyDisabled) {
      return;
    }

    setApplyState("applying");

    try {
      await updateLedgerTransactionsBulk({
        ids: matchedEntries.map((entry) => entry.id),
        categoryId: rule.categoryId,
      });
      await onApplied();
      setApplyState("applied");
    } catch {
      setApplyState("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historical preview</CardTitle>
        <CardDescription>{previewDescription}</CardDescription>
        <CardAction>
          <Badge variant="secondary">
            {mccOnlyPreviewUnavailable
              ? "MCC preview unavailable"
              : `${matchedEntries.length} affected`}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <RuleHistoryMetric
            label="Loaded rows"
            value={String(entries.length)}
          />
          <RuleHistoryMetric label="Ledger rows" value={String(totalRows)} />
        </div>
        <Alert>
          <FileClockIcon />
          <AlertTitle>Preview before applying</AlertTitle>
          <AlertDescription>
            Review the affected local rows before applying this rule to loaded
            history. MCC matching is not available on normalized history rows
            yet, so MCC-only rules cannot be applied from this preview.
          </AlertDescription>
        </Alert>
        {applyState === "applied" ? (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>Previewed changes applied</AlertTitle>
            <AlertDescription>
              The matched loaded rows were updated to {rule.label}.
            </AlertDescription>
          </Alert>
        ) : applyState === "error" ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Could not apply previewed changes</AlertTitle>
            <AlertDescription>
              Refresh the local data and try the preview again.
            </AlertDescription>
          </Alert>
        ) : null}
        {mccOnlyPreviewUnavailable ? (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>MCC-only preview unavailable</AlertTitle>
            <AlertDescription>
              Sync can apply this rule from raw statement MCC values, but the
              current history preview only has normalized ledger rows.
            </AlertDescription>
          </Alert>
        ) : entries.length === 0 ? (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>No transactions loaded</AlertTitle>
            <AlertDescription>
              Run sync before previewing historical rule impact.
            </AlertDescription>
          </Alert>
        ) : previewEntries.length === 0 ? (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>No loaded rows would change</AlertTitle>
            <AlertDescription>
              The selected rule does not match the currently loaded local rows.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-2">
            {previewEntries.map((entry) => (
              <div
                className="grid gap-2 rounded-md border border-border px-3 py-2"
                key={entry.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {entry.merchantName ?? entry.description}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {entry.description}
                    </div>
                  </div>
                  <Badge variant="outline">
                    {formatMinorAmount(entry.amount, entry.currencyCode)}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{formatDateTime(entry.time)}</span>
                  <span>{transactionCategoryLabel(entry)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button disabled size="sm" type="button" variant="outline">
          <SearchIcon data-icon="inline-start" />
          Refresh preview
        </Button>
        <Button
          disabled={applyDisabled}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => {
            void applyPreviewedChanges();
          }}
        >
          <CheckCheckIcon data-icon="inline-start" />
          {applyState === "applying"
            ? "Applying preview"
            : "Apply previewed changes"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function RuleConflictDetectionPanel({
  entries,
  rules,
}: {
  entries: readonly LedgerEntry[];
  rules: readonly CategoryRuleSummary[];
}) {
  const conflicts = useMemo(
    () => findRuleConflicts(entries, rules),
    [entries, rules],
  );
  const previewConflicts = conflicts.slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rule conflicts</CardTitle>
        <CardDescription>
          Loaded rows that match more than one active category rule.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">{conflicts.length} conflicts</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Alert>
          <SplitIcon />
          <AlertTitle>Preview only</AlertTitle>
          <AlertDescription>
            Conflict detection uses normalized local history fields available in
            this view. MCC-only overlaps can be reviewed after raw statement
            metadata is exposed here.
          </AlertDescription>
        </Alert>
        {entries.length === 0 ? (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>No transactions loaded</AlertTitle>
            <AlertDescription>
              Run sync before checking rule overlap in local history.
            </AlertDescription>
          </Alert>
        ) : previewConflicts.length === 0 ? (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>No loaded rule conflicts</AlertTitle>
            <AlertDescription>
              The currently loaded rows match at most one active rule each.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-2">
            {previewConflicts.map(({ entry, rules }) => (
              <div
                className="grid gap-3 rounded-md border border-border px-3 py-2"
                key={entry.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {entry.merchantName ?? entry.description}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {entry.description}
                    </div>
                  </div>
                  <Badge variant="outline">
                    {formatMinorAmount(entry.amount, entry.currencyCode)}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{formatDateTime(entry.time)}</span>
                  <span>{transactionCategoryLabel(entry)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rules.map((rule) => (
                    <Badge key={rule.id} variant="secondary">
                      {rule.label}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <Alert>
          <ShieldCheckIcon />
          <AlertTitle>Resolution is disabled</AlertTitle>
          <AlertDescription>
            Conflict review is read-only until rule priority and resolution
            writes are backed by stable local storage.
          </AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button disabled size="sm" type="button" variant="outline">
          <EyeIcon data-icon="inline-start" />
          Review conflicts
        </Button>
        <Button disabled size="sm" type="button" variant="outline">
          <CheckCheckIcon data-icon="inline-start" />
          Resolve selected
        </Button>
      </CardFooter>
    </Card>
  );
}

function reviewCandidateLabel(candidate: LedgerEntryReviewCandidate): string {
  switch (candidate.kind) {
    case "duplicate":
      return "Duplicate";
    case "needs_review":
      return "Needs review";
    case "transfer":
      return "Transfer";
    case "reversal":
      return "Reversal";
    case "refund":
      return "Refund";
  }
}

function reviewCandidateBadgeVariant(
  candidate: LedgerEntryReviewCandidate,
): "default" | "secondary" | "outline" {
  switch (candidate.kind) {
    case "duplicate":
      return "secondary";
    case "needs_review":
      return "outline";
    case "transfer":
      return "default";
    case "reversal":
      return "outline";
    case "refund":
      return "default";
  }
}

function RulesRoute({
  onRefresh,
  snapshot,
}: {
  onRefresh: () => Promise<void>;
  snapshot: LocalAppSnapshot | undefined;
}) {
  const [rulesSearch, setRulesSearch] = useState("");
  const [selectedRuleId, setSelectedRuleId] = useState<string>("income");
  const entries = snapshot?.transactions.entries ?? [];
  const normalizedRulesSearch = rulesSearch.trim().toLowerCase();
  const categoryRuleSummaries = useMemo(
    () => categoryRuleSummariesFromSnapshot(snapshot),
    [snapshot],
  );
  const filteredRules = useMemo(() => {
    if (!normalizedRulesSearch) {
      return categoryRuleSummaries;
    }

    return categoryRuleSummaries.filter((rule) => {
      const searchableText =
        `${rule.label} ${rule.conditions} ${rule.targetAction} ${Object.values(
          rule.editor,
        ).join(" ")}`.toLowerCase();

      return searchableText.includes(normalizedRulesSearch);
    });
  }, [categoryRuleSummaries, normalizedRulesSearch]);
  const selectedRule =
    categoryRuleSummaries.find((rule) => rule.id === selectedRuleId) ??
    filteredRules[0] ??
    categoryRuleSummaries[0] ??
    fallbackCategoryRuleSummary;
  const categoryCount =
    snapshot?.categories.length ??
    new Set(entries.map((entry) => entry.categoryId ?? "uncategorized")).size;
  const merchants = [
    ...new Set(entries.map((entry) => entry.merchantName ?? entry.description)),
  ].filter(Boolean);
  const uncategorizedCount = entries.filter((entry) => {
    return !entry.categoryId || entry.categoryId === "uncategorized";
  }).length;
  const reviewCandidates = useMemo(
    () => findLedgerEntryReviewCandidates(entries),
    [entries],
  );
  const duplicateCandidates = reviewCandidates.length;
  const exportTargets = [
    "Accountant handoff",
    "Monthly personal finance",
    "Budget analysis",
    "Raw transaction archive",
  ];
  const ruleTestAccount = snapshot?.accounts[0];
  const merchantCleanupRules = snapshot?.merchantCleanupRules ?? [];

  useEffect(() => {
    const nextRule = filteredRules[0];

    if (nextRule && !filteredRules.some((rule) => rule.id === selectedRuleId)) {
      setSelectedRuleId(nextRule.id);
    }
  }, [filteredRules, selectedRuleId]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Rules & Mappings</CardTitle>
          <CardDescription>
            Local categorization rules, merchant cleanup, duplicate review, and
            export mapping setup.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">
              {snapshot?.config.source ?? "local"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <OverviewStatusItem
            label="Category rules"
            value={String(categoryRuleSummaries.length)}
            detail={`${categoryRuleSummaries.filter((rule) => !rule.isSystem).length} user-defined`}
          />
          <OverviewStatusItem
            label="Categories seen"
            value={String(categoryCount)}
            detail={`${uncategorizedCount} rows still need review`}
          />
          <OverviewStatusItem
            label="Merchants"
            value={String(merchants.length)}
            detail="Merchant labels from local ledger rows"
          />
          <OverviewStatusItem
            label="Duplicate candidates"
            value={String(duplicateCandidates)}
            detail="Uncategorized, hold, duplicate, transfer, reversal, and refund matches"
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="categorization">
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit">
          <TabsTrigger value="categorization">
            <TagIcon data-icon="inline-start" />
            Categorization
          </TabsTrigger>
          <TabsTrigger value="merchants">
            <StoreIcon data-icon="inline-start" />
            Merchants
          </TabsTrigger>
          <TabsTrigger value="duplicates">
            <ShieldCheckIcon data-icon="inline-start" />
            Duplicates
          </TabsTrigger>
          <TabsTrigger value="exports">
            <DownloadIcon data-icon="inline-start" />
            Export targets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categorization">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <Card>
              <CardHeader>
                <CardTitle>Categorization rules</CardTitle>
                <CardDescription>
                  Current local rules that assign initial local categories.
                </CardDescription>
                <CardAction>
                  <Button disabled size="sm" type="button" variant="outline">
                    <TagIcon data-icon="inline-start" />
                    Add rule
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2 sm:max-w-sm">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="rules-search"
                  >
                    Search rules
                  </label>
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="rules-search"
                      type="search"
                      value={rulesSearch}
                      onChange={(event) => setRulesSearch(event.target.value)}
                      className="pl-9"
                      placeholder="Name, condition, or target"
                    />
                  </div>
                </div>

                {filteredRules.length === 0 ? (
                  <Alert>
                    <AlertCircleIcon />
                    <AlertTitle>No matching rules</AlertTitle>
                    <AlertDescription>
                      Adjust the search to find a built-in rule by name,
                      condition, or target action.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Priority</TableHead>
                        <TableHead>Rule</TableHead>
                        <TableHead>Conditions</TableHead>
                        <TableHead>Target action</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead className="w-12 text-right">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRules.map((rule) => (
                        <TableRow
                          key={rule.id}
                          data-state={
                            selectedRule.id === rule.id ? "selected" : undefined
                          }
                        >
                          <TableCell className="font-mono text-xs">
                            {rule.priority}
                          </TableCell>
                          <TableCell className="font-medium">
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto p-0 text-foreground"
                              onClick={() => setSelectedRuleId(rule.id)}
                            >
                              {rule.label}
                            </Button>
                          </TableCell>
                          <TableCell>{rule.conditions}</TableCell>
                          <TableCell>{rule.targetAction}</TableCell>
                          <TableCell>
                            <Badge
                              variant={rule.isEnabled ? "outline" : "secondary"}
                            >
                              {rule.isEnabled ? "Active" : "Disabled"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="ml-auto"
                                  aria-label={`Open actions for ${rule.label} rule`}
                                >
                                  <MoreHorizontalIcon />
                                  <span className="sr-only">Open actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel>
                                  Rule actions
                                </DropdownMenuLabel>
                                <DropdownMenuGroup>
                                  <DropdownMenuItem
                                    onSelect={() => setSelectedRuleId(rule.id)}
                                  >
                                    <EyeIcon />
                                    View editor
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem disabled>
                                    <SearchIcon />
                                    Preview matches
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled>
                                    <TagIcon />
                                    Edit rule
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled>
                                    <CheckCheckIcon />
                                    Apply to history
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <Alert>
                  <ShieldCheckIcon />
                  <AlertTitle>
                    Manual rule editing is not enabled yet
                  </AlertTitle>
                  <AlertDescription>
                    This route shows current local rule coverage and can apply
                    previewed matches to loaded history. Creating and editing
                    rule definitions stays disabled until storage write flows
                    are stable.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:self-start">
              <Card>
                <CardHeader>
                  <CardTitle>Rule editor preview</CardTitle>
                  <CardDescription>
                    Read-only controls for the selected built-in rule.
                  </CardDescription>
                  <CardAction>
                    <Badge variant="outline">Read-only</Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-3">
                    <RuleEditorPreviewField
                      id="rule-editor-merchant"
                      label="Merchant contains"
                      value={selectedRule.editor.merchantContains}
                    />
                    <RuleEditorPreviewField
                      id="rule-editor-description"
                      label="Description contains"
                      value={selectedRule.editor.descriptionContains}
                    />
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <RuleEditorPreviewField
                        id="rule-editor-mcc"
                        label="MCC"
                        value={selectedRule.editor.mcc}
                      />
                      <RuleEditorPreviewField
                        id="rule-editor-amount"
                        label="Amount range"
                        value={selectedRule.editor.amountRange}
                      />
                    </div>
                    <RuleEditorPreviewSelect
                      label="Transaction type"
                      options={ruleEditorTransactionTypeOptions}
                      value={selectedRule.editor.transactionType}
                    />
                    <RuleEditorPreviewSelect
                      label="Account"
                      options={ruleEditorAccountOptions}
                      value={selectedRule.editor.account}
                    />
                    <RuleEditorPreviewSelect
                      label="Date constraint"
                      options={ruleEditorDateOptions}
                      value={selectedRule.editor.date}
                    />
                  </div>
                  <Separator />
                  <div className="grid gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Target action
                    </span>
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                      <TagIcon className="size-4 text-muted-foreground" />
                      <span>{selectedRule.targetAction}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button disabled size="sm" type="button" variant="outline">
                    <SearchIcon data-icon="inline-start" />
                    Preview matches
                  </Button>
                  <Button disabled size="sm" type="button" variant="outline">
                    <CheckCheckIcon data-icon="inline-start" />
                    Apply to history
                  </Button>
                  <Button disabled size="sm" type="button" variant="outline">
                    <TagIcon data-icon="inline-start" />
                    Save rule
                  </Button>
                </CardFooter>
              </Card>
              <RuleTestPanel account={ruleTestAccount} rule={selectedRule} />
              <RuleHistoricalPreviewPanel
                entries={entries}
                onApplied={onRefresh}
                rule={selectedRule}
                rules={categoryRuleSummaries}
                totalRows={snapshot?.transactions.total ?? entries.length}
              />
              <RuleConflictDetectionPanel
                entries={entries}
                rules={categoryRuleSummaries}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="merchants">
          <Card>
            <CardHeader>
              <CardTitle>Merchant mapping</CardTitle>
              <CardDescription>
                Local merchant labels and cleanup rules applied during sync.
              </CardDescription>
              <CardAction>
                <Button disabled size="sm" type="button" variant="outline">
                  <StoreIcon data-icon="inline-start" />
                  Add mapping
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-4">
              {merchants.length === 0 ? (
                <Alert>
                  <AlertCircleIcon />
                  <AlertTitle>No merchants loaded</AlertTitle>
                  <AlertDescription>
                    Run sync before building merchant cleanup rules.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {merchants.slice(0, 8).map((merchant) => (
                    <Badge key={merchant} variant="secondary">
                      {merchant}
                    </Badge>
                  ))}
                </div>
              )}
              <Separator />
              <div className="grid gap-2">
                {merchantCleanupRules.length === 0 ? (
                  <Alert>
                    <AlertCircleIcon />
                    <AlertTitle>No cleanup rules configured</AlertTitle>
                    <AlertDescription>
                      Synced merchant names will be stored as received.
                    </AlertDescription>
                  </Alert>
                ) : (
                  merchantCleanupRules.map((rule) => (
                    <div
                      className="grid gap-2 rounded-md border border-border px-3 py-2 sm:grid-cols-[1fr_auto] sm:items-center"
                      key={rule.id}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {rule.canonicalName}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          Contains {rule.merchantContains}
                        </div>
                      </div>
                      <Badge variant={rule.isEnabled ? "secondary" : "outline"}>
                        Priority {rule.priority}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="duplicates">
          <Card>
            <CardHeader>
              <CardTitle>Duplicate detection</CardTitle>
              <CardDescription>
                Review queue for uncategorized, hold, duplicate, transfer,
                reversal, or refund records.
              </CardDescription>
              <CardAction>
                <Button disabled size="sm" type="button" variant="outline">
                  <CheckCheckIcon data-icon="inline-start" />
                  Resolve
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Alert>
                {duplicateCandidates > 0 ? (
                  <AlertCircleIcon />
                ) : (
                  <CheckCircle2Icon />
                )}
                <AlertTitle>
                  {duplicateCandidates > 0
                    ? "Potential duplicates found"
                    : "No review candidates in the current local page"}
                </AlertTitle>
                <AlertDescription>
                  The read-only detector checks uncategorized and hold rows,
                  exact duplicates, matched transfers between accounts,
                  short-window reversals, and later positive refunds. History is
                  preserved until review writes are available.
                </AlertDescription>
              </Alert>
              {reviewCandidates.length > 0 && (
                <div className="grid gap-2">
                  {reviewCandidates.slice(0, 5).map((candidate) => {
                    const primaryEntry = candidate.entries[0];
                    const amount =
                      primaryEntry === undefined
                        ? ""
                        : formatMinorAmount(
                            primaryEntry.amount,
                            primaryEntry.currencyCode,
                          );
                    const title =
                      primaryEntry?.merchantName ??
                      primaryEntry?.description ??
                      "Ledger review candidate";

                    return (
                      <div
                        className="grid gap-2 rounded-md border border-border px-3 py-2"
                        key={`${candidate.kind}:${candidate.entries
                          .map((entry) => entry.id)
                          .join(":")}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {candidate.reason}
                            </div>
                          </div>
                          <Badge
                            variant={reviewCandidateBadgeVariant(candidate)}
                          >
                            {reviewCandidateLabel(candidate)}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{candidate.entries.length} records</span>
                          {amount && <span>{amount}</span>}
                          {primaryEntry && (
                            <span>{formatDateTime(primaryEntry.time)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exports">
          <Card>
            <CardHeader>
              <CardTitle>Export targets</CardTitle>
              <CardDescription>
                Mapping presets for local export flows and future rule outputs.
              </CardDescription>
              <CardAction>
                <Button disabled size="sm" type="button" variant="outline">
                  <DownloadIcon data-icon="inline-start" />
                  Configure
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {exportTargets.map((target) => (
                <div
                  className="rounded-md border border-border p-3"
                  key={target}
                >
                  <p className="font-medium">{target}</p>
                  <p className="text-sm text-muted-foreground">
                    Local-only preset; no tokens or secret headers included.
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlaceholderRoute({ routeId }: { routeId: RouteId }) {
  const metadata = routeMetadata(routeId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{metadata.title}</CardTitle>
        <CardDescription>{metadata.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>Route wired into the app shell</AlertTitle>
          <AlertDescription>
            This screen is ready for the next focused product slice. Shared
            navigation, local status, and API-backed refresh behavior are
            already in place.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function RouteContent({
  activeRoute,
  snapshot,
  loading,
  onRouteChange,
  onRefresh,
}: {
  activeRoute: RouteId;
  snapshot: LocalAppSnapshot | undefined;
  loading: boolean;
  onRouteChange: (routeId: RouteId) => void;
  onRefresh: () => Promise<void>;
}) {
  if (loading && !snapshot) {
    return <RouteLoadingSkeleton routeId={activeRoute} />;
  }

  if (snapshot && shouldShowFirstRunSignInPrompt(activeRoute, snapshot)) {
    const view = buildFirstRunEmptyStateView(
      activeRoute,
      snapshot.config.token,
    );
    return (
      <div className="flex flex-col gap-4" data-testid="route-content-wrapper">
        <FirstRunEmptyStatePrompt
          view={view}
          onOpenSettings={() => onRouteChange("settings")}
        />
      </div>
    );
  }

  switch (activeRoute) {
    case "overview":
      return (
        <OverviewRoute
          loading={loading}
          snapshot={snapshot}
          onRouteChange={onRouteChange}
          onRefresh={onRefresh}
        />
      );
    case "transactions":
      return <TransactionsRoute snapshot={snapshot} />;
    case "sync":
      return <SyncRoute snapshot={snapshot} onRouteChange={onRouteChange} />;
    case "settings":
      return (
        <SettingsRoute
          snapshot={snapshot}
          loading={loading}
          onRefresh={onRefresh}
        />
      );
    case "accounts":
      return <AccountsRoute snapshot={snapshot} />;
    case "rules":
      return <RulesRoute snapshot={snapshot} onRefresh={onRefresh} />;
    case "exports":
    case "logs":
      return <LogsRoute snapshot={snapshot} />;
    case "help":
      return <PlaceholderRoute routeId={activeRoute} />;
  }
}

export default function App() {
  const [activeRoute, setActiveRoute] = useState<RouteId>(getInitialRoute);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [syncing, setSyncing] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);

  const refresh = useCallback(async () => {
    setLoadState((current) => ({
      status: "loading",
      ...(current.data ? { data: current.data } : {}),
    }));

    try {
      const data = await loadLocalAppSnapshot();
      setLoadState({ status: "ready", data });
    } catch (error) {
      setLoadState((current) => ({
        status: "error",
        ...(current.data ? { data: current.data } : {}),
        error: error instanceof Error ? error.message : "Local API unavailable",
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    applyThemeMode(themeMode);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {}

    if (themeMode !== "system") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => applyThemeMode("system");

    media.addEventListener("change", syncSystemTheme);

    return () => {
      media.removeEventListener("change", syncSystemTheme);
    };
  }, [themeMode]);

  useEffect(() => {
    const syncRouteFromHash = () => setActiveRoute(routeFromHash());

    window.addEventListener("hashchange", syncRouteFromHash);

    return () => {
      window.removeEventListener("hashchange", syncRouteFromHash);
    };
  }, []);

  const onRouteChange = useCallback((routeId: RouteId) => {
    window.location.hash = routeId;
    setActiveRoute(routeId);
  }, []);

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      await runFixtureSync();
      await refresh();
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const snapshot = loadState.data;
  const loading = loadState.status === "loading";
  const route = useMemo(() => routeMetadata(activeRoute), [activeRoute]);
  const routeContext = useMemo(
    () => routeContextLine(activeRoute, snapshot),
    [activeRoute, snapshot],
  );

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          activeRoute={activeRoute}
          onRouteChange={onRouteChange}
          snapshot={snapshot}
        />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex min-h-[4.5rem] items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="hidden md:inline-flex" />
              <MobileNav
                activeRoute={activeRoute}
                onRouteChange={onRouteChange}
              />
              <div className="min-w-0 py-2">
                <div className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                  <span>Workspace</span>
                  <ChevronRightIcon className="size-3" aria-hidden="true" />
                  <span className="truncate">{route.label}</span>
                </div>
                <h1 className="truncate text-lg font-semibold">
                  {route.title}
                </h1>
                <p className="hidden truncate text-sm text-muted-foreground sm:block">
                  {routeContext}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LocalOnlyIndicator snapshot={snapshot} loading={loading} />
              <ProfileMenu snapshot={snapshot} />
              <ThemeModeControl
                themeMode={themeMode}
                onThemeModeChange={setThemeMode}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" onClick={refresh}>
                    <RefreshCwIcon data-icon="inline-start" />
                    <span className="sr-only">Refresh local data</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh local data</TooltipContent>
              </Tooltip>
              <Button disabled={syncing} onClick={runSync}>
                <RefreshCwIcon data-icon="inline-start" />
                {syncing ? "Syncing" : "Run Sync"}
              </Button>
            </div>
          </header>

          <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
            {loadState.status === "error" && !snapshot && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Local API unavailable</AlertTitle>
                <AlertDescription>{loadState.error}</AlertDescription>
              </Alert>
            )}

            <OfflineBrowsingBanner
              error={
                loadState.status === "error"
                  ? loadState.error
                  : snapshot?.offline?.reason
              }
              snapshot={snapshot}
              loading={loading}
              onRefresh={refresh}
            />

            <StaleDataBanner
              snapshot={snapshot}
              syncing={syncing}
              onRunSync={runSync}
              onRouteChange={onRouteChange}
            />

            <Alert>
              <ShieldCheckIcon />
              <AlertTitle>Local-first workspace</AlertTitle>
              <AlertDescription>
                Tokens and financial data stay on this machine. The UI reads the
                local Fastify API and writes to the profile-scoped SQLite
                ledger.
              </AlertDescription>
            </Alert>

            <RouteContent
              activeRoute={activeRoute}
              loading={loading}
              onRouteChange={onRouteChange}
              onRefresh={refresh}
              snapshot={snapshot}
            />

            <Card>
              <CardHeader>
                <CardTitle>Export shortcuts</CardTitle>
                <CardDescription>
                  Local files generated from the current SQLite ledger.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <a href="/api/exports/ledger?format=csv">
                    <DownloadIcon data-icon="inline-start" />
                    CSV
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href="/api/exports/ledger?format=json">
                    <DownloadIcon data-icon="inline-start" />
                    JSON
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href="/api/exports/ledger?format=jsonl">
                    <DownloadIcon data-icon="inline-start" />
                    JSONL
                  </a>
                </Button>
              </CardContent>
            </Card>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
