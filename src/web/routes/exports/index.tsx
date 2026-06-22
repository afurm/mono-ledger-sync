import { useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  DownloadIcon,
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
import { Checkbox } from "@/components/ui/checkbox";
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

import { saveLedgerExportToFolder } from "../../api";
import type { LocalAppSnapshot } from "../../api-types";
import { currencyLabel, formatDateTime } from "../../format";

const AMOUNT_FILTER_PATTERN = /^-?(?:\d+|\d*\.\d{1,2})$/;
const JOURNAL_CSV_EXPORT_HREF = "/api/exports/ledger?format=journal-csv";
type ExportWizardFormat =
  | "csv"
  | "json"
  | "jsonl"
  | "journal-csv"
  | "parquet"
  | "sqlite";

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

function exportFileExtension(format: ExportWizardFormat): string {
  return format === "journal-csv" ? "csv" : format;
}

function exportFileNamePreview(
  profile: string | undefined,
  preset: string,
  format: ExportWizardFormat,
): string {
  const safeProfile =
    profile
      ?.trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "default";

  if (format === "sqlite") {
    return `mono-ledger-${safeProfile}-sqlite-snapshot-redacted.sqlite`;
  }

  return `mono-ledger-${safeProfile}-${preset}.${exportFileExtension(format)}`;
}

const TABULAR_EXPORT_COLUMNS = [
  "id",
  "time",
  "accountId",
  "amount",
  "operationAmount",
  "currencyCode",
  "description",
  "merchantName",
  "categoryId",
  "categoryName",
  "mcc",
  "hold",
  "balance",
  "note",
  "tags",
  "rawStatementItemId",
];

function previewColumnsForFormat(format: ExportWizardFormat): string {
  if (format === "sqlite") {
    return "Full local database (redacted) — normalized ledger rows, accounts, categories, rules, budgets, sync runs, webhook events, BI views";
  }
  return TABULAR_EXPORT_COLUMNS.join(", ");
}

function previewExcludedFieldsForFormat(format: ExportWizardFormat): string {
  if (format === "sqlite") {
    return "Tokens, webhook secrets, sensitive counters, raw statement payloads when redacted";
  }
  return "Tokens, raw statement payloads (when redacted), webhook secrets, counterparty EDPOU/name when redacted";
}

function ExportWizardCard({
  snapshot,
}: {
  snapshot: LocalAppSnapshot | undefined;
}) {
  const [format, setFormat] = useState<ExportWizardFormat>("csv");
  const [preset, setPreset] = useState("monthly-personal-finance");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [reviewState, setReviewState] = useState("all");
  const [status, setStatus] = useState("all");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [currencyCode, setCurrencyCode] = useState("all");
  const [includeExcludedAccounts, setIncludeExcludedAccounts] = useState(false);
  const [isSavingToFolder, setIsSavingToFolder] = useState(false);
  const [exportActionError, setExportActionError] = useState<
    string | undefined
  >();
  const [exportActionMessage, setExportActionMessage] = useState<
    string | undefined
  >();
  const query = new URLSearchParams();

  query.set("format", format);

  if (format === "sqlite") {
    query.set("redacted", "true");
  } else {
    query.set("preset", preset);
  }

  if (from) {
    query.set("from", String(dateInputToEpoch(from) ?? ""));
  }

  if (to) {
    query.set("to", String(dateInputToEpoch(to, true) ?? ""));
  }

  if (accountId) {
    query.set("accountId", accountId);
  }

  if (categoryId) {
    query.set("categoryId", categoryId);
  }

  if (merchantName.trim()) {
    query.set("merchantName", merchantName.trim());
  }

  if (reviewState !== "all") {
    query.set("reviewState", reviewState);
  }

  if (status !== "all") {
    query.set("status", status);
  }

  const amountMinMinor = amountInputToMinor(amountMin);
  const amountMaxMinor = amountInputToMinor(amountMax);

  if (amountMinMinor !== undefined) {
    query.set("amountMin", String(amountMinMinor));
  }

  if (amountMaxMinor !== undefined) {
    query.set("amountMax", String(amountMaxMinor));
  }

  if (currencyCode !== "all") {
    query.set("currencyCode", currencyCode);
  }

  if (includeExcludedAccounts) {
    query.set("includeExcludedAccounts", "true");
  }

  const exportHref = `/api/exports/ledger?${query.toString()}`;
  const estimatedRows = snapshot?.transactions.total ?? 0;
  const previewIncludedColumns = previewColumnsForFormat(format);
  const previewExcludedFields = previewExcludedFieldsForFormat(format);
  const fileNamePreview = exportFileNamePreview(
    snapshot?.config.profile,
    preset,
    format,
  );
  const exportDirectory = snapshot?.config.settings.exportDirectory;
  const canSaveToFolder = !!exportDirectory;

  async function saveToFolder(): Promise<void> {
    setIsSavingToFolder(true);
    setExportActionError(undefined);
    setExportActionMessage(undefined);

    try {
      const fromEpoch = from ? dateInputToEpoch(from) : undefined;
      const toEpoch = to ? dateInputToEpoch(to, true) : undefined;
      const record = await saveLedgerExportToFolder({
        format,
        ...(format === "sqlite" ? { redacted: true } : { preset }),
        ...(fromEpoch === undefined ? {} : { from: fromEpoch }),
        ...(toEpoch === undefined ? {} : { to: toEpoch }),
        ...(accountId ? { accountId } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(merchantName.trim() ? { merchantName: merchantName.trim() } : {}),
        ...(status === "hold" || status === "posted" ? { status } : {}),
        ...(reviewState === "needs_review" ||
        reviewState === "reviewed" ||
        reviewState === "ignored"
          ? { reviewState }
          : {}),
        ...(currencyCode !== "all"
          ? { currencyCode: Number(currencyCode) }
          : {}),
        ...(amountMinMinor === undefined ? {} : { amountMin: amountMinMinor }),
        ...(amountMaxMinor === undefined ? {} : { amountMax: amountMaxMinor }),
        ...(includeExcludedAccounts ? { includeExcludedAccounts: true } : {}),
      });

      setExportActionMessage(
        `Export saved to ${record.filePath ?? exportDirectory}.`,
      );
    } catch (error) {
      setExportActionError(
        error instanceof Error ? error.message : "Unable to save export.",
      );
    } finally {
      setIsSavingToFolder(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export wizard</CardTitle>
        <CardDescription>
          Choose format, preset, filters, destination, and privacy boundary.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Format
            </span>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value as ExportWizardFormat)}
            >
              <SelectTrigger aria-label="Export format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="jsonl">JSONL</SelectItem>
                  <SelectItem value="journal-csv">Journal CSV</SelectItem>
                  <SelectItem value="parquet">Parquet</SelectItem>
                  <SelectItem value="sqlite">SQLite snapshot</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Preset
            </span>
            <Select
              disabled={format === "sqlite"}
              value={preset}
              onValueChange={setPreset}
            >
              <SelectTrigger aria-label="Export preset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="monthly-personal-finance">
                    Monthly personal finance
                  </SelectItem>
                  <SelectItem value="accountant-handoff">
                    Accountant handoff
                  </SelectItem>
                  <SelectItem value="bookkeeping">Bookkeeping</SelectItem>
                  <SelectItem value="budget-analysis">
                    Budget analysis
                  </SelectItem>
                  <SelectItem value="raw-transaction-archive">
                    Raw transaction archive
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Label>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            aria-label="Export from date"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <Input
            aria-label="Export to date"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <Select
            value={accountId || "all"}
            onValueChange={(value) =>
              setAccountId(value === "all" ? "" : value)
            }
          >
            <SelectTrigger aria-label="Export account">
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
          <Select
            value={categoryId || "all"}
            onValueChange={(value) =>
              setCategoryId(value === "all" ? "" : value)
            }
          >
            <SelectTrigger aria-label="Export category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All categories</SelectItem>
                {(snapshot?.categories ?? []).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            aria-label="Export merchant"
            placeholder="Merchant"
            value={merchantName}
            onChange={(event) => setMerchantName(event.target.value)}
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Export status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select value={reviewState} onValueChange={setReviewState}>
            <SelectTrigger aria-label="Export review state">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All review states</SelectItem>
                <SelectItem value="needs_review">Needs review</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select value={currencyCode} onValueChange={setCurrencyCode}>
            <SelectTrigger aria-label="Export currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All currencies</SelectItem>
                {(snapshot?.summary.currencies ?? []).map((currency) => (
                  <SelectItem key={currency} value={String(currency)}>
                    {currencyLabel(currency)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            aria-label="Export amount min"
            inputMode="decimal"
            placeholder="Min amount"
            value={amountMin}
            onChange={(event) => setAmountMin(event.target.value)}
          />
          <Input
            aria-label="Export amount max"
            inputMode="decimal"
            placeholder="Max amount"
            value={amountMax}
            onChange={(event) => setAmountMax(event.target.value)}
          />
        </div>
        <Label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={includeExcludedAccounts}
            onCheckedChange={(checked) =>
              setIncludeExcludedAccounts(checked === true)
            }
          />
          Include accounts excluded from reports
        </Label>
        <div
          className="grid gap-2 rounded-md border border-border p-3 text-sm"
          data-testid="export-preview"
        >
          <p className="font-medium">Preview</p>
          <p
            className="text-muted-foreground"
            data-testid="export-preview-rows"
          >
            Estimated rows from current snapshot: {estimatedRows}. File name:{" "}
            {fileNamePreview}
          </p>
          <p
            className="text-muted-foreground"
            data-testid="export-preview-date-range"
          >
            Date range:{" "}
            {from || to
              ? `${from || "earliest"} to ${to || "latest"}`
              : "All time"}
            .
          </p>
          <p
            className="text-muted-foreground"
            data-testid="export-preview-included-columns"
          >
            Included columns: {previewIncludedColumns}.
          </p>
          <p
            className="text-muted-foreground"
            data-testid="export-preview-excluded-sensitive"
          >
            Excluded sensitive fields: {previewExcludedFields}.
          </p>
          <p className="text-muted-foreground">
            Destination: browser download
            {canSaveToFolder ? ` or ${exportDirectory}` : ""}.
          </p>
          <p className="text-muted-foreground">
            Privacy: tokens, secret headers, and local token-store metadata are
            excluded. SQLite snapshots are redacted by default and include the
            normalized local database plus BI views.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="w-fit">
            <a href={exportHref}>
              <DownloadIcon data-icon="inline-start" />
              Run export
            </a>
          </Button>
          <Button asChild className="w-fit" variant="outline">
            <a href={JOURNAL_CSV_EXPORT_HREF}>
              <DownloadIcon data-icon="inline-start" />
              Journal CSV
            </a>
          </Button>
          <Button
            className="w-fit"
            type="button"
            variant="outline"
            disabled={!canSaveToFolder || isSavingToFolder}
            onClick={() => void saveToFolder()}
          >
            <DatabaseIcon data-icon="inline-start" />
            {isSavingToFolder ? "Saving..." : "Save to folder"}
          </Button>
        </div>
        {exportActionError && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Export failed</AlertTitle>
            <AlertDescription>{exportActionError}</AlertDescription>
          </Alert>
        )}
        {exportActionMessage && (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>Export saved</AlertTitle>
            <AlertDescription>{exportActionMessage}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function exportRecordDownloadHref(
  record: LocalAppSnapshot["exportHistory"][number],
): string {
  const query = new URLSearchParams();

  if (record.format) {
    query.set("format", record.format);
  }

  if (record.preset) {
    query.set("preset", record.preset);
  }

  for (const [key, value] of Object.entries(record.filters)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (key === "accountIds" && Array.isArray(value) && value[0]) {
      query.set("accountId", String(value[0]));
      continue;
    }

    if (key === "categoryIds" && Array.isArray(value) && value[0]) {
      query.set("categoryId", String(value[0]));
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      query.set(key, String(value));
    }
  }

  return `/api/exports/ledger?${query.toString()}`;
}

export function ExportsRoute({
  snapshot,
}: {
  snapshot: LocalAppSnapshot | undefined;
}) {
  const presets = [
    {
      id: "monthly-personal-finance",
      label: "Monthly personal finance",
      detail: "Categorized monthly ledger review.",
    },
    {
      id: "accountant-handoff",
      label: "Accountant handoff",
      detail: "Structured export for external bookkeeping review.",
    },
    {
      id: "bookkeeping",
      label: "Bookkeeping",
      detail: "Transaction rows shaped for local bookkeeping tools.",
    },
    {
      id: "budget-analysis",
      label: "Budget analysis",
      detail: "Category and period fields for budget comparison.",
    },
    {
      id: "raw-transaction-archive",
      label: "Raw transaction archive",
      detail: "Full local ledger archive without token values.",
    },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <ExportWizardCard snapshot={snapshot} />
      <Card>
        <CardHeader>
          <CardTitle>Export presets</CardTitle>
          <CardDescription>
            Preset downloads are generated locally from the current ledger
            database.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {presets.map((preset) => (
            <div
              className="flex flex-col justify-between gap-3 rounded-md border border-border p-3"
              key={preset.id}
            >
              <div>
                <p className="font-medium">{preset.label}</p>
                <p className="text-sm text-muted-foreground">{preset.detail}</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <a href={`/api/exports/ledger?preset=${preset.id}`}>
                  <DownloadIcon data-icon="inline-start" />
                  Download
                </a>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent exports</CardTitle>
          <CardDescription>
            Last local export runs for this profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {(snapshot?.exportHistory ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Export history appears after the first download or folder save.
            </p>
          ) : (
            (snapshot?.exportHistory ?? []).map((record) => (
              <div
                key={record.id}
                className="grid gap-2 rounded-md border border-border p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {record.preset ?? record.format}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(record.createdAt)} · {record.rowCount}{" "}
                      rows
                    </p>
                  </div>
                  <Badge
                    variant={
                      record.status === "success" ? "default" : "destructive"
                    }
                  >
                    {record.destination.replaceAll("_", " ")}
                  </Badge>
                </div>
                {record.filePath && (
                  <p className="break-all text-xs text-muted-foreground">
                    {record.filePath}
                  </p>
                )}
                <Button asChild size="sm" variant="outline">
                  <a href={exportRecordDownloadHref(record)}>
                    <DownloadIcon data-icon="inline-start" />
                    Rerun
                  </a>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <Alert className="xl:col-span-2">
        <ShieldCheckIcon />
        <AlertTitle>Local export boundary</AlertTitle>
        <AlertDescription>
          Local files generated from the current SQLite ledger are created by
          the local Fastify API on this machine. Token values and secret headers
          are never included.
        </AlertDescription>
      </Alert>
    </div>
  );
}
