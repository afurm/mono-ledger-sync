import assert from "node:assert/strict";
import test from "node:test";

import { findLedgerEntryReviewCandidates } from "../dist/web/review.js";

function entry(overrides) {
  return {
    id: overrides.id,
    accountId: overrides.accountId ?? "account-uah",
    time: overrides.time,
    description: overrides.description ?? overrides.merchantName,
    amount: overrides.amount,
    currencyCode: 980,
    categoryId: overrides.categoryId ?? "groceries",
    merchantName: overrides.merchantName,
    hold: overrides.hold ?? false,
    tags: overrides.tags,
    rawStatementItemId: overrides.id,
  };
}

test("detects duplicate, transfer, reversal, refund, and needs-review candidates", () => {
  const candidates = findLedgerEntryReviewCandidates([
    entry({
      id: "duplicate-a",
      merchantName: "Fixture Shop",
      amount: -1200,
      time: 1_775_001_600,
    }),
    entry({
      id: "duplicate-b",
      merchantName: "fixture shop",
      amount: -1200,
      time: 1_775_001_600,
    }),
    entry({
      id: "charge",
      merchantName: "Transit App",
      amount: -4500,
      time: 1_775_088_000,
    }),
    entry({
      id: "transfer-out",
      accountId: "account-uah",
      categoryId: "transfers",
      description: "Transfer to savings",
      amount: -50_000,
      time: 1_775_100_000,
    }),
    entry({
      id: "transfer-in",
      accountId: "account-savings",
      categoryId: "transfers",
      description: "Transfer from card",
      amount: 50_000,
      time: 1_775_100_300,
    }),
    entry({
      id: "reversal",
      merchantName: "Transit App",
      amount: 4500,
      time: 1_775_088_900,
    }),
    entry({
      id: "purchase",
      merchantName: "Travel Booking",
      amount: -25_000,
      time: 1_775_174_400,
    }),
    entry({
      id: "refund",
      merchantName: "Travel Booking",
      amount: 10_000,
      time: 1_777_766_400,
    }),
    entry({
      id: "uncategorized",
      merchantName: "Unknown Counterparty",
      categoryId: "uncategorized",
      amount: -3400,
      time: 1_777_800_000,
    }),
    entry({
      id: "hold",
      merchantName: "Pending Hotel",
      amount: -100_000,
      hold: true,
      time: 1_777_900_000,
    }),
    entry({
      id: "reviewed-uncategorized",
      merchantName: "Reviewed Unknown",
      categoryId: "uncategorized",
      amount: -1200,
      tags: ["reviewed"],
      time: 1_777_950_000,
    }),
  ]);

  assert.deepEqual(
    candidates.map((candidate) => candidate.kind),
    [
      "duplicate",
      "reversal",
      "transfer",
      "refund",
      "needs_review",
      "needs_review",
    ],
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.entries.map((item) => item.id)),
    [
      ["duplicate-a", "duplicate-b"],
      ["charge", "reversal"],
      ["transfer-out", "transfer-in"],
      ["purchase", "refund"],
      ["uncategorized"],
      ["hold"],
    ],
  );
  assert.deepEqual(
    candidates
      .filter((candidate) => candidate.kind === "needs_review")
      .map((candidate) => candidate.reason),
    [
      "Uncategorized transaction needs a category review.",
      "Pending hold transaction should be reviewed before month close.",
    ],
  );
});

test("does not mark unrelated same-amount rows as review candidates", () => {
  const candidates = findLedgerEntryReviewCandidates([
    entry({
      id: "first",
      merchantName: "Fixture Shop",
      amount: -1200,
      time: 1_775_001_600,
    }),
    entry({
      id: "second",
      merchantName: "Other Shop",
      amount: 1200,
      time: 1_775_002_000,
    }),
  ]);

  assert.deepEqual(candidates, []);
});
