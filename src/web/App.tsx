import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  DownloadIcon,
  MenuIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

import {
  type LedgerEntry,
  type LocalAppSnapshot,
  loadLocalAppSnapshot,
  runFixtureSync,
} from "./api";
import { formatDate, formatDateTime, formatMinorAmount } from "./format";
import { type RouteId, isRouteId, routes, secondaryRoutes } from "./navigation";

type LoadState =
  | { status: "loading"; data?: LocalAppSnapshot; error?: undefined }
  | { status: "ready"; data: LocalAppSnapshot; error?: undefined }
  | { status: "error"; data?: LocalAppSnapshot; error: string };

function getInitialRoute(): RouteId {
  const hashRoute = window.location.hash.replace("#", "");

  return isRouteId(hashRoute) ? hashRoute : "overview";
}

function routeLabel(routeId: RouteId): string {
  return routes.find((route) => route.id === routeId)?.label ?? "Overview";
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

function AppSidebar({
  activeRoute,
  onRouteChange,
  snapshot,
}: {
  activeRoute: RouteId;
  onRouteChange: (routeId: RouteId) => void;
  snapshot: LocalAppSnapshot | undefined;
}) {
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
        <div className="flex flex-col gap-2 rounded-lg border bg-sidebar-accent/55 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Local only</span>
            <Badge variant="secondary">
              {snapshot?.health.status ?? "checking"}
            </Badge>
          </div>
          <p className="line-clamp-2 text-sidebar-foreground/70">
            {snapshot?.config.databasePath ?? "Waiting for local API"}
          </p>
        </div>
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
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function LoadingDashboard() {
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

function TransactionTable({ entries }: { entries: readonly LedgerEntry[] }) {
  if (entries.length === 0) {
    return (
      <Alert>
        <AlertCircleIcon />
        <AlertTitle>No local transactions yet</AlertTitle>
        <AlertDescription>
          Run fixture sync to populate the local SQLite ledger before reviewing
          transactions.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Merchant</TableHead>
          <TableHead className="hidden sm:table-cell">Category</TableHead>
          <TableHead className="hidden lg:table-cell">Account</TableHead>
          <TableHead className="text-right">Amount</TableHead>
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
            <TableCell className="text-right font-medium">
              {formatMinorAmount(entry.amount, entry.currencyCode)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OverviewRoute({
  snapshot,
  loading,
}: {
  snapshot: LocalAppSnapshot | undefined;
  loading: boolean;
}) {
  if (loading && !snapshot) {
    return <LoadingDashboard />;
  }

  if (!snapshot) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Accounts"
          value={String(snapshot.summary.accounts)}
          description={`${snapshot.accounts.length} local account records`}
        />
        <MetricCard
          title="Transactions"
          value={String(snapshot.summary.ledgerEntries)}
          description={`${snapshot.transactions.total} rows available to review`}
        />
        <MetricCard
          title="Income"
          value={formatMinorAmount(snapshot.summary.income)}
          description="Synced into the local ledger"
        />
        <MetricCard
          title="Expenses"
          value={formatMinorAmount(snapshot.summary.expenses)}
          description="Categorized from fixture rules"
        />
      </div>

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

        <Card>
          <CardHeader>
            <CardTitle>Sync state</CardTitle>
            <CardDescription>
              Current source, last successful sync, and fixture coverage.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Source</span>
              <Badge variant="secondary">{snapshot.config.source}</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Last synced</span>
              <span className="text-sm font-medium">
                {formatDateTime(snapshot.summary.lastSyncedAt)}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                Fixture rows
              </span>
              <span className="text-sm font-medium">
                {snapshot.fixtures?.statementItems ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TransactionsRoute({
  snapshot,
}: {
  snapshot: LocalAppSnapshot | undefined;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
        <CardDescription>
          Dense review table with local filters and raw-safe transaction labels.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TransactionTable entries={snapshot?.transactions.entries ?? []} />
      </CardContent>
    </Card>
  );
}

function SyncRoute({ snapshot }: { snapshot: LocalAppSnapshot | undefined }) {
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
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(snapshot?.syncRuns.length ?? 0) === 0 ? (
              <Alert>
                <AlertCircleIcon />
                <AlertTitle>No sync runs recorded</AlertTitle>
                <AlertDescription>
                  Run fixture sync from the top bar to create the first local
                  run.
                </AlertDescription>
              </Alert>
            ) : (
              snapshot?.syncRuns.slice(0, 6).map((run) => (
                <div
                  className="flex items-center justify-between gap-4 rounded-lg border p-3"
                  key={run.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{run.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(run.startedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {run.itemsSeen} seen
                    </span>
                    <Badge variant={statusVariant(run.status)}>
                      {run.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
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

function PlaceholderRoute({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
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
}: {
  activeRoute: RouteId;
  snapshot: LocalAppSnapshot | undefined;
  loading: boolean;
}) {
  switch (activeRoute) {
    case "overview":
      return <OverviewRoute loading={loading} snapshot={snapshot} />;
    case "transactions":
      return <TransactionsRoute snapshot={snapshot} />;
    case "sync":
      return <SyncRoute snapshot={snapshot} />;
    case "accounts":
      return (
        <PlaceholderRoute
          title="Accounts"
          description="Cards, jars, balances, masked identifiers, and statement cursors."
        />
      );
    case "exports":
      return (
        <PlaceholderRoute
          title="Exports"
          description="CSV, JSON, JSONL, and SQLite snapshot flows with local privacy notes."
        />
      );
    case "rules":
      return (
        <PlaceholderRoute
          title="Rules & Mappings"
          description="Categorization rules, merchant cleanup, and duplicate review queues."
        />
      );
    case "logs":
      return (
        <PlaceholderRoute
          title="Logs"
          description="Redacted sync, webhook, export, and diagnostics activity."
        />
      );
    case "settings":
      return (
        <PlaceholderRoute
          title="Settings"
          description="Profile, token status, data path, privacy, backups, and deletion."
        />
      );
    case "help":
      return (
        <PlaceholderRoute
          title="Help"
          description="Local setup, token setup, backup, export recipes, and troubleshooting."
        />
      );
  }
}

export default function App() {
  const [activeRoute, setActiveRoute] = useState<RouteId>(getInitialRoute);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [syncing, setSyncing] = useState(false);

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
  const title = useMemo(() => routeLabel(activeRoute), [activeRoute]);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          activeRoute={activeRoute}
          onRouteChange={onRouteChange}
          snapshot={snapshot}
        />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="hidden md:inline-flex" />
              <MobileNav
                activeRoute={activeRoute}
                onRouteChange={onRouteChange}
              />
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold">{title}</h1>
                <p className="truncate text-sm text-muted-foreground">
                  {snapshot
                    ? `${snapshot.config.profile} profile · ${snapshot.config.source} source`
                    : "Waiting for local API"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
