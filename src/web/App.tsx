import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  DownloadIcon,
  EyeIcon,
  FilterXIcon,
  FileClockIcon,
  LaptopIcon,
  MenuIcon,
  MoonIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  SunIcon,
  UserRoundIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import {
  type LedgerAccount,
  type LedgerEntry,
  type LedgerEntryPage,
  type LedgerTransactionFilters,
  type LedgerTransactionSortDirection,
  type LedgerTransactionSortField,
  type LocalAppSnapshot,
  type SyncRun,
  loadLocalAppSnapshot,
  loadLedgerTransactions,
  runFixtureSync,
} from "./api";
import {
  currencyLabel,
  formatDate,
  formatDateTime,
  formatMinorAmount,
} from "./format";
import { type RouteId, isRouteId, routes, secondaryRoutes } from "./navigation";

type LoadState =
  | { status: "loading"; data?: LocalAppSnapshot; error?: undefined }
  | { status: "ready"; data: LocalAppSnapshot; error?: undefined }
  | { status: "error"; data?: LocalAppSnapshot; error: string };

type ThemeMode = "system" | "light" | "dark";

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

const TRANSACTION_PAGE_SIZE = 25;
const AMOUNT_FILTER_PATTERN = /^-?(?:\d+|\d*\.\d{1,2})$/;
const THEME_STORAGE_KEY = "mono-ledger-sync-theme";
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

function dataFreshnessLabel(lastSyncedAt: string | undefined): string {
  return lastSyncedAt
    ? `Updated ${formatDateTime(lastSyncedAt)}`
    : "Waiting for first sync";
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
    { label: "Inserted", value: run.itemsInserted },
    { label: "Updated", value: run.itemsUpdated },
    { label: "Skipped", value: run.itemsSkipped },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {stats.map((stat) => (
        <div className="rounded-lg border bg-muted/30 p-2" key={stat.label}>
          <p className="text-xs text-muted-foreground">{stat.label}</p>
          <p className="text-sm font-semibold">{stat.value}</p>
        </div>
      ))}
    </div>
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
    <div className="grid gap-4 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
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
    case "accounts":
      return <AccountsLoadingSkeleton />;
    default:
      return <PlaceholderLoadingSkeleton routeId={routeId} />;
  }
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

function TransactionDetailDrawer({
  entry,
  open,
  onOpenChange,
}: {
  entry: LedgerEntry | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const title = entry?.merchantName ?? entry?.description ?? "Transaction";
  const status = entry?.hold ? "Hold" : "Posted";

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
                <TransactionDetailField
                  label="Category"
                  value={
                    entry.categoryName ?? entry.categoryId ?? "Uncategorized"
                  }
                />
                <TransactionDetailField
                  label="Currency"
                  value={String(entry.currencyCode)}
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
            <TableHead className="w-12 text-right">Details</TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>{formatDate(entry.time)}</TableCell>
            <TableCell className="max-w-[8.5rem] truncate font-medium sm:max-w-none">
              {entry.merchantName ?? entry.description}
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              <Badge variant="outline">
                {entry.categoryName ?? "Uncategorized"}
              </Badge>
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  onClick={() => onViewDetails(entry)}
                  aria-label={`View details for ${
                    entry.merchantName ?? entry.description
                  }`}
                >
                  <EyeIcon />
                  <span className="sr-only">View details</span>
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OverviewRoute({
  snapshot,
  loading,
  onRouteChange,
}: {
  snapshot: LocalAppSnapshot | undefined;
  loading: boolean;
  onRouteChange: (routeId: RouteId) => void;
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
  const incomeHref = buildTransactionFiltersHash({
    ...defaultTransactionFilters(),
    amountMin: "0.01",
  });
  const expensesHref = buildTransactionFiltersHash({
    ...defaultTransactionFilters(),
    amountMax: "-0.01",
  });
  const freshness = dataFreshnessLabel(snapshot.summary.lastSyncedAt);
  const webhookHints = snapshot.fixtures?.webhookEvents ?? 0;
  const databaseHealth = snapshot.health.status;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-4">
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
          title="Income"
          value={formatMinorAmount(snapshot.summary.income)}
          description="Synced into the local ledger"
          freshness={freshness}
          drillDownHref={incomeHref}
          drillDownLabel="Review income"
        />
        <MetricCard
          title="Expenses"
          value={formatMinorAmount(snapshot.summary.expenses)}
          description="Categorized from fixture rules"
          freshness={freshness}
          drillDownHref={expensesHref}
          drillDownLabel="Review expenses"
        />
      </div>

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
            <TransactionTable entries={snapshot.transactions.entries} />
          </CardContent>
        </Card>

        <RecentSyncRunsCard
          runs={snapshot.syncRuns}
          onRouteChange={onRouteChange}
        />
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
    snapshot?.summary.lastSyncedAt,
    snapshot?.summary.ledgerEntries,
  ]);

  const categoryOptions = useMemo(() => {
    const categories = new Map<string, string>();

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
          <CardContent>
            <SyncRunsTable runs={snapshot?.syncRuns ?? []} />
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
        <Alert>
          <ShieldCheckIcon />
          <AlertTitle>Webhook events are sync hints</AlertTitle>
          <AlertDescription>
            Personal webhook payloads stay local and require reconciliation
            before becoming ledger truth.
          </AlertDescription>
        </Alert>
      </TabsContent>
    </Tabs>
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

  const jarCount = snapshot.fixtures?.jars ?? 0;
  const currencies = snapshot.summary.currencies.map(currencyLabel).join(", ");

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
            label="Fixture jars"
            value={String(jarCount)}
            detail="Jar coverage from bundled fixture client info"
          />
          <OverviewStatusItem
            label="Currencies"
            value={currencies || "None"}
            detail="Currency set present in local ledger rows"
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
}: {
  activeRoute: RouteId;
  snapshot: LocalAppSnapshot | undefined;
  loading: boolean;
  onRouteChange: (routeId: RouteId) => void;
}) {
  if (loading && !snapshot) {
    return <RouteLoadingSkeleton routeId={activeRoute} />;
  }

  switch (activeRoute) {
    case "overview":
      return (
        <OverviewRoute
          loading={loading}
          snapshot={snapshot}
          onRouteChange={onRouteChange}
        />
      );
    case "transactions":
      return <TransactionsRoute snapshot={snapshot} />;
    case "sync":
      return <SyncRoute snapshot={snapshot} onRouteChange={onRouteChange} />;
    case "accounts":
      return <AccountsRoute snapshot={snapshot} />;
    case "exports":
    case "rules":
    case "logs":
    case "settings":
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
            {loadState.status === "error" && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Local API unavailable</AlertTitle>
                <AlertDescription>{loadState.error}</AlertDescription>
              </Alert>
            )}

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
