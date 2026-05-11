# 0004 Local data ownership

Date: 2026-05-11

Status: Accepted

## Context

Users choosing this project should be able to keep banking tokens, transaction history, exports, backups, and reports under their own control. The project should not require a hosted service to perform core personal finance workflows.

## Decision

The local machine is the source of truth for MVP data.

The project will not operate a hosted token relay or hosted financial data store. Tokens should be stored in OS secure storage by default once live sync is implemented. Local databases, generated exports, and backups should remain user-controlled files.

The product must make data location and deletion understandable. Users should be able to find the active local database, choose a data directory, back it up, restore it, export it, and remove local data and credentials.

Logs, diagnostics, docs, issue templates, fixtures, and package contents must avoid exposing tokens, full account identifiers, raw personal statements, or other sensitive financial data.

## Consequences

Local ownership adds responsibility for clear backup and deletion flows. It also keeps the product useful without subscription services or third-party data processors, which is the core product reason to exist.
