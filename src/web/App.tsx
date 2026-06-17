import {
  type FormEvent,
  type ReactNode,
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
  CheckCheckIcon,
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
  SettingsIcon,
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
  WalletCardsIcon,
  WifiOffIcon,
} from "lucide-react";
import { toast } from "sonner";

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
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toaster } from "@/components/ui/sonner";

import type {
  LedgerEntry,
  LedgerEntryPage,
  LedgerTransactionFilters,
  LedgerTransactionSortDirection,
  LedgerTransactionSortField,
  LocalAppSnapshot,
} from "./api-types";
import {
  createCategoryRule,
  loadLocalAppSnapshot,
  runLedgerSync,
  updateLedgerTransactionAnnotation,
  updateLedgerTransactionSplitPlan,
} from "./api";
import {
  currencyLabel,
  formatDate,
  formatDateTime,
  formatMinorAmount,
} from "./format";
import { type RouteId, isRouteId, routes, secondaryRoutes } from "./navigation";
import {
  BalanceProjectionReportCard,
  CashflowReportCard,
  CategorySpendingCard,
  CategoryTrendReportCard,
  MerchantTrendReportCard,
  MonthToDateFinanceSummaryCard,
  MonthlySpendingReportCard,
  SavingsRateReportCard,
} from "./report-cards";
import {
  type LedgerEntryReviewCandidate,
  findLedgerEntryReviewCandidates,
} from "./review";
import {
  buildFirstRunEmptyStateView,
  shouldShowFirstRunSignInPrompt,
} from "./empty-state";
import {
  TransactionCategoryBadge,
  TransactionTable,
  TransactionTagsCell,
  amountSemanticTextClassName,
  transactionCategoryLabel,
  type TransactionReviewState,
} from "./transaction-cells";
import { AccountsRoute } from "./routes/accounts";
import { ExportsRoute } from "./routes/exports";
import {
  BudgetsRoute,
  CategoriesRoute,
  OverviewRoute,
  ReportsRoute,
} from "./routes/overview";
import { RulesRoute } from "./routes/rules";
import {
  LocalOnlyIndicator,
  OfflineBrowsingBanner,
  RecentSyncRunsCard,
  RecentWebhookDeliveriesCard,
  StaleDataBanner,
  SyncHealthChart,
  SyncRoute,
} from "./routes/sync";
import { FirstRunEmptyStatePrompt, SettingsRoute } from "./routes/settings";
import { TransactionsRoute } from "./routes/transactions";
import {
  MissedRecurringPaymentsCard,
  RecurringCalendarCard,
  RecurringDetectionCandidatesCard,
  RecurringRoute,
  SubscriptionIncreaseAlertsCard,
  UpcomingRecurringPaymentsCard,
  recurringPaymentAmountLabel,
  recurringPaymentDueLabel,
} from "./routes/recurring";
import { HelpRoute } from "./routes/help";
import { LogsRoute } from "./routes/logs";
import { statusVariant, tokenStateLabel } from "./status";

type LoadState =
  | { status: "loading"; data?: LocalAppSnapshot; error?: undefined }
  | { status: "ready"; data: LocalAppSnapshot; error?: undefined }
  | { status: "error"; data?: LocalAppSnapshot; error: string };

type ThemeMode = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "mono-ledger-sync-theme";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function scheduledSyncRunKey(snapshot: LocalAppSnapshot): string {
  const schedule = snapshot.config.sync.schedule;

  return schedule === "app_start"
    ? `${snapshot.config.profile}:${schedule}`
    : `${snapshot.config.profile}:${schedule}:${
        snapshot.summary.lastSyncedAt ??
        snapshot.config.sync.lastSyncedAt ??
        "never"
      }`;
}

function shouldRunScheduledSync(
  snapshot: LocalAppSnapshot,
  currentTime: number,
): boolean {
  const schedule = snapshot.config.sync.schedule;

  if (schedule === "manual") {
    return false;
  }

  if (
    snapshot.config.source === "monobank" &&
    !snapshot.config.token.hasToken
  ) {
    return false;
  }

  if (
    snapshot.config.sync.nextSyncAllowedAt !== undefined &&
    snapshot.config.sync.nextSyncAllowedAt > currentTime
  ) {
    return false;
  }

  if (schedule === "app_start") {
    return true;
  }

  const lastSyncedAt =
    snapshot.summary.lastSyncedAt ?? snapshot.config.sync.lastSyncedAt;

  if (lastSyncedAt === undefined) {
    return true;
  }

  const lastSyncedTime = Date.parse(lastSyncedAt);

  if (!Number.isFinite(lastSyncedTime)) {
    return true;
  }

  const intervalMs = schedule === "hourly" ? HOUR_MS : DAY_MS;

  return currentTime - lastSyncedTime >= intervalMs;
}

function getInitialRoute(): RouteId {
  const hashRoute = window.location.hash.replace("#", "");
  const [route] = hashRoute.split("?");

  return route && isRouteId(route) ? route : "overview";
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

function dataFreshnessLabel(lastSyncedAt: string | undefined): string {
  return lastSyncedAt
    ? `Updated ${formatDateTime(lastSyncedAt)}`
    : "Waiting for first sync";
}

function ProfileMenu({ snapshot }: { snapshot: LocalAppSnapshot | undefined }) {
  const profile = snapshot?.config.profile ?? "Loading";
  const source = snapshot?.config.source ?? "monobank";
  const databasePath = snapshot?.config.databasePath ?? "Waiting for local API";
  const accessHost =
    snapshot?.config.access?.host ?? snapshot?.config.webhook.host;

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
          <DropdownMenuItem disabled>
            <ShieldCheckIcon data-icon="inline-start" />
            {accessHost ? `${accessHost} bind` : "local bind"}
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
      return <PlaceholderLoadingSkeleton routeId={routeId} />;
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
      return <TransactionsRoute snapshot={snapshot} onRefresh={onRefresh} />;
    case "categories":
      return <CategoriesRoute snapshot={snapshot} />;
    case "budgets":
      return <BudgetsRoute snapshot={snapshot} onRefresh={onRefresh} />;
    case "recurring":
      return <RecurringRoute snapshot={snapshot} onRefresh={onRefresh} />;
    case "reports":
      return <ReportsRoute snapshot={snapshot} />;
    case "sync":
      return (
        <SyncRoute
          snapshot={snapshot}
          onRouteChange={onRouteChange}
          onRefresh={onRefresh}
        />
      );
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
      return <ExportsRoute snapshot={snapshot} />;
    case "logs":
      return <LogsRoute snapshot={snapshot} />;
    case "help":
      return <HelpRoute snapshot={snapshot} onRouteChange={onRouteChange} />;
  }
}

export default function App() {
  const [activeRoute, setActiveRoute] = useState<RouteId>(getInitialRoute);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [syncing, setSyncing] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);
  const scheduledSyncKeyRef = useRef<string | undefined>(undefined);

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
      await runLedgerSync();
      await refresh();
      toast.success("Local sync complete", {
        description: "SQLite ledger data refreshed from the configured source.",
      });
    } catch (error) {
      toast.error("Local sync failed", {
        description:
          error instanceof Error
            ? error.message
            : "The local Fastify API could not complete sync.",
      });
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  useEffect(() => {
    const snapshot = loadState.data;

    if (!snapshot || syncing || !shouldRunScheduledSync(snapshot, Date.now())) {
      return;
    }

    const runKey = scheduledSyncRunKey(snapshot);

    if (scheduledSyncKeyRef.current === runKey) {
      return;
    }

    scheduledSyncKeyRef.current = runKey;
    void runSync();
  }, [loadState.data, runSync, syncing]);

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
          </main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster theme={themeMode} />
    </TooltipProvider>
  );
}
