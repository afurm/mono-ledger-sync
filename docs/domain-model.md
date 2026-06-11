# Domain model

`src/domain/index.ts` is the shared domain contract for the local ledger. It is
kept independent from UI components, Fastify route handlers, process-level
configuration, and direct filesystem behavior.

## Profiles and sources

- `Profile` identifies a local workspace.
- `LedgerSource` identifies the adapter family: `fixture` or `monobank`.

## Monobank source shapes

- `MonobankAccount` represents a personal API account with currency, balance,
  credit limit, type, and optional masked identifiers.
- `MonobankJar` represents a Monobank jar with currency, balance, and goal.
- `MonobankStatementItem` represents a statement row before it is normalized
  into the local ledger.
- `MonobankRawEvent` represents stored raw source or webhook material used for
  replay, diagnostics, and reconciliation.

## Ledger state

- `LedgerAccount` is the normalized local account shape used by storage,
  queries, and the web UI.
- `LedgerEntry` is the normalized local transaction shape, including category,
  merchant, hold status, local notes, tags, split plans, and source reference.
- `SyncCursor` records the last successful statement window per profile,
  account, and source.
- `SyncRun` records lifecycle and summary counters for a sync attempt.

## Finance workflow types

- `Category` defines local category metadata used by sync, rules, filters, and
  exports.
- `CategoryRule` defines the stored rule metadata used to explain and later edit
  category assignment behavior.
- `Merchant` defines normalized local merchant metadata derived from synced
  ledger rows for cleanup rules and filters.
- `Tag` defines normalized local tag metadata derived from user annotations.
- `Budget` defines the planned category-period budget contract before richer
  budget storage and UI are enabled.
- `BudgetPeriod` defines per-period budget tracking rows before monthly close
  and reopen workflows are enabled.
- `BudgetProgress` defines the current budget-period progress row used for
  overspend warnings.
- `ReportCurrencyConversionRate` and `ConvertedReportTotals` define optional
  UAH report totals derived from cached Monobank rates while preserving the
  original-currency report rows and exposing missing conversion rates.
- `MonthlySpendingReport`, `MonthlySpendingCurrencyTotal`,
  `MonthlySpendingCategory`, and `MonthlySpendingMerchant` define a month-scoped
  local spending report with category, merchant, and currency breakdowns.
- `CashflowReport`, `CashflowReportCurrencyTotal`, and `CashflowReportPoint`
  define a local income, expense, and net cashflow report over a bounded monthly
  window.
- `SavingsRateReport`, `SavingsRateReportCurrencyTotal`, and
  `SavingsRateReportPoint` define local savings and savings-rate movement over a
  bounded monthly window.
- `BalanceProjectionReport`, `BalanceProjectionCurrencyTotal`,
  `BalanceProjectionPoint`, and `BalanceProjectionEvent` define projected
  balance movement from current account balances and upcoming recurring
  payments.
- `CategoryTrendReport`, `CategoryTrendReportCategory`, and
  `CategoryTrendReportPoint` define local category spending movement over a
  bounded monthly window.
- `MerchantTrendReport`, `MerchantTrendReportMerchant`, and
  `MerchantTrendReportPoint` define local merchant spending movement over a
  bounded monthly window.
- `NetWorthTrend` defines the feature-gated net worth history response that
  remains disabled until manual accounts and assets exist.
- `RecurringItem` defines a confirmed or user-managed recurring transaction
  schedule before recurring calendars and alerts are enabled.
- `RecurringDetectionCandidate` defines a detected recurring transaction pattern
  derived from local ledger history before the user confirms it as a schedule.
- `RecurringDetectionDecisionAction`, `RecurringDetectionDecision`, and
  `RecurringDetectionDecisionResult` define local confirm/ignore state for
  detected recurring transaction suggestions.
- `RecurringCalendarEvent` defines a projected recurring payment occurrence
  inside a bounded local calendar window.
- `MissedRecurringPayment` defines an active recurring schedule occurrence that
  has no matching posted local ledger entry after its due tolerance window.
- `SubscriptionIncreaseAlert` defines the latest recurring charge that exceeded
  the schedule's expected amount range.
- `UpcomingRecurringPayment` defines the projected recurring payment row used by
  local schedule views.

## Error and activity contracts

- `DomainError` carries a stable error code and category for auth, rate limit,
  validation, network, storage, migration, config, privacy, and internal
  failures. `domainErrorCodeCategories` is the canonical code-to-category map.
- `LocalActivityEvent` is the local event stream contract for sync lifecycle,
  ledger writes, webhook delivery, exports, report refreshes, rule application,
  warnings, and errors.
