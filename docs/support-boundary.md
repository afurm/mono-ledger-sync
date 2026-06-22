# v1 support boundary

## Supported

- Clean local installation through the published npm CLI on Node.js 20+.
- One user's own Monobank personal API token and personal-account data.
- Loopback Fastify/Vite runtime, profile-scoped SQLite storage, migrations,
  local fixture demo mode, deterministic sync, review, budgets, recurring
  workflows, exports, backups, restore, and local data deletion.
- Token-store diagnostics and documented session-only fallback when the OS
  credential provider is unavailable.
- Reproducible defects using synthetic fixtures or a redacted support bundle.

## Not supported

- Hosted relays, public servers, shared household/team databases, advisor
  access, or multi-user synchronization.
- Provider/corporate service operation, merchant acquiring, card entry, or PCI
  workflows.
- Multi-bank aggregation, investment tracking, mobile apps, or unofficial
  Monobank scraping.
- Recovery of deleted data or tokens when no user-controlled backup exists.
- Financial, tax, legal, accounting, investment, or regulatory advice.
- Debugging that requires sharing raw tokens, full account identifiers, raw
  statements, or unredacted databases.

Security vulnerabilities follow [SECURITY.md](../SECURITY.md). Product bugs use
the public issue tracker with synthetic reproduction steps and no personal
financial data.
