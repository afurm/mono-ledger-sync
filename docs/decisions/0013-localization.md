# 0013 v1 localization

Date: 2026-06-22

Status: Accepted

## Context

The app is Monobank-specific and primarily serves Ukrainian Monobank users.
Those users must be able to identify bank account types, token setup, local
storage state, and sync status without switching mental context between English
product copy and Ukrainian banking terminology.

## Decision

Version 1 defaults the web UI to Ukrainian interface copy with `uk-UA` locale
formatting for dates, amounts, and relative ages. Shared navigation, app shell,
token status, first-run sign-in, and first-run gated empty states are backed by
typed message catalogs in `src/web/i18n.ts`; the English catalog remains as a
fallback/reference for future locale switching.

Monobank-specific account types continue to include bilingual English/Ukrainian
labels where the upstream API uses English-like identifiers, including `Black
card / Чорна картка` and `FOP account / Рахунок ФОП`.

Route-specific finance workflows can still contain English copy while they are
being extracted. New user-facing UI copy should be added through the typed
catalog when it belongs to shared shell, state, first-run, formatting, or status
surfaces. New route copy must remain easy to extract and must not concatenate
translated sentence fragments.

## Consequences

The default product entry points are Ukrainian, browser language metadata
matches the UI, and shared formatting follows Ukrainian conventions. The support
surface still needs route-by-route review as deeper workflows move into typed
message catalogs.
