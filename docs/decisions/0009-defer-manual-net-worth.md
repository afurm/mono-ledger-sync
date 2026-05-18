# 0009 Defer manual net worth tracking

Date: 2026-05-17

Status: Accepted

## Context

Manual accounts and manual assets would let users track cash, investments,
liabilities, and other holdings that are not available through the Monobank
personal API. That expands the product from transaction sync into full net worth
tracking.

The current storage and UI work is still stabilizing Monobank accounts, jars,
statement sync, categories, budgets, recurring items, exports, and local privacy
flows. Adding manual holdings now would require new balance histories, valuation
rules, currency conversion rules, edit workflows, and import/export semantics.

## Decision

Manual accounts, manual assets, liabilities, and full net worth tracking are
deferred until Monobank account and jar workflows are stable.

The first production storage model should continue to focus on synced Monobank
accounts, jars, normalized ledger entries, categories, budgets, recurring items,
exports, and privacy controls.

When this scope is revisited, the implementation should start from a dedicated
manual holdings issue that defines:

- account and asset types;
- balance history behavior;
- currency conversion rules;
- edit and deletion semantics;
- import/export behavior;
- privacy expectations for manually entered holdings.

## Consequences

The app can keep the first storage model focused and avoid pretending that net
worth reporting is complete before manual holdings are designed. Overview and
reporting screens should only show net worth trends after manual account and
asset support exists.
