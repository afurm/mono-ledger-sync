# 0013 v1 localization

Date: 2026-06-22

Status: Accepted

## Context

The app is Monobank-specific and Ukrainian users must be able to identify bank
account types, but a partially translated finance UI is harder to review and
support than one complete language.

## Decision

Version 1 ships with English interface copy. Monobank-specific account types
are shown with bilingual English/Ukrainian labels, including `Black card /
Чорна картка` and `FOP account / Рахунок ФОП`.

A full Ukrainian locale is deferred until route copy is extracted into typed
message catalogs, number/date formatting is locale-aware, and the complete
first-run, sync, review, budget, recurring, export, backup, and recovery flows
can be reviewed by a native Ukrainian speaker. New UI copy must remain easy to
extract and must not concatenate translated sentence fragments.

## Consequences

The v1 support surface has one complete UI language while preserving readable
Monobank terminology for Ukrainian users. This decision does not prevent
Ukrainian documentation from landing independently.
