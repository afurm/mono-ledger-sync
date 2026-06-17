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
  CheckCheckIcon,
  FilterXIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SplitIcon,
  StickyNoteIcon,
  StoreIcon,
  TagIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

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
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import {
  createCategoryRule,
  loadLedgerTransactions,
  updateLedgerTransactionAnnotation,
  updateLedgerTransactionSplitPlan,
  updateLedgerTransactionsBulk,
} from "../../api";
import type {
  CategoryRule,
  CategoryRuleInput,
  LedgerEntry,
  LedgerEntryPage,
  LedgerTransactionFilters,
  LedgerTransactionSortDirection,
  LedgerTransactionSortField,
  LocalAppSnapshot,
  SyncRun,
  WebhookEvent,
} from "../../api-types";
import { formatDateTime, formatMinorAmount } from "../../format";
import {
  TransactionCategoryBadge,
  TransactionTable,
  TransactionTagsCell,
  amountSemanticTextClassName,
  transactionCategoryLabel,
  type TransactionReviewState,
} from "../../transaction-cells";

const MAX_SPLIT_PLAN_LINES = 20;
type TransactionFilterFormState = {
  search: string;
  accountId: string;
  categoryId: string;
  merchantName: string;
  status: "all" | "hold" | "posted";
  reviewState: "all" | "needs_review" | "reviewed" | "ignored";
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

type TransactionBulkEditState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; message: string }
  | { status: "error"; message: string };

interface TransactionUndoState {
  entries: readonly LedgerEntry[];
  message: string;
}

type TransactionFilterPresetId =
  | "new"
  | "needs-review"
  | "monthly-review"
  | "uncategorized"
  | "holds"
  | "large-expenses"
  | "transfers"
  | "subscriptions"
  | "income";

interface TransactionFilterPreset {
  id: TransactionFilterPresetId;
  label: string;
  buildFilters: () => TransactionFilterFormState;
}

const TRANSACTION_PAGE_SIZE = 25;
const AMOUNT_FILTER_PATTERN = /^-?(?:\d+|\d*\.\d{1,2})$/;

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
    reviewState: "all",
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
    id: "new",
    label: "New",
    buildFilters: () => ({
      ...defaultTransactionFilters(),
      reviewState: "needs_review",
    }),
  },
  {
    id: "needs-review",
    label: "Needs review",
    buildFilters: () => ({
      ...defaultTransactionFilters(),
      reviewState: "needs_review",
    }),
  },
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
    id: "holds",
    label: "Holds",
    buildFilters: () => ({
      ...defaultTransactionFilters(),
      status: "hold",
      reviewState: "needs_review",
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
    id: "transfers",
    label: "Transfers",
    buildFilters: () => ({
      ...defaultTransactionFilters(),
      categoryId: "transfers",
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

function categoryRuleInputSummary(
  input: CategoryRuleInput,
  categoryName: string,
): CategoryRuleSummary {
  const rule: CategoryRule = {
    id: "draft",
    categoryId: input.categoryId,
    name: input.name ?? `Draft rule for ${categoryName}`,
    priority: input.priority ?? 50,
    matchType: "condition",
    ...(input.merchantContains
      ? { merchantContains: input.merchantContains }
      : {}),
    ...(input.descriptionContains
      ? { descriptionContains: input.descriptionContains }
      : {}),
    ...(input.mcc === undefined ? {} : { mcc: input.mcc }),
    amountDirection: input.amountDirection ?? "any",
    isEnabled: input.isEnabled !== false,
    createdAt: new Date(0).toISOString(),
  };

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
    isEnabled: true,
    isSystem: false,
  };
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
  const reviewState = params.get("reviewState");
  const sortBy = params.get("sortBy");
  const sortDirection = params.get("sortDirection");
  const page = Number.parseInt(params.get("page") ?? "", 10);

  return normalizeTransactionFilters({
    search: params.get("search") ?? "",
    accountId: params.get("accountId") ?? "",
    categoryId: params.get("categoryId") ?? "",
    merchantName: params.get("merchantName") ?? "",
    status: status === "hold" || status === "posted" ? status : "all",
    reviewState:
      reviewState === "needs_review" ||
      reviewState === "reviewed" ||
      reviewState === "ignored"
        ? reviewState
        : "all",
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
    normalizedFilters.reviewState === presetFilters.reviewState &&
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

  if (filters.reviewState !== "all") {
    query.reviewState = filters.reviewState;
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
    filters.reviewState !== "all" ||
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

function transactionCategoryRuleMatch(entry: LedgerEntry): string {
  if (entry.categorySource === "manual") {
    return "Manual category override";
  }

  if (entry.categorySource === "user_rule" && entry.categoryRuleId) {
    return `User rule ${entry.categoryRuleId}`;
  }

  if (entry.categoryRuleId === "internal-transfer-pair") {
    return "Detected internal transfer pair";
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

interface CategoryVersionHistoryItem {
  label: string;
  value: string;
  detail: string;
  badge: string;
  recordedAt?: string | undefined;
}

function categorySourceVersionLabel(
  source: LedgerEntry["categorySource"],
): string {
  switch (source) {
    case "manual":
      return "Manual";
    case "user_rule":
      return "User rule";
    case "system_rule":
      return "System rule";
    default:
      return "Initial";
  }
}

function transactionCategoryVersionHistory(
  entry: LedgerEntry,
): CategoryVersionHistoryItem[] {
  const category = transactionCategoryLabel(entry);
  const sourceLabel = categorySourceVersionLabel(entry.categorySource);
  const items: CategoryVersionHistoryItem[] = [
    {
      label: "Current category",
      value: category,
      detail:
        entry.categorySource === "manual"
          ? "Stored as a manual local override."
          : entry.categoryRuleId
            ? "Stored with rule metadata from local categorization."
            : "Stored without rule metadata from the initial ledger write.",
      badge: sourceLabel,
      recordedAt: entry.updatedAt ?? entry.createdAt,
    },
  ];

  if (entry.categorySource === "manual") {
    items.push({
      label: "Manual override",
      value: category,
      detail: "Rule metadata was cleared when the local category was edited.",
      badge: "Manual",
      recordedAt: entry.updatedAt,
    });

    return items;
  }

  if (entry.categoryRuleId) {
    items.push({
      label: `${sourceLabel} source`,
      value: entry.categoryRuleId,
      detail: entry.categoryRuleVersion
        ? `Applied from rule version ${entry.categoryRuleVersion}.`
        : "Applied from a rule before version metadata was recorded.",
      badge: sourceLabel,
      recordedAt: entry.categoryRuleVersion,
    });

    return items;
  }

  if (!entry.categoryId || entry.categoryId === "uncategorized") {
    items.push({
      label: "Fallback state",
      value: "Uncategorized",
      detail: "No manual override or matching category rule is recorded.",
      badge: "Fallback",
      recordedAt: entry.createdAt,
    });

    return items;
  }

  items.push({
    label: "Initial sync assignment",
    value: category,
    detail: "Category was stored before rule provenance was available.",
    badge: "Initial",
    recordedAt: entry.createdAt,
  });

  return items;
}

function CategoryVersionHistoryList({ entry }: { entry: LedgerEntry }) {
  return (
    <div className="grid gap-2">
      {transactionCategoryVersionHistory(entry).map((item) => (
        <div
          className="grid gap-2 rounded-md border border-border p-3"
          key={`${item.label}:${item.value}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.label}</p>
              <p className="truncate text-xs text-muted-foreground">
                {item.value}
              </p>
            </div>
            <Badge variant="secondary">{item.badge}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{item.detail}</p>
          {item.recordedAt ? (
            <p className="text-xs text-muted-foreground">
              Recorded {formatDateTime(item.recordedAt)}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function syncSourceLabel(
  source: LocalAppSnapshot["config"]["source"] | undefined,
) {
  switch (source) {
    case "fixture":
      return "Development sync";
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
  categoryOptions,
  onOpenChange,
  onEntryUpdated,
  onBeforeLocalEdit,
  onRuleCreated,
  source,
  rulePreviewEntries = [],
  syncRuns = [],
  webhookEvents = [],
}: {
  entry: LedgerEntry | undefined;
  open: boolean;
  categoryOptions: readonly { id: string; label: string }[];
  onOpenChange: (open: boolean) => void;
  onEntryUpdated: (entry: LedgerEntry) => void;
  onBeforeLocalEdit?: (entry: LedgerEntry) => void;
  onRuleCreated?: () => Promise<void>;
  source: LocalAppSnapshot["config"]["source"] | undefined;
  rulePreviewEntries?: readonly LedgerEntry[];
  syncRuns: readonly SyncRun[] | undefined;
  webhookEvents: readonly WebhookEvent[] | undefined;
}) {
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [localEditState, setLocalEditState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [splitPlanLines, setSplitPlanLines] = useState<
    readonly SplitPlanLineInput[]
  >([]);
  const [splitPlanSaveState, setSplitPlanSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [ruleSaveState, setRuleSaveState] = useState<
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
  const localFieldsChanged =
    entry !== undefined &&
    (categoryId !== (entry.categoryId ?? "") ||
      merchantName.trim() !== (entry.merchantName ?? ""));
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
  const categoryRuleDraft = useMemo<CategoryRuleInput | undefined>(() => {
    if (!entry) {
      return undefined;
    }

    const targetCategoryId = categoryId.trim();

    if (!targetCategoryId || targetCategoryId === "uncategorized") {
      return undefined;
    }

    if (!localFieldsChanged && entry.categorySource !== "manual") {
      return undefined;
    }

    const merchantContains =
      merchantName.trim() || entry.merchantName?.trim() || undefined;
    const descriptionContains = merchantContains
      ? undefined
      : entry.description.trim();
    const categoryLabel =
      categoryOptions.find((category) => category.id === targetCategoryId)
        ?.label ?? targetCategoryId;

    return {
      categoryId: targetCategoryId,
      name: `${
        merchantContains ?? descriptionContains ?? "Manual edit"
      } to ${categoryLabel}`.slice(0, 120),
      ...(merchantContains ? { merchantContains } : {}),
      ...(descriptionContains ? { descriptionContains } : {}),
      amountDirection:
        entry.amount > 0 ? "income" : entry.amount < 0 ? "expense" : "any",
      isEnabled: true,
    };
  }, [categoryId, categoryOptions, entry, localFieldsChanged, merchantName]);
  const categoryRuleDraftSummary = useMemo(() => {
    if (!categoryRuleDraft) {
      return undefined;
    }

    const categoryLabel =
      categoryOptions.find(
        (category) => category.id === categoryRuleDraft.categoryId,
      )?.label ?? categoryRuleDraft.categoryId;

    return categoryRuleInputSummary(categoryRuleDraft, categoryLabel);
  }, [categoryOptions, categoryRuleDraft]);
  const categoryRulePreviewCount = useMemo(() => {
    if (!categoryRuleDraftSummary) {
      return 0;
    }

    return rulePreviewEntries.filter((candidate) =>
      ledgerEntryMatchesRule(candidate, categoryRuleDraftSummary),
    ).length;
  }, [categoryRuleDraftSummary, rulePreviewEntries]);

  useEffect(() => {
    setNote(entry?.note ?? "");
    setTags(tagsInputValue(entry?.tags));
    setCategoryId(entry?.categoryId ?? "");
    setMerchantName(entry?.merchantName ?? "");
    setSaveState("idle");
    setLocalEditState("idle");
    setSplitPlanLines(entry ? splitPlanLinesFromEntry(entry) : []);
    setSplitPlanSaveState("idle");
    setRuleSaveState("idle");
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
    onBeforeLocalEdit?.(entry);

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

  async function saveLocalFields(): Promise<void> {
    if (!entry || localEditState === "saving" || !localFieldsChanged) {
      return;
    }

    const savedEntryId = entry.id;

    setLocalEditState("saving");
    onBeforeLocalEdit?.(entry);

    try {
      const [updatedEntry] = await updateLedgerTransactionsBulk({
        ids: [entry.id],
        categoryId,
        merchantName: merchantName.trim(),
      });

      if (
        !updatedEntry ||
        !openRef.current ||
        entryIdRef.current !== savedEntryId
      ) {
        return;
      }

      onEntryUpdated(updatedEntry);
      setLocalEditState("saved");
    } catch {
      if (!openRef.current || entryIdRef.current !== savedEntryId) {
        return;
      }

      setLocalEditState("error");
    }
  }

  async function saveCategoryRuleDraft(): Promise<void> {
    if (!categoryRuleDraft || ruleSaveState === "saving") {
      return;
    }

    setRuleSaveState("saving");

    try {
      await createCategoryRule(categoryRuleDraft);
      await onRuleCreated?.();
      setRuleSaveState("saved");
    } catch {
      setRuleSaveState("error");
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
    onBeforeLocalEdit?.(entry);

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
                <span
                  className={`text-xl font-semibold tabular-nums ${amountSemanticTextClassName(entry.amount)}`}
                >
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
                Local review edit
              </h3>
              <Label className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Category
                </span>
                <Select
                  value={categoryId || "none"}
                  onValueChange={(value) => {
                    setCategoryId(value === "none" ? "" : value);
                    setLocalEditState("idle");
                  }}
                >
                  <SelectTrigger aria-label="Transaction category">
                    <SelectValue placeholder="No category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">No category</SelectItem>
                      {categoryOptions.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Label>
              <Label className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Merchant
                </span>
                <Input
                  placeholder="Merchant override"
                  value={merchantName}
                  onChange={(event) => {
                    setMerchantName(event.target.value);
                    setLocalEditState("idle");
                  }}
                />
              </Label>
              {categoryRuleDraft ? (
                <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Rule from this edit
                    </span>
                    <Badge variant="outline">
                      {categoryRulePreviewCount} loaded matches
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">
                    {categoryRuleDraft.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {categoryRuleDraftSummary?.conditions ??
                      "Manual rule condition"}
                  </p>
                </div>
              ) : (
                <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                  Rule preview appears after choosing a target category and
                  entering a merchant or description-backed local edit.
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={!localFieldsChanged || localEditState === "saving"}
                  onClick={() => {
                    void saveLocalFields();
                  }}
                >
                  <StoreIcon data-icon="inline-start" />
                  {localEditState === "saving" ? "Saving" : "Save local edit"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!categoryRuleDraft || ruleSaveState === "saving"}
                  onClick={() => {
                    void saveCategoryRuleDraft();
                  }}
                >
                  <TagIcon data-icon="inline-start" />
                  {ruleSaveState === "saving" ? "Saving rule" : "Save rule"}
                </Button>
                {localEditState === "saved" && (
                  <span className="text-xs text-muted-foreground">Saved</span>
                )}
                {localEditState === "error" && (
                  <span className="text-xs text-destructive">
                    Could not save local edit
                  </span>
                )}
                {ruleSaveState === "saved" && (
                  <span className="text-xs text-muted-foreground">
                    Rule saved
                  </span>
                )}
                {ruleSaveState === "error" && (
                  <span className="text-xs text-destructive">
                    Could not save rule
                  </span>
                )}
              </div>
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
                Category version history
              </h3>
              <CategoryVersionHistoryList entry={entry} />
            </section>

            <Separator />

            <section className="grid gap-3">
              <h3 className="text-sm font-medium text-foreground">
                Local annotations
              </h3>
              <Label className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Note
                </span>
                <Textarea
                  className="min-h-24 resize-y"
                  maxLength={2000}
                  placeholder="Local review note"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    setSaveState("idle");
                  }}
                />
              </Label>
              <Label className="grid gap-1">
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
              </Label>
              <TransactionTagsCell tags={entry.tags} />
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

export function TransactionsRoute({
  snapshot,
  onRefresh,
}: {
  snapshot: LocalAppSnapshot | undefined;
  onRefresh: () => Promise<void>;
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
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkMerchantName, setBulkMerchantName] = useState("");
  const [bulkReviewState, setBulkReviewState] = useState<
    "no-change" | "needs_review" | "reviewed" | "ignored"
  >("no-change");
  const [bulkEditState, setBulkEditState] = useState<TransactionBulkEditState>({
    status: "idle",
  });
  const [undoState, setUndoState] = useState<
    TransactionUndoState | undefined
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

  useEffect(() => {
    setSelectedTransactionIds(new Set());
    setBulkEditState({ status: "idle" });
  }, [filters]);

  useEffect(() => {
    setSelectedTransactionIds((current) => {
      if (!pageState.data) {
        return current;
      }

      const visibleIds = new Set(
        pageState.data.entries.map((entry) => entry.id),
      );
      const next = new Set(
        [...current].filter((entryId) => visibleIds.has(entryId)),
      );

      return next.size === current.size ? current : next;
    });
  }, [pageState.data]);

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

    if (filters.reviewState !== "all") {
      labels.push(
        `Review: ${
          filters.reviewState === "needs_review"
            ? "Needs review"
            : filters.reviewState === "reviewed"
              ? "Reviewed"
              : "Ignored"
        }`,
      );
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
  const selectedTransactions =
    transactions?.entries.filter((entry) =>
      selectedTransactionIds.has(entry.id),
    ) ?? [];
  const selectedTransactionCount = selectedTransactions.length;
  const trimmedBulkMerchantName = bulkMerchantName.trim();
  const hasBulkEditPayload =
    bulkCategoryId !== "" ||
    trimmedBulkMerchantName !== "" ||
    bulkReviewState !== "no-change";
  const canApplyBulkEdit =
    selectedTransactionCount > 0 &&
    hasBulkEditPayload &&
    bulkEditState.status !== "saving" &&
    !loading;

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

  const setSort = useCallback(
    (sortBy: LedgerTransactionSortField): void => {
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
    },
    [filters],
  );

  const handleTransactionUpdated = useCallback((entry: LedgerEntry): void => {
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
  }, []);

  const applyUpdatedTransactions = useCallback(
    (entries: readonly LedgerEntry[]): void => {
      const updatedEntriesById = new Map(
        entries.map((entry) => [entry.id, entry]),
      );

      setPageState((current) => {
        if (!current.data) {
          return current;
        }

        return {
          ...current,
          data: {
            ...current.data,
            entries: current.data.entries.map(
              (entry) => updatedEntriesById.get(entry.id) ?? entry,
            ),
          },
        };
      });
      setSelectedTransaction((current) =>
        current ? (updatedEntriesById.get(current.id) ?? current) : current,
      );
      setTransactionsReloadToken((current) => current + 1);
    },
    [],
  );

  const rememberUndo = useCallback(
    (
      entries: readonly LedgerEntry[],
      message = "Undo last transaction edit",
    ): void => {
      if (entries.length === 0) {
        return;
      }

      setUndoState({
        entries: entries.map((entry) => ({ ...entry })),
        message,
      });
    },
    [],
  );

  async function undoLastTransactionEdit(): Promise<void> {
    if (!undoState) {
      return;
    }

    const previousEntries = undoState.entries;
    setBulkEditState({ status: "saving" });

    try {
      const restoredEntries = (
        await Promise.all(
          previousEntries.map(async (entry) => {
            await updateLedgerTransactionsBulk({
              ids: [entry.id],
              categoryId: entry.categoryId ?? "",
              merchantName: entry.merchantName ?? "",
              tags: entry.tags ?? [],
              reviewState: entry.reviewState ?? "needs_review",
              reviewedSource: "undo",
            });
            await updateLedgerTransactionAnnotation(entry.id, {
              note: entry.note ?? "",
              tags: entry.tags ?? [],
            });

            return updateLedgerTransactionSplitPlan(entry.id, {
              lines: entry.splitPlan ?? [],
            });
          }),
        )
      ).flat();

      applyUpdatedTransactions(restoredEntries);
      setUndoState(undefined);
      setBulkEditState({
        status: "saved",
        message: `Restored ${restoredEntries.length} transactions.`,
      });
      toast.success("Last transaction edit restored.");
    } catch (error) {
      setBulkEditState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Transaction edit could not be restored.",
      });
    }
  }

  const updateTransactionReviewState = useCallback(
    async (
      entry: LedgerEntry,
      reviewState: TransactionReviewState,
    ): Promise<void> => {
      try {
        rememberUndo([entry]);
        const [updatedEntry] = await updateLedgerTransactionsBulk({
          ids: [entry.id],
          reviewState,
          reviewedSource: "manual",
        });

        if (!updatedEntry) {
          return;
        }

        handleTransactionUpdated(updatedEntry);
        toast.success(
          reviewState === "needs_review"
            ? "Transaction moved back to review."
            : reviewState === "reviewed"
              ? "Transaction marked reviewed."
              : "Transaction ignored.",
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Transaction review state could not be updated.",
        );
        setUndoState(undefined);
      }
    },
    [handleTransactionUpdated, rememberUndo],
  );

  const setTransactionSelected = useCallback(
    (entryId: string, selected: boolean): void => {
      setSelectedTransactionIds((current) => {
        const next = new Set(current);

        if (selected) {
          next.add(entryId);
        } else {
          next.delete(entryId);
        }

        return next;
      });
      setBulkEditState({ status: "idle" });
    },
    [],
  );

  const setVisibleTransactionsSelected = useCallback(
    (selected: boolean): void => {
      if (!transactions) {
        return;
      }

      setSelectedTransactionIds((current) => {
        const next = new Set(current);

        for (const entry of transactions.entries) {
          if (selected) {
            next.add(entry.id);
          } else {
            next.delete(entry.id);
          }
        }

        return next;
      });
      setBulkEditState({ status: "idle" });
    },
    [transactions],
  );

  function clearBulkEditControls(): void {
    setSelectedTransactionIds(new Set());
    setBulkCategoryId("");
    setBulkMerchantName("");
    setBulkReviewState("no-change");
    setBulkEditState({ status: "idle" });
  }

  async function applyBulkEdit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!canApplyBulkEdit) {
      return;
    }

    const ids = selectedTransactions.map((entry) => entry.id);

    setBulkEditState({ status: "saving" });

    try {
      rememberUndo(selectedTransactions);
      const updatedEntries = await updateLedgerTransactionsBulk({
        ids,
        ...(bulkCategoryId === "" ? {} : { categoryId: bulkCategoryId }),
        ...(trimmedBulkMerchantName === ""
          ? {}
          : { merchantName: trimmedBulkMerchantName }),
        ...(bulkReviewState === "no-change"
          ? {}
          : { reviewState: bulkReviewState, reviewedSource: "manual" }),
      });
      applyUpdatedTransactions(updatedEntries);
      setSelectedTransactionIds(new Set());
      setBulkCategoryId("");
      setBulkMerchantName("");
      setBulkReviewState("no-change");
      setBulkEditState({
        status: "saved",
        message: `Updated ${updatedEntries.length} transactions.`,
      });
    } catch (error) {
      setUndoState(undefined);
      setBulkEditState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Bulk transaction edit could not be saved.",
      });
    }
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
          <Label className="flex flex-col gap-1">
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
          </Label>

          <Label className="flex flex-col gap-1">
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
          </Label>

          <Label className="flex flex-col gap-1">
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
          </Label>

          <Label className="flex flex-col gap-1">
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
          </Label>

          <Label className="flex flex-col gap-1">
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
          </Label>

          <Label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Review
            </span>
            <Select
              value={draftFilters.reviewState}
              onValueChange={(value) =>
                setDraftFilters((current) => ({
                  ...current,
                  reviewState:
                    value === "needs_review" ||
                    value === "reviewed" ||
                    value === "ignored"
                      ? value
                      : "all",
                }))
              }
            >
              <SelectTrigger className="w-full" aria-label="Review filter">
                <SelectValue placeholder="All review states" />
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
          </Label>

          <Label className="flex flex-col gap-1">
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
          </Label>

          <Label className="flex flex-col gap-1">
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
          </Label>

          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
            <Label className="flex flex-col gap-1">
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
            </Label>
            <Label className="flex flex-col gap-1">
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
            </Label>
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

        <form
          className="grid gap-3 rounded-md border border-border p-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_180px_auto]"
          onSubmit={(event) => {
            void applyBulkEdit(event);
          }}
        >
          <div className="grid gap-1">
            <p className="text-sm font-medium">
              Bulk edit selected transactions
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedTransactionCount > 0
                ? `${selectedTransactionCount} selected on this page`
                : "Select rows in the table to update category or merchant."}
            </p>
          </div>
          <Label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Category
            </span>
            <Select
              value={bulkCategoryId || "no-change"}
              onValueChange={(value) => {
                setBulkCategoryId(value === "no-change" ? "" : value);
                setBulkEditState({ status: "idle" });
              }}
              disabled={bulkEditState.status === "saving"}
            >
              <SelectTrigger className="w-full" aria-label="Bulk category edit">
                <SelectValue placeholder="No category change" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="no-change">No category change</SelectItem>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Merchant
            </span>
            <Input
              placeholder="Merchant override"
              value={bulkMerchantName}
              disabled={bulkEditState.status === "saving"}
              onChange={(event) => {
                setBulkMerchantName(event.target.value);
                setBulkEditState({ status: "idle" });
              }}
            />
          </Label>
          <Label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Review
            </span>
            <Select
              value={bulkReviewState}
              onValueChange={(value) => {
                setBulkReviewState(
                  value === "needs_review" ||
                    value === "reviewed" ||
                    value === "ignored"
                    ? value
                    : "no-change",
                );
                setBulkEditState({ status: "idle" });
              }}
              disabled={bulkEditState.status === "saving"}
            >
              <SelectTrigger className="w-full" aria-label="Bulk review edit">
                <SelectValue placeholder="No review change" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="no-change">No review change</SelectItem>
                  <SelectItem value="needs_review">Needs review</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="ignored">Ignored</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Label>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={!canApplyBulkEdit}>
              <CheckCheckIcon data-icon="inline-start" />
              {bulkEditState.status === "saving" ? "Saving" : "Apply"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={
                selectedTransactionCount === 0 &&
                !hasBulkEditPayload &&
                bulkEditState.status === "idle"
              }
              onClick={clearBulkEditControls}
            >
              <FilterXIcon data-icon="inline-start" />
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!undoState || bulkEditState.status === "saving"}
              onClick={() => void undoLastTransactionEdit()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              Undo
            </Button>
          </div>
          {bulkEditState.status === "saved" ? (
            <p className="text-xs text-muted-foreground lg:col-span-full">
              {bulkEditState.message}
            </p>
          ) : bulkEditState.status === "error" ? (
            <p className="text-xs text-destructive lg:col-span-full">
              {bulkEditState.message}
            </p>
          ) : undoState ? (
            <p className="text-xs text-muted-foreground lg:col-span-full">
              {undoState.message}
            </p>
          ) : null}
        </form>

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
            onReviewStateChange={updateTransactionReviewState}
            selectedEntryIds={selectedTransactionIds}
            onSelectionChange={setTransactionSelected}
            onSelectVisible={setVisibleTransactionsSelected}
            emptyTitle={
              hasFilters
                ? "No matching transactions"
                : "No local transactions yet"
            }
            emptyDescription={
              hasFilters
                ? "Adjust or reset the filters to review local ledger entries."
                : "Save a Monobank token, then run sync to populate the local SQLite ledger before reviewing transactions."
            }
          />
        )}

        <TransactionDetailDrawer
          entry={selectedTransaction}
          open={selectedTransaction !== undefined}
          categoryOptions={categoryOptions}
          rulePreviewEntries={transactions?.entries ?? []}
          source={snapshot?.config.source}
          syncRuns={snapshot?.syncRuns}
          webhookEvents={snapshot?.webhookEvents}
          onEntryUpdated={handleTransactionUpdated}
          onBeforeLocalEdit={(entry) => rememberUndo([entry])}
          onRuleCreated={onRefresh}
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
          <Pagination className="sm:w-auto sm:justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#transactions"
                  aria-disabled={filters.page <= 1 || loading}
                  tabIndex={filters.page <= 1 || loading ? -1 : undefined}
                  className={
                    filters.page <= 1 || loading
                      ? "pointer-events-none opacity-50"
                      : undefined
                  }
                  onClick={(event) => {
                    event.preventDefault();

                    if (filters.page > 1 && !loading) {
                      setPage(filters.page - 1);
                    }
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <Badge variant="outline">
                  Page {filters.page} of {totalPages}
                </Badge>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#transactions"
                  aria-disabled={filters.page >= totalPages || loading}
                  tabIndex={
                    filters.page >= totalPages || loading ? -1 : undefined
                  }
                  className={
                    filters.page >= totalPages || loading
                      ? "pointer-events-none opacity-50"
                      : undefined
                  }
                  onClick={(event) => {
                    event.preventDefault();

                    if (filters.page < totalPages && !loading) {
                      setPage(filters.page + 1);
                    }
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </CardContent>
    </Card>
  );
}
