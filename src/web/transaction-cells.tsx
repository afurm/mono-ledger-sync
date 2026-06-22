import { memo, type ComponentProps } from "react";
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  BanIcon,
  CheckCheckIcon,
  EyeIcon,
  FileJsonIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  SplitIcon,
  StickyNoteIcon,
  StoreIcon,
  TagIcon,
  TagsIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type {
  LedgerEntry,
  LedgerTransactionSortDirection,
  LedgerTransactionSortField,
} from "./api-types";
import { formatDate, formatMinorAmount } from "./format";

export type TransactionReviewState = "needs_review" | "reviewed" | "ignored";

export function amountSemanticTextClassName(amount: number): string {
  if (amount > 0) {
    return "text-income-foreground";
  }

  if (amount < 0) {
    return "text-expense-foreground";
  }

  return "text-foreground";
}

export function transactionCategoryLabel(entry: LedgerEntry): string {
  return entry.categoryName ?? entry.categoryId ?? "Uncategorized";
}

function transactionCategoryBadgeVariant(
  entry: LedgerEntry,
): ComponentProps<typeof Badge>["variant"] {
  const categoryKey =
    `${entry.categoryId ?? ""} ${entry.categoryName ?? ""}`.toLowerCase();

  if (
    categoryKey.includes("failed") ||
    categoryKey.includes("declined") ||
    categoryKey.includes("rejected")
  ) {
    return "destructive";
  }

  if (categoryKey.includes("cashback") || categoryKey.includes("cash back")) {
    return "cashback";
  }

  if (
    categoryKey.includes("fuel") ||
    categoryKey.includes("gas") ||
    categoryKey.includes("charging")
  ) {
    return "warning";
  }

  if (
    categoryKey.includes("transport") ||
    categoryKey.includes("metro") ||
    categoryKey.includes("taxi")
  ) {
    return "transport";
  }

  if (
    categoryKey.includes("grocery") ||
    categoryKey.includes("groceries") ||
    categoryKey.includes("subscription") ||
    categoryKey.includes("travel") ||
    categoryKey.includes("info")
  ) {
    return "info";
  }

  if (entry.amount > 0 || categoryKey.includes("income")) {
    return "success";
  }

  return "neutral";
}

export function TransactionCategoryBadge({
  entry,
  className = "",
}: {
  entry: LedgerEntry;
  className?: string;
}) {
  return (
    <Badge
      className={className}
      variant={transactionCategoryBadgeVariant(entry)}
    >
      {transactionCategoryLabel(entry)}
    </Badge>
  );
}

export function TransactionTagsCell({
  tags,
}: {
  tags: readonly string[] | undefined;
}) {
  if (!tags || tags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary">
          {tag}
        </Badge>
      ))}
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

function TransactionDateCell({ entry }: { entry: LedgerEntry }) {
  return <TableCell>{formatDate(entry.time)}</TableCell>;
}

function TransactionMerchantCell({ entry }: { entry: LedgerEntry }) {
  return (
    <TableCell className="max-w-[8.5rem] sm:max-w-none">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-medium">
          {entry.merchantName ?? entry.description}
        </span>
        <TransactionCategoryBadge className="w-fit sm:hidden" entry={entry} />
      </div>
    </TableCell>
  );
}

function TransactionCategoryCell({ entry }: { entry: LedgerEntry }) {
  return (
    <TableCell className="hidden sm:table-cell">
      <TransactionCategoryBadge entry={entry} />
    </TableCell>
  );
}

function TransactionAccountCell({ entry }: { entry: LedgerEntry }) {
  return (
    <TableCell className="hidden max-w-44 truncate text-muted-foreground lg:table-cell">
      {entry.accountId}
    </TableCell>
  );
}

function TransactionStatusCell({ entry }: { entry: LedgerEntry }) {
  const reviewBadgeVariant =
    entry.reviewState === "reviewed"
      ? "success"
      : entry.reviewState === "ignored"
        ? "secondary"
        : "warning";
  const reviewLabel =
    entry.reviewState === "reviewed"
      ? "Reviewed"
      : entry.reviewState === "ignored"
        ? "Ignored"
        : "Needs review";

  return (
    <TableCell className="hidden md:table-cell">
      <div className="flex flex-col items-start gap-1">
        <Badge variant={entry.hold ? "secondary" : "outline"}>
          {entry.hold ? "Hold" : "Posted"}
        </Badge>
        <Badge variant={reviewBadgeVariant}>{reviewLabel}</Badge>
      </div>
    </TableCell>
  );
}

function TransactionAmountCell({ entry }: { entry: LedgerEntry }) {
  return (
    <TableCell
      className={`text-right font-medium tabular-nums ${amountSemanticTextClassName(entry.amount)}`}
    >
      {formatMinorAmount(entry.amount, entry.currencyCode)}
    </TableCell>
  );
}

function TransactionSelectionCell({
  entry,
  selected,
  onSelectionChange,
}: {
  entry: LedgerEntry;
  selected: boolean;
  onSelectionChange: (entryId: string, selected: boolean) => void;
}) {
  return (
    <TableCell>
      <Checkbox
        aria-label={`Select transaction ${entry.merchantName ?? entry.description}`}
        checked={selected}
        onCheckedChange={(checked) =>
          onSelectionChange(entry.id, checked === true)
        }
      />
    </TableCell>
  );
}

function TransactionRowActions({
  entry,
  onViewDetails,
  onViewRawPayload,
  onReviewStateChange,
}: {
  entry: LedgerEntry;
  onViewDetails: (entry: LedgerEntry) => void;
  onViewRawPayload?: (entry: LedgerEntry) => void;
  onReviewStateChange?: (
    entry: LedgerEntry,
    reviewState: TransactionReviewState,
  ) => Promise<void>;
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
          {onViewRawPayload !== undefined ? (
            <DropdownMenuItem
              onSelect={() => {
                onViewRawPayload(entry);
              }}
            >
              <FileJsonIcon />
              Show raw payload
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => onViewDetails(entry)}>
            <TagIcon />
            Edit category
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onViewDetails(entry)}>
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
          <DropdownMenuItem
            disabled={onReviewStateChange === undefined}
            onSelect={() => {
              void onReviewStateChange?.(entry, "ignored");
            }}
          >
            <BanIcon />
            Ignore
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              onReviewStateChange === undefined ||
              entry.reviewState === "reviewed"
            }
            onSelect={() => {
              void onReviewStateChange?.(entry, "reviewed");
            }}
          >
            <CheckCheckIcon />
            Mark reviewed
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              onReviewStateChange === undefined ||
              entry.reviewState === "needs_review"
            }
            onSelect={() => {
              void onReviewStateChange?.(entry, "needs_review");
            }}
          >
            <RefreshCwIcon />
            Move to review
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const TransactionTableRow = memo(function TransactionTableRow({
  entry,
  selectionEnabled,
  selected,
  onSelectionChange,
  onViewDetails,
  onViewRawPayload,
  onReviewStateChange,
}: {
  entry: LedgerEntry;
  selectionEnabled: boolean;
  selected: boolean;
  onSelectionChange?:
    | ((entryId: string, selected: boolean) => void)
    | undefined;
  onViewDetails?: ((entry: LedgerEntry) => void) | undefined;
  onViewRawPayload?: ((entry: LedgerEntry) => void) | undefined;
  onReviewStateChange?:
    | ((
        entry: LedgerEntry,
        reviewState: TransactionReviewState,
      ) => Promise<void>)
    | undefined;
}) {
  return (
    <TableRow>
      {selectionEnabled && onSelectionChange ? (
        <TransactionSelectionCell
          entry={entry}
          selected={selected}
          onSelectionChange={onSelectionChange}
        />
      ) : null}
      <TransactionDateCell entry={entry} />
      <TransactionMerchantCell entry={entry} />
      <TransactionCategoryCell entry={entry} />
      <TransactionAccountCell entry={entry} />
      <TransactionStatusCell entry={entry} />
      <TransactionAmountCell entry={entry} />
      {onViewDetails ? (
        <TableCell className="text-right">
          <TransactionRowActions
            entry={entry}
            onViewDetails={onViewDetails}
            {...(onViewRawPayload ? { onViewRawPayload } : {})}
            {...(onReviewStateChange ? { onReviewStateChange } : {})}
          />
        </TableCell>
      ) : null}
    </TableRow>
  );
});

export function TransactionTable({
  entries,
  sortBy,
  sortDirection,
  onSortChange,
  onViewDetails,
  onViewRawPayload,
  onReviewStateChange,
  selectedEntryIds,
  onSelectionChange,
  onSelectVisible,
  emptyTitle = "No local transactions yet",
  emptyDescription = "Save a Monobank token, then run sync to populate the local SQLite ledger before reviewing transactions.",
}: {
  entries: readonly LedgerEntry[];
  sortBy?: LedgerTransactionSortField;
  sortDirection?: LedgerTransactionSortDirection;
  onSortChange?: (field: LedgerTransactionSortField) => void;
  onViewDetails?: (entry: LedgerEntry) => void;
  onViewRawPayload?: (entry: LedgerEntry) => void;
  onReviewStateChange?: (
    entry: LedgerEntry,
    reviewState: TransactionReviewState,
  ) => Promise<void>;
  selectedEntryIds?: ReadonlySet<string>;
  onSelectionChange?: (entryId: string, selected: boolean) => void;
  onSelectVisible?: (selected: boolean) => void;
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

  const selectionEnabled =
    selectedEntryIds !== undefined &&
    onSelectionChange !== undefined &&
    onSelectVisible !== undefined;
  const selectedVisibleCount = selectionEnabled
    ? entries.filter((entry) => selectedEntryIds.has(entry.id)).length
    : 0;
  const visibleSelectionState =
    selectedVisibleCount === 0
      ? false
      : selectedVisibleCount === entries.length
        ? true
        : "indeterminate";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selectionEnabled ? (
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all visible transactions"
                checked={visibleSelectionState}
                onCheckedChange={(checked) => onSelectVisible(checked === true)}
              />
            </TableHead>
          ) : null}
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
          <TransactionTableRow
            entry={entry}
            key={entry.id}
            selectionEnabled={selectionEnabled}
            selected={selectedEntryIds?.has(entry.id) ?? false}
            onViewDetails={onViewDetails}
            onViewRawPayload={onViewRawPayload}
            onReviewStateChange={onReviewStateChange}
            onSelectionChange={onSelectionChange}
          />
        ))}
      </TableBody>
    </Table>
  );
}
