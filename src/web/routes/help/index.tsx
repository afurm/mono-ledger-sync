import type { ReactNode } from "react";
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileClockIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldCheckIcon,
  WalletCardsIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { LocalAppSnapshot } from "../../api-types";
import { formatDateTime } from "../../format";
import type { RouteId } from "../../navigation";
import { MONOBANK_PUBLIC_TOKEN_URL } from "../../signin-card";
import { tokenStateLabel } from "../../status";

function HelpStatusRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="grid gap-1 rounded-md border border-border p-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="break-words text-sm font-medium">{value}</span>
      {detail && (
        <span className="text-xs text-muted-foreground">{detail}</span>
      )}
    </div>
  );
}

function HelpActionButton({
  routeId,
  children,
  onRouteChange,
}: {
  routeId: RouteId;
  children: ReactNode;
  onRouteChange: (routeId: RouteId) => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => onRouteChange(routeId)}
    >
      {children}
    </Button>
  );
}

export function HelpRoute({
  snapshot,
  onRouteChange,
}: {
  snapshot: LocalAppSnapshot | undefined;
  onRouteChange: (routeId: RouteId) => void;
}) {
  const tokenStatus = snapshot
    ? tokenStateLabel(snapshot.config.token)
    : {
        state: "Checking token",
        variant: "secondary" as const,
        description: "Waiting for the local Fastify API snapshot.",
      };
  const tokenInventory = snapshot?.config.token.clientInfo
    ? `${snapshot.config.token.clientInfo.accounts} accounts and ${snapshot.config.token.clientInfo.jars} jars from the masked client-info probe`
    : snapshot?.config.token.hasToken
      ? "Token saved; run Re-check Monobank connection to refresh masked inventory counts."
      : "No token saved for this local profile.";
  const sourceLabel =
    snapshot?.config.source === "monobank"
      ? "Monobank API"
      : snapshot
        ? "Development source"
        : "Checking source";
  const accessLabel = snapshot
    ? snapshot.config.access.localOnly
      ? `${snapshot.config.access.host} loopback bind`
      : `${snapshot.config.access.host} passcode-protected bind`
    : "Waiting for local API binding";
  const syncFreshness = snapshot?.summary.lastSyncedAt
    ? formatDateTime(snapshot.summary.lastSyncedAt)
    : "No completed sync yet";
  const databasePath =
    snapshot?.config.databasePath ?? "Waiting for local SQLite path";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Local setup runbook</CardTitle>
          <CardDescription>
            Current workspace status and the fastest next actions for local
            Monobank sync.
          </CardDescription>
          <CardAction>
            <Badge variant={tokenStatus.variant}>{tokenStatus.state}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <HelpStatusRow
              label="Profile"
              value={snapshot?.config.profile ?? "Waiting for local profile"}
              detail="Profile-scoped settings and SQLite ledger."
            />
            <HelpStatusRow
              label="Data source"
              value={sourceLabel}
              detail="Local sync uses the saved Monobank token when the API source is active."
            />
            <HelpStatusRow
              label="Database"
              value={databasePath}
              detail="Local SQLite file used for normalized ledger rows."
            />
            <HelpStatusRow
              label="Local API"
              value={accessLabel}
              detail="External binds require passcode protection."
            />
            <HelpStatusRow
              label="Last completed sync"
              value={syncFreshness}
              detail="Run Sync refreshes accounts, statements, reports, and hints."
            />
            <HelpStatusRow
              label="Masked inventory"
              value={tokenInventory}
              detail="Token values are never shown in this help view."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Token setup</CardTitle>
          <CardDescription>
            Save a personal Monobank token locally, then re-check the masked
            account inventory before syncing.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <Alert>
            <KeyRoundIcon />
            <AlertTitle>Token stays local</AlertTitle>
            <AlertDescription>
              This help view never displays the token value. Saved token state
              is shown as status, storage mode, and masked account or jar counts
              only.
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a
                href={MONOBANK_PUBLIC_TOKEN_URL}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLinkIcon data-icon="inline-start" />
                Open Monobank token page
              </a>
            </Button>
            <HelpActionButton routeId="settings" onRouteChange={onRouteChange}>
              <SettingsIcon data-icon="inline-start" />
              Open token settings
            </HelpActionButton>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup, restore, and exports</CardTitle>
          <CardDescription>
            Move data through local files generated from the current SQLite
            ledger.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <HelpStatusRow
            label="Backup recipe"
            value="Back up the SQLite database file from the path shown above before moving or replacing local data."
            detail="Stop the local server before restoring a database file on disk."
          />
          <HelpStatusRow
            label="Review recipe"
            value="Use CSV or JSON exports for monthly review and accountant handoff."
            detail="Token values and secret headers are excluded from export payloads."
          />
          <div className="flex flex-wrap gap-2">
            <HelpActionButton routeId="exports" onRouteChange={onRouteChange}>
              <DownloadIcon data-icon="inline-start" />
              Open exports
            </HelpActionButton>
            <HelpActionButton routeId="accounts" onRouteChange={onRouteChange}>
              <WalletCardsIcon data-icon="inline-start" />
              Review accounts
            </HelpActionButton>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting</CardTitle>
          <CardDescription>
            Local diagnostics for sync, webhook hints, rate limits, and empty
            ledgers.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <HelpStatusRow
            label="No transactions"
            value="Run Sync from the top bar after confirming the source and token status."
            detail="Transactions load from the local ledger, not directly from browser storage."
          />
          <HelpStatusRow
            label="Webhook events"
            value="Webhook events are sync hints and stay pending until statement pulls reconcile them."
            detail="Use Sync & Webhooks to review delivery attempts and pending hints."
          />
          <HelpStatusRow
            label="Rate limits or failures"
            value="Check Diagnostics timeline for redacted upstream status, retry windows, and local API errors."
            detail="Sensitive headers, tokens, and raw payloads are redacted from logs."
          />
          <div className="flex flex-wrap gap-2">
            <HelpActionButton routeId="sync" onRouteChange={onRouteChange}>
              <RefreshCwIcon data-icon="inline-start" />
              Open sync center
            </HelpActionButton>
            <HelpActionButton routeId="logs" onRouteChange={onRouteChange}>
              <FileClockIcon data-icon="inline-start" />
              Open diagnostics
            </HelpActionButton>
          </div>
        </CardContent>
      </Card>

      <Alert className="lg:col-span-2">
        <ShieldCheckIcon />
        <AlertTitle>Privacy model</AlertTitle>
        <AlertDescription>
          mono-ledger-sync is a local-first workspace: financial data is stored
          in SQLite on this machine, Monobank token values are never exported,
          and visible help states use local labels, counts, and masked inventory
          instead of raw secrets.
        </AlertDescription>
      </Alert>
    </div>
  );
}
