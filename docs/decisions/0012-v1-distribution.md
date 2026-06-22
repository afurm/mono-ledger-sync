# 0012 v1 distribution

Date: 2026-06-22

Status: Accepted

## Context

The local app needs a distribution path that preserves the loopback-only
server, profile-scoped SQLite database, and OS credential-store boundary. A
standalone binary or desktop wrapper would add platform signing, notarization,
auto-update, and native credential-bridge work that is not required to ship the
current product safely.

## Decision

Version 1 ships as an npm CLI for Node.js 20 or newer:

```sh
npx mono-ledger-sync
```

The CLI starts the Fastify app on loopback and serves the bundled Vite UI. npm
package integrity, the lockfile, release tags, and npm provenance are the v1
artifact-verification boundary. The release checklist verifies the package from
a clean npm cache before publishing.

No standalone executable or desktop wrapper is shipped in v1. Therefore there
are no unsigned binary downloads. If a binary is added later, the release must
include per-platform code signing, macOS notarization, SHA-256 checksums, a
documented verification command, and an update-channel threat review before it
can replace the npm CLI.

## Consequences

Users install Node.js themselves, but the project avoids an unmaintained native
shell and keeps one supported runtime. OS token persistence remains implemented
behind the server token-store boundary rather than depending on a desktop host.
