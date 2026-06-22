import { useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  CheckCheckIcon,
  CheckCircle2Icon,
  DownloadIcon,
  EyeIcon,
  FileClockIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  SplitIcon,
  StoreIcon,
  TagIcon,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Separator } from "@/components/ui/separator";
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
  restoreLedgerTransactionCategories,
  updateLedgerTransactionsBulk,
} from "../../api";
import type {
  CategoryRule,
  CategoryRuleInput,
  LedgerAccount,
  LedgerEntry,
  LedgerEntryCategoryRestoreEntry,
  LocalAppSnapshot,
} from "../../api-types";
import { formatDateTime, formatMinorAmount } from "../../format";
import {
  type LedgerEntryReviewCandidate,
  findLedgerEntryReviewCandidates,
} from "../../review";
import {
  TransactionCategoryBadge,
  amountSemanticTextClassName,
  transactionCategoryLabel,
} from "../../transaction-cells";

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
      <Label className="text-xs font-medium text-muted-foreground" htmlFor={id}>
        {label}
      </Label>
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
  entry: LedgerEntry | undefined,
): RuleTestSample {
  const transactionType = rule.editor.transactionType;
  const amount =
    entry?.amount ??
    (transactionType === "Income"
      ? 1
      : transactionType === "Transfer"
        ? -1
        : -1);
  const entryMerchant = entry?.merchantName ?? entry?.description;
  const merchantName = firstRuleConstraintTerm(
    rule.editor.merchantContains,
    entryMerchant ?? "No local merchant",
  );
  const description = firstRuleConstraintTerm(
    rule.editor.descriptionContains,
    entry?.description ?? merchantName,
  );

  return {
    merchantName,
    description,
    mcc: rule.editor.mcc === "Not required" ? "N/A" : rule.editor.mcc,
    amount,
    transactionType,
    account: account?.id ?? entry?.accountId ?? rule.editor.account,
    currencyCode: account?.currencyCode ?? entry?.currencyCode ?? 980,
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
            <CheckCircle2Icon className="size-4 text-success" />
          ) : (
            <AlertCircleIcon className="size-4 text-warning" />
          )}
          <span>{check.label}</span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {check.detail}
        </p>
      </div>
      <Badge variant={check.matched ? "success" : "warning"}>
        {check.matched ? "Match" : "Review"}
      </Badge>
    </div>
  );
}

function RuleTestPanel({
  account,
  entry,
  rule,
}: {
  account: LedgerAccount | undefined;
  entry: LedgerEntry | undefined;
  rule: CategoryRuleSummary;
}) {
  const sample = createRuleTestSample(rule, account, entry);
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

type RuleHistoricalRollbackPlan = {
  ruleId: string;
  ruleLabel: string;
  affectedCount: number;
  entries: readonly LedgerEntryCategoryRestoreEntry[];
};

function categoryRestoreEntryFromLedgerEntry(
  entry: LedgerEntry,
): LedgerEntryCategoryRestoreEntry {
  return {
    id: entry.id,
    ...(entry.categoryId ? { categoryId: entry.categoryId } : {}),
    ...(entry.categoryName ? { categoryName: entry.categoryName } : {}),
    ...(entry.categorySource ? { categorySource: entry.categorySource } : {}),
    ...(entry.categoryRuleId ? { categoryRuleId: entry.categoryRuleId } : {}),
    ...(entry.categoryRuleVersion
      ? { categoryRuleVersion: entry.categoryRuleVersion }
      : {}),
  };
}

function transactionCountLabel(count: number): string {
  return count === 1 ? "transaction" : "transactions";
}

function ruleApplyConfirmationMessage(
  rule: CategoryRuleSummary,
  affectedCount: number,
): string {
  return [
    `Apply "${rule.label}" to ${affectedCount} loaded ${transactionCountLabel(
      affectedCount,
    )}?`,
    `This rewrites local category assignments to "${rule.label}". You can roll it back from this panel until you change rules or reload the app.`,
  ].join("\n\n");
}

function ruleRollbackConfirmationMessage(
  plan: RuleHistoricalRollbackPlan,
): string {
  return [
    `Roll back "${plan.ruleLabel}" for ${plan.affectedCount} loaded ${transactionCountLabel(
      plan.affectedCount,
    )}?`,
    "This restores the category IDs, labels, sources, and rule metadata captured before the apply.",
  ].join("\n\n");
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
  const [rollbackState, setRollbackState] = useState<
    "idle" | "rolling-back" | "rolled-back" | "error"
  >("idle");
  const [rollbackPlan, setRollbackPlan] =
    useState<RuleHistoricalRollbackPlan | null>(null);
  const matchedEntries = useMemo(
    () => findRuleHistoricalMatches(entries, rule, rules),
    [entries, rule, rules],
  );
  const mccOnlyPreviewUnavailable = ruleHasMccOnlyHistoryConstraint(rule);
  const previewEntries = matchedEntries.slice(0, 3);
  const applyDisabled =
    applyState === "applying" ||
    rollbackState === "rolling-back" ||
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
    setRollbackState("idle");
    setRollbackPlan(null);
  }, [rule.id]);

  async function applyPreviewedChanges(): Promise<void> {
    if (applyDisabled) {
      return;
    }

    if (
      !window.confirm(ruleApplyConfirmationMessage(rule, matchedEntries.length))
    ) {
      return;
    }

    const nextRollbackPlan: RuleHistoricalRollbackPlan = {
      ruleId: rule.id,
      ruleLabel: rule.label,
      affectedCount: matchedEntries.length,
      entries: matchedEntries.map(categoryRestoreEntryFromLedgerEntry),
    };

    setApplyState("applying");
    setRollbackState("idle");
    setRollbackPlan(null);

    try {
      await updateLedgerTransactionsBulk({
        ids: matchedEntries.map((entry) => entry.id),
        categoryId: rule.categoryId,
      });
      await onApplied();
      setRollbackPlan(nextRollbackPlan);
      setApplyState("applied");
    } catch {
      setApplyState("error");
    }
  }

  async function rollbackPreviewedChanges(): Promise<void> {
    if (rollbackPlan === null || rollbackState === "rolling-back") {
      return;
    }

    if (!window.confirm(ruleRollbackConfirmationMessage(rollbackPlan))) {
      return;
    }

    setRollbackState("rolling-back");

    try {
      await restoreLedgerTransactionCategories(rollbackPlan.entries);
      await onApplied();
      setRollbackPlan(null);
      setApplyState("idle");
      setRollbackState("rolled-back");
    } catch {
      setRollbackState("error");
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
              The matched loaded rows were updated to {rule.label}. Use rollback
              before changing rules or reloading the app if this preview was too
              broad.
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
        {rollbackState === "rolled-back" ? (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>Previewed changes rolled back</AlertTitle>
            <AlertDescription>
              The saved category assignments from before the apply were
              restored.
            </AlertDescription>
          </Alert>
        ) : rollbackState === "error" ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Could not roll back previewed changes</AlertTitle>
            <AlertDescription>
              Refresh the local data and review the affected rows before trying
              again.
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
                  <Badge
                    className={amountSemanticTextClassName(entry.amount)}
                    variant="outline"
                  >
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
        {rollbackPlan !== null && (
          <Button
            disabled={rollbackState === "rolling-back"}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              void rollbackPreviewedChanges();
            }}
          >
            <RefreshCwIcon data-icon="inline-start" />
            {rollbackState === "rolling-back"
              ? "Rolling back"
              : "Roll back apply"}
          </Button>
        )}
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
                  <Badge
                    className={amountSemanticTextClassName(entry.amount)}
                    variant="outline"
                  >
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

export function RulesRoute({
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
  const ruleTestEntry =
    entries.find((entry) => {
      if (selectedRule.editor.transactionType === "Income") {
        return entry.amount > 0;
      }

      if (selectedRule.editor.transactionType === "Expense") {
        return entry.amount < 0;
      }

      return true;
    }) ?? entries[0];
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
                  <Label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="rules-search"
                  >
                    Search rules
                  </Label>
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
                    Rule creation starts from review edits
                  </AlertTitle>
                  <AlertDescription>
                    Change a transaction category or merchant in the
                    Transactions drawer to create or update a matching local
                    categorization rule with a loaded-row preview.
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
              <RuleTestPanel
                account={ruleTestAccount}
                entry={ruleTestEntry}
                rule={selectedRule}
              />
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
