import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldCheckIcon,
  Trash2Icon,
  XIcon,
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
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import {
  clearMonobankToken,
  compactLocalDatabase,
  createLocalBackup,
  deleteLocalData,
  importLocalConfiguration,
  initializeWorkspace,
  recheckMonobankConnection,
  restoreLocalDatabase,
  saveMonobankToken,
  updateLocalAppSettings,
} from "../../api";
import type {
  LocalApiMonobankTokenStatus,
  LocalAppSettingsUpdate,
  LocalAppSnapshot,
} from "../../api-types";
import { currencyLabel, formatDateTime } from "../../format";
import type { FirstRunEmptyStateView } from "../../empty-state";
import { buildFirstRunSignInCardView } from "../../signin-card";
import { tokenStateLabel } from "../../status";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
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

function localConfigurationPreview(input: string):
  | {
      status: "empty";
    }
  | {
      status: "invalid";
      message: string;
    }
  | {
      status: "ready";
      configuration: unknown;
      counts: {
        categories: number;
        categoryRules: number;
        budgets: number;
        budgetPeriods: number;
        tags: number;
      };
    } {
  const trimmed = input.trim();

  if (!trimmed) {
    return { status: "empty" };
  }

  try {
    const configuration = JSON.parse(trimmed) as Record<string, unknown>;
    const count = (key: string): number => {
      const value = configuration[key];

      return Array.isArray(value) ? value.length : 0;
    };

    return {
      status: "ready",
      configuration,
      counts: {
        categories: count("categories"),
        categoryRules: count("categoryRules"),
        budgets: count("budgets"),
        budgetPeriods: count("budgetPeriods"),
        tags: count("tags"),
      },
    };
  } catch (error) {
    return {
      status: "invalid",
      message:
        error instanceof Error
          ? error.message
          : "Configuration JSON could not be parsed.",
    };
  }
}

export function FirstRunEmptyStatePrompt({
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

function SettingsCountPreview({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ExactDestructiveActionDialog({
  children,
  confirmationValue,
  confirmLabel,
  confirmIcon,
  description,
  isConfirming,
  onConfirm,
  onOpenChange,
  open,
  title,
}: {
  children: ReactNode;
  confirmationValue: string;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  description: ReactNode;
  isConfirming: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  const [confirmationInput, setConfirmationInput] = useState("");
  const confirmed = confirmationInput === confirmationValue;

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      setConfirmationInput("");
    }

    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="destructive-confirmation">
            Type{" "}
            <span className="font-mono font-semibold">{confirmationValue}</span>{" "}
            to confirm.
          </Label>
          <Input
            id="destructive-confirmation"
            value={confirmationInput}
            autoComplete="off"
            onChange={(event) => setConfirmationInput(event.target.value)}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isConfirming}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={!confirmed || isConfirming}
            onClick={onConfirm}
          >
            {confirmIcon ?? <Trash2Icon data-icon="inline-start" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsRoute({
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
  const [tokenRemovalDialogOpen, setTokenRemovalDialogOpen] = useState(false);
  const [isInitializingWorkspace, setIsInitializingWorkspace] = useState(false);
  const [workspaceActionError, setWorkspaceActionError] = useState<
    string | undefined
  >();
  const [workspaceActionMessage, setWorkspaceActionMessage] = useState<
    string | undefined
  >();
  const [syncSchedule, setSyncSchedule] = useState("manual");
  const [excludedAccountIds, setExcludedAccountIds] = useState<
    readonly string[]
  >([]);
  const [exportDirectoryInput, setExportDirectoryInput] = useState("");
  const [budgetWarningThresholdInput, setBudgetWarningThresholdInput] =
    useState("80");
  const [settingsActionError, setSettingsActionError] = useState<
    string | undefined
  >();
  const [settingsActionMessage, setSettingsActionMessage] = useState<
    string | undefined
  >();
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [backupRestoreDialogOpen, setBackupRestoreDialogOpen] = useState(false);
  const [backupRestorePath, setBackupRestorePath] = useState<
    string | undefined
  >();
  const [isDeletingLocalData, setIsDeletingLocalData] = useState(false);
  const [localDataDeletionDialogOpen, setLocalDataDeletionDialogOpen] =
    useState(false);
  const [deleteLedgerDataChecked, setDeleteLedgerDataChecked] = useState(true);
  const [deleteTokenChecked, setDeleteTokenChecked] = useState(false);
  const [configurationImportInput, setConfigurationImportInput] = useState("");
  const [isImportingConfiguration, setIsImportingConfiguration] =
    useState(false);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    setSyncSchedule(snapshot.config.settings.syncSchedule ?? "manual");
    setExcludedAccountIds(snapshot.config.settings.excludedAccountIds ?? []);
    setExportDirectoryInput(snapshot.config.settings.exportDirectory ?? "");
    setBudgetWarningThresholdInput(
      String(snapshot.config.settings.budgetWarningThreshold ?? 80),
    );
  }, [snapshot]);

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
  const activeProfile = snapshot.config.profile;
  const activeDatabasePath = snapshot.config.databasePath;
  const configurationPreview = localConfigurationPreview(
    configurationImportInput,
  );

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
    setIsDeletingToken(true);
    setTokenActionError(undefined);
    setTokenActionMessage(undefined);

    try {
      const tokenStatus = await clearMonobankToken();
      setAcknowledgedLocalToken(false);
      setTokenRemovalDialogOpen(false);
      setTokenActionMessage(
        `Monobank token removed from the ${tokenStatus.profile} local profile.`,
      );
      await onRefresh();
    } catch (error) {
      setTokenRemovalDialogOpen(false);
      setTokenActionError(
        error instanceof Error ? error.message : "Unable to remove token.",
      );
    } finally {
      setIsDeletingToken(false);
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

  async function saveCockpitSettings(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const threshold = Number.parseInt(budgetWarningThresholdInput, 10);
    const update: LocalAppSettingsUpdate = {
      syncSchedule:
        syncSchedule === "hourly" ||
        syncSchedule === "daily" ||
        syncSchedule === "app_start"
          ? syncSchedule
          : "manual",
      excludedAccountIds,
      exportDirectory: exportDirectoryInput.trim(),
    };

    if (Number.isInteger(threshold) && threshold > 0 && threshold <= 100) {
      update.budgetWarningThreshold = threshold;
    }

    setIsSavingSettings(true);
    setSettingsActionError(undefined);
    setSettingsActionMessage(undefined);

    try {
      await updateLocalAppSettings(update);
      setSettingsActionMessage("Daily cockpit settings saved.");
      await onRefresh();
    } catch (error) {
      setSettingsActionError(
        error instanceof Error ? error.message : "Unable to save settings.",
      );
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function runBackup(): Promise<void> {
    setIsBackingUp(true);
    setSettingsActionError(undefined);
    setSettingsActionMessage(undefined);

    try {
      const backup = await createLocalBackup();
      setSettingsActionMessage(
        `Backup created at ${backup.backupPath} (${formatBytes(backup.bytes)}).`,
      );
      await onRefresh();
    } catch (error) {
      setSettingsActionError(
        error instanceof Error ? error.message : "Unable to create backup.",
      );
    } finally {
      setIsBackingUp(false);
    }
  }

  async function runCompact(): Promise<void> {
    setIsCompacting(true);
    setSettingsActionError(undefined);
    setSettingsActionMessage(undefined);

    try {
      await compactLocalDatabase();
      setSettingsActionMessage("SQLite database compacted.");
      await onRefresh();
    } catch (error) {
      setSettingsActionError(
        error instanceof Error ? error.message : "Unable to compact database.",
      );
    } finally {
      setIsCompacting(false);
    }
  }

  async function restoreSelectedBackup(): Promise<void> {
    if (!backupRestorePath) {
      return;
    }

    setIsRestoringBackup(true);
    setSettingsActionError(undefined);
    setSettingsActionMessage(undefined);

    try {
      await restoreLocalDatabase({
        backupPath: backupRestorePath,
        confirmProfile: activeProfile,
        confirmDatabasePath: activeDatabasePath,
      });
      setBackupRestoreDialogOpen(false);
      setSettingsActionMessage(`Backup restored from ${backupRestorePath}.`);
      await onRefresh();
    } catch (error) {
      setBackupRestoreDialogOpen(false);
      setSettingsActionError(
        error instanceof Error ? error.message : "Unable to restore backup.",
      );
    } finally {
      setIsRestoringBackup(false);
    }
  }

  async function deleteSelectedLocalData(): Promise<void> {
    setIsDeletingLocalData(true);
    setSettingsActionError(undefined);
    setSettingsActionMessage(undefined);

    try {
      const result = await deleteLocalData({
        confirmProfile: activeProfile,
        confirmDatabasePath: activeDatabasePath,
        ledgerData: deleteLedgerDataChecked,
        token: deleteTokenChecked,
      });
      setLocalDataDeletionDialogOpen(false);
      setSettingsActionMessage(
        result.ledgerDataDeleted && result.tokenRemoved
          ? "Ledger data and token removed."
          : result.ledgerDataDeleted
            ? "Ledger data removed."
            : "Token removed.",
      );
      await onRefresh();
    } catch (error) {
      setLocalDataDeletionDialogOpen(false);
      setSettingsActionError(
        error instanceof Error ? error.message : "Unable to delete local data.",
      );
    } finally {
      setIsDeletingLocalData(false);
    }
  }

  async function importConfiguration(): Promise<void> {
    if (configurationPreview.status !== "ready") {
      setSettingsActionError("Paste a valid local configuration JSON export.");
      return;
    }

    setIsImportingConfiguration(true);
    setSettingsActionError(undefined);
    setSettingsActionMessage(undefined);

    try {
      const result = await importLocalConfiguration(
        configurationPreview.configuration,
      );
      setConfigurationImportInput("");
      setSettingsActionMessage(
        `Imported ${result.imported.categories} categories, ${result.imported.categoryRules} rules, ${result.imported.budgets} budgets, ${result.imported.budgetPeriods} budget periods, and ${result.imported.tags} tags.`,
      );
      await onRefresh();
    } catch (error) {
      setSettingsActionError(
        error instanceof Error
          ? error.message
          : "Unable to import local configuration.",
      );
    } finally {
      setIsImportingConfiguration(false);
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
          <CardTitle>Daily cockpit settings</CardTitle>
          <CardDescription>
            Configure review cadence, reports, budgets, and export folder.
          </CardDescription>
          <CardAction>
            <Badge variant="outline">{snapshot.config.sync.schedule}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={saveCockpitSettings}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Label className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Sync schedule
                </span>
                <Select value={syncSchedule} onValueChange={setSyncSchedule}>
                  <SelectTrigger aria-label="Sync schedule">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual only</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="app_start">App start</SelectItem>
                  </SelectContent>
                </Select>
              </Label>
              <Label className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Budget warning threshold
                </span>
                <Input
                  value={budgetWarningThresholdInput}
                  inputMode="numeric"
                  onChange={(event) =>
                    setBudgetWarningThresholdInput(event.target.value)
                  }
                />
              </Label>
            </div>
            <Label className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Local export folder
              </span>
              <Input
                value={exportDirectoryInput}
                placeholder={`${snapshot.config.dataDir}/exports`}
                onChange={(event) =>
                  setExportDirectoryInput(event.target.value)
                }
              />
            </Label>
            <div className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Accounts included in reports
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                {snapshot.accounts.map((account) => {
                  const excluded = excludedAccountIds.includes(account.id);

                  return (
                    <Label
                      key={account.id}
                      className="flex items-center gap-2 rounded-md border border-border p-3 text-sm"
                    >
                      <Checkbox
                        checked={!excluded}
                        onCheckedChange={(checked) => {
                          setExcludedAccountIds((current) => {
                            const set = new Set(current);

                            if (checked === true) {
                              set.delete(account.id);
                            } else {
                              set.add(account.id);
                            }

                            return [...set].sort();
                          });
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {account.type || "account"} ·{" "}
                          {currencyLabel(account.currencyCode)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {account.id}
                        </span>
                      </span>
                    </Label>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isSavingSettings || loading}>
                <SettingsIcon data-icon="inline-start" />
                {isSavingSettings ? "Saving..." : "Save settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storage and local data</CardTitle>
          <CardDescription>
            Inspect the SQLite file, backups, compaction, and local deletion.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">
              {formatBytes(snapshot.storage.databaseBytes)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Database path
              </span>
              <span className="break-all font-medium">
                {snapshot.storage.databasePath}
              </span>
            </div>
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Data directory
              </span>
              <span className="break-all font-medium">
                {snapshot.storage.dataDir}
              </span>
            </div>
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Last backup
              </span>
              <span className="break-all font-medium">
                {snapshot.storage.latestBackupPath ?? "No backup yet"}
              </span>
              <span className="text-xs text-muted-foreground">
                {snapshot.storage.latestBackupAt
                  ? formatDateTime(snapshot.storage.latestBackupAt)
                  : snapshot.storage.backupDirectory}
              </span>
            </div>
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Last compact
              </span>
              <span className="font-medium">
                {snapshot.storage.lastCompactAt
                  ? formatDateTime(snapshot.storage.lastCompactAt)
                  : "Not compacted"}
              </span>
              <span className="text-xs text-muted-foreground">
                Integrity: {snapshot.storage.integrityCheck}
              </span>
            </div>
          </div>
          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Recent backups
            </span>
            {snapshot.storage.backups.length === 0 ? (
              <p className="rounded-md border border-border p-3 text-muted-foreground">
                No backups have been created for this profile.
              </p>
            ) : (
              <div className="grid gap-2">
                {snapshot.storage.backups.slice(0, 5).map((backup) => (
                  <div
                    className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    key={backup.path}
                  >
                    <div className="min-w-0">
                      <p className="break-all font-medium">{backup.path}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(backup.modifiedAt)} ·{" "}
                        {formatBytes(backup.bytes)}
                      </p>
                    </div>
                    <ExactDestructiveActionDialog
                      open={
                        backupRestoreDialogOpen &&
                        backupRestorePath === backup.path
                      }
                      onOpenChange={(open) => {
                        setBackupRestoreDialogOpen(open);
                        setBackupRestorePath(open ? backup.path : undefined);
                      }}
                      confirmationValue={`${activeProfile} ${activeDatabasePath}`}
                      confirmLabel={
                        isRestoringBackup ? "Restoring..." : "Restore backup"
                      }
                      confirmIcon={<DatabaseIcon data-icon="inline-start" />}
                      isConfirming={isRestoringBackup}
                      onConfirm={() => void restoreSelectedBackup()}
                      title="Restore this backup?"
                      description={
                        <>
                          This overwrites profile{" "}
                          <span className="font-mono font-semibold">
                            {activeProfile}
                          </span>{" "}
                          database{" "}
                          <span className="break-all font-mono font-semibold">
                            {activeDatabasePath}
                          </span>{" "}
                          with{" "}
                          <span className="break-all font-mono font-semibold">
                            {backup.path}
                          </span>
                          .
                        </>
                      }
                    >
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isRestoringBackup || loading}
                      >
                        <DatabaseIcon data-icon="inline-start" />
                        Restore
                      </Button>
                    </ExactDestructiveActionDialog>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isBackingUp || loading}
              onClick={() => void runBackup()}
            >
              <DownloadIcon data-icon="inline-start" />
              {isBackingUp ? "Backing up..." : "Backup now"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isCompacting || loading}
              onClick={() => void runCompact()}
            >
              <DatabaseIcon data-icon="inline-start" />
              {isCompacting ? "Compacting..." : "Compact database"}
            </Button>
            <ExactDestructiveActionDialog
              open={localDataDeletionDialogOpen}
              onOpenChange={setLocalDataDeletionDialogOpen}
              confirmationValue={`${activeProfile} ${snapshot.config.databasePath}`}
              confirmLabel={
                isDeletingLocalData ? "Deleting..." : "Delete selected data"
              }
              isConfirming={isDeletingLocalData}
              onConfirm={() => void deleteSelectedLocalData()}
              title="Delete local data?"
              description={
                <>
                  This affects profile{" "}
                  <span className="font-mono font-semibold">
                    {activeProfile}
                  </span>{" "}
                  and database{" "}
                  <span className="break-all font-mono font-semibold">
                    {snapshot.config.databasePath}
                  </span>
                  . Backups and export files remain on disk.
                </>
              }
            >
              <Button
                type="button"
                variant="destructive"
                disabled={
                  isDeletingLocalData ||
                  (!deleteLedgerDataChecked && !deleteTokenChecked)
                }
              >
                <Trash2Icon data-icon="inline-start" />
                Delete local data
              </Button>
            </ExactDestructiveActionDialog>
          </div>
          <div className="flex flex-wrap gap-3">
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={deleteLedgerDataChecked}
                onCheckedChange={(checked) =>
                  setDeleteLedgerDataChecked(checked === true)
                }
              />
              Ledger, accounts, sync, webhooks
            </Label>
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={deleteTokenChecked}
                onCheckedChange={(checked) =>
                  setDeleteTokenChecked(checked === true)
                }
              />
              Saved token
            </Label>
          </div>
          {settingsActionError && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Local operation failed</AlertTitle>
              <AlertDescription>{settingsActionError}</AlertDescription>
            </Alert>
          )}
          {settingsActionMessage && (
            <Alert>
              <CheckCircle2Icon />
              <AlertTitle>Local operation complete</AlertTitle>
              <AlertDescription>{settingsActionMessage}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration import and export</CardTitle>
          <CardDescription>
            Move local categories, rules, budgets, periods, and tags between
            profiles without exporting transactions or tokens.
          </CardDescription>
          <CardAction>
            <Button asChild size="sm" variant="outline">
              <a href="/api/exports/local-configuration">
                <DownloadIcon data-icon="inline-start" />
                Export JSON
              </a>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <Label className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Local configuration JSON
            </span>
            <Textarea
              value={configurationImportInput}
              placeholder='{"format":"local-configuration","schemaVersion":1,...}'
              rows={8}
              onChange={(event) =>
                setConfigurationImportInput(event.target.value)
              }
            />
          </Label>
          {configurationPreview.status === "ready" && (
            <div className="grid gap-2 rounded-md border border-border p-3">
              <p className="font-medium">Import preview</p>
              <div className="grid gap-2 sm:grid-cols-5">
                <SettingsCountPreview
                  label="Categories"
                  value={configurationPreview.counts.categories}
                />
                <SettingsCountPreview
                  label="Rules"
                  value={configurationPreview.counts.categoryRules}
                />
                <SettingsCountPreview
                  label="Budgets"
                  value={configurationPreview.counts.budgets}
                />
                <SettingsCountPreview
                  label="Periods"
                  value={configurationPreview.counts.budgetPeriods}
                />
                <SettingsCountPreview
                  label="Tags"
                  value={configurationPreview.counts.tags}
                />
              </div>
            </div>
          )}
          {configurationPreview.status === "invalid" && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Invalid JSON</AlertTitle>
              <AlertDescription>
                {configurationPreview.message}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={
                isImportingConfiguration ||
                configurationPreview.status !== "ready"
              }
              onClick={() => void importConfiguration()}
            >
              <DatabaseIcon data-icon="inline-start" />
              {isImportingConfiguration ? "Importing..." : "Import config"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!configurationImportInput || isImportingConfiguration}
              onClick={() => setConfigurationImportInput("")}
            >
              Clear
            </Button>
          </div>
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

          <form
            className="grid gap-3"
            data-testid="settings-token-form"
            onSubmit={saveToken}
          >
            <Label className="sr-only" htmlFor="monobank-token-profile">
              Local profile username
            </Label>
            <Input
              id="monobank-token-profile"
              name="username"
              type="text"
              value={activeProfile}
              autoComplete="username"
              readOnly
              tabIndex={-1}
              className="sr-only"
            />
            <Label className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Monobank personal API token
              </span>
              <Input
                id="monobank-token"
                name="password"
                type={showToken ? "text" : "password"}
                value={tokenInput}
                placeholder="Paste token from Monobank"
                autoComplete="current-password"
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
            </Label>

            <Label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={acknowledgedLocalToken}
                onCheckedChange={(checked) => {
                  const isChecked = checked === true;

                  setAcknowledgedLocalToken(isChecked);
                  setTokenError(
                    tokenInput ? validateTokenInput(tokenInput) : undefined,
                  );
                }}
              />
              <span className="text-muted-foreground">
                I understand this token is used only by the local API on this
                device for the {activeProfile} profile.
              </span>
            </Label>

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={isBusy || !isTokenInputValid || loading}
              >
                {isSavingToken ? "Saving..." : "Save token"}
              </Button>
              <ExactDestructiveActionDialog
                open={tokenRemovalDialogOpen}
                onOpenChange={setTokenRemovalDialogOpen}
                confirmationValue={activeProfile}
                confirmLabel={isDeletingToken ? "Removing..." : "Remove token"}
                isConfirming={isDeletingToken}
                onConfirm={() => void removeToken()}
                title="Remove Monobank token?"
                description={
                  <>
                    This deletes the saved token for the{" "}
                    <span className="font-mono font-semibold">
                      {activeProfile}
                    </span>{" "}
                    local profile using database{" "}
                    <span className="break-all font-mono font-semibold">
                      {snapshot.config.databasePath}
                    </span>
                    . Existing SQLite ledger data and exports remain on this
                    device.
                  </>
                }
              >
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isBusy || !snapshot.config.token.hasToken}
                >
                  <Trash2Icon data-icon="inline-start" />
                  {isDeletingToken ? "Removing..." : "Remove token"}
                </Button>
              </ExactDestructiveActionDialog>
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

          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Data source
            </span>
            <div className="grid gap-1 rounded-md border border-border p-3">
              <span className="text-sm font-medium">
                {snapshot.config.source === "monobank"
                  ? "Monobank API"
                  : "Development source"}
              </span>
              <span className="text-xs text-muted-foreground">
                {snapshot.config.source === "monobank"
                  ? "Local sync uses the saved Monobank token and writes normalized data to SQLite."
                  : "Development source is active for offline local workflows."}
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
    </div>
  );
}
