import type { LedgerEntry } from "./api.js";

export type LedgerEntryReviewCandidateKind =
  | "duplicate"
  | "needs_review"
  | "transfer"
  | "reversal"
  | "refund";

export interface LedgerEntryReviewCandidate {
  kind: LedgerEntryReviewCandidateKind;
  entries: readonly LedgerEntry[];
  reason: string;
}

const reversalWindowSeconds = 2 * 24 * 60 * 60;
const transferWindowSeconds = 3 * 24 * 60 * 60;
const refundWindowSeconds = 45 * 24 * 60 * 60;

function normalizedCounterparty(entry: LedgerEntry): string {
  return (entry.merchantName ?? entry.description).trim().toLowerCase();
}

function sameCounterparty(left: LedgerEntry, right: LedgerEntry): boolean {
  return normalizedCounterparty(left) === normalizedCounterparty(right);
}

function oppositeAmounts(left: LedgerEntry, right: LedgerEntry): boolean {
  return left.amount !== 0 && left.amount === -right.amount;
}

function transferLike(entry: LedgerEntry): boolean {
  const text = `${entry.categoryId ?? ""} ${entry.merchantName ?? ""} ${
    entry.description
  }`
    .trim()
    .toLowerCase();

  return entry.categoryId === "transfers" || text.includes("transfer");
}

function transferMatch(left: LedgerEntry, right: LedgerEntry): boolean {
  return (
    left.accountId !== right.accountId &&
    left.currencyCode === right.currencyCode &&
    oppositeAmounts(left, right) &&
    transferLike(left) &&
    transferLike(right)
  );
}

function alreadyReviewed(entry: LedgerEntry): boolean {
  return (
    entry.tags?.some((tag) => tag.trim().toLowerCase() === "reviewed") ?? false
  );
}

function needsReview(entry: LedgerEntry): boolean {
  if (alreadyReviewed(entry)) {
    return false;
  }

  return (
    entry.hold === true ||
    !entry.categoryId ||
    entry.categoryId === "uncategorized"
  );
}

function needsReviewReason(entry: LedgerEntry): string {
  if (entry.hold === true) {
    return "Pending hold transaction should be reviewed before month close.";
  }

  return "Uncategorized transaction needs a category review.";
}

function sortedPair(
  left: LedgerEntry,
  right: LedgerEntry,
): readonly LedgerEntry[] {
  return [left, right].sort(
    (a, b) => a.time - b.time || a.id.localeCompare(b.id),
  );
}

export function findLedgerEntryReviewCandidates(
  entries: readonly LedgerEntry[],
): readonly LedgerEntryReviewCandidate[] {
  const candidates: LedgerEntryReviewCandidate[] = [];
  const pairedEntryIds = new Set<string>();
  const duplicateGroups = new Map<string, LedgerEntry[]>();
  const sortedEntries = [...entries].sort(
    (left, right) => left.time - right.time || left.id.localeCompare(right.id),
  );

  for (const entry of sortedEntries) {
    const duplicateKey = `${normalizedCounterparty(entry)}:${entry.amount}:${entry.time}`;
    const group = duplicateGroups.get(duplicateKey) ?? [];

    group.push(entry);
    duplicateGroups.set(duplicateKey, group);
  }

  for (const group of duplicateGroups.values()) {
    if (group.length < 2) {
      continue;
    }

    for (const entry of group) {
      pairedEntryIds.add(entry.id);
    }

    candidates.push({
      kind: "duplicate",
      entries: group,
      reason: "Same merchant, amount, and timestamp.",
    });
  }

  for (let index = 0; index < sortedEntries.length; index += 1) {
    const entry = sortedEntries[index];

    if (!entry || pairedEntryIds.has(entry.id)) {
      continue;
    }

    for (
      let comparisonIndex = index + 1;
      comparisonIndex < sortedEntries.length;
      comparisonIndex += 1
    ) {
      const comparison = sortedEntries[comparisonIndex];

      if (!comparison || pairedEntryIds.has(comparison.id)) {
        continue;
      }

      const secondsBetween = comparison.time - entry.time;

      if (
        secondsBetween <= transferWindowSeconds &&
        transferMatch(entry, comparison)
      ) {
        pairedEntryIds.add(entry.id);
        pairedEntryIds.add(comparison.id);
        candidates.push({
          kind: "transfer",
          entries: sortedPair(entry, comparison),
          reason: "Opposite transfer amounts across two accounts.",
        });
        break;
      }

      if (!sameCounterparty(entry, comparison)) {
        continue;
      }

      if (
        secondsBetween <= reversalWindowSeconds &&
        oppositeAmounts(entry, comparison)
      ) {
        pairedEntryIds.add(entry.id);
        pairedEntryIds.add(comparison.id);
        candidates.push({
          kind: "reversal",
          entries: sortedPair(entry, comparison),
          reason: "Opposite amounts for the same merchant within two days.",
        });
        break;
      }

      if (secondsBetween > refundWindowSeconds) {
        break;
      }

      const isRefund =
        entry.amount < 0 &&
        comparison.amount > 0 &&
        comparison.amount <= Math.abs(entry.amount);

      if (isRefund) {
        pairedEntryIds.add(entry.id);
        pairedEntryIds.add(comparison.id);
        candidates.push({
          kind: "refund",
          entries: sortedPair(entry, comparison),
          reason: "Later positive amount may refund an earlier charge.",
        });
        break;
      }
    }
  }

  for (const entry of sortedEntries) {
    if (!needsReview(entry)) {
      continue;
    }

    candidates.push({
      kind: "needs_review",
      entries: [entry],
      reason: needsReviewReason(entry),
    });
  }

  return candidates;
}
