import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("documents the v1 distribution, localization, recovery, and support contracts", async () => {
  const [
    distribution,
    localization,
    recovery,
    release,
    accessibility,
    support,
  ] = await Promise.all([
    readFile("docs/decisions/0012-v1-distribution.md", "utf8"),
    readFile("docs/decisions/0013-localization.md", "utf8"),
    readFile("docs/migration-and-recovery.md", "utf8"),
    readFile("docs/v1-release-checklist.md", "utf8"),
    readFile("docs/accessibility.md", "utf8"),
    readFile("docs/support-boundary.md", "utf8"),
  ]);

  assert.match(distribution, /Version 1 ships as an npm CLI/);
  assert.match(distribution, /SHA-256 checksums/);
  assert.match(localization, /English interface copy/);
  assert.match(localization, /Чорна картка/);
  assert.match(recovery, /Recover a stuck sync/);
  assert.match(recovery, /Tokens are not recoverable from the database/);
  assert.match(release, /Explore demo data/);
  assert.match(release, /npm pack --dry-run/);
  assert.match(accessibility, /all 13\s+top-level routes/);
  assert.match(accessibility, /skip link/);
  assert.match(support, /Monobank personal API token/);
  assert.match(support, /Not supported/);
});

test("README ships current fixture-safe UI screenshots and quick start", async () => {
  const readme = await readFile("README.md", "utf8");

  assert.match(readme, /npx mono-ledger-sync/);
  assert.match(readme, /Explore demo data/);
  assert.match(readme, /docs\/assets\/overview\.png/);
  assert.match(readme, /docs\/assets\/transactions\.png/);
  assert.match(readme, /docs\/assets\/exports\.png/);

  for (const file of [
    "docs/assets/overview.png",
    "docs/assets/transactions.png",
    "docs/assets/exports.png",
  ]) {
    const metadata = await stat(file);
    assert.ok(metadata.size > 10_000, `${file} must be a real UI capture`);
  }
});

test("web shell exposes demo separation and keyboard route announcements", async () => {
  const [app, settings, accountRoute] = await Promise.all([
    readFile("src/web/App.tsx", "utf8"),
    readFile("src/web/routes/settings/index.tsx", "utf8"),
    readFile("src/web/routes/accounts/index.tsx", "utf8"),
  ]);

  assert.match(app, /data-testid="demo-data-banner"/);
  assert.match(app, /Skip to main content/);
  assert.match(app, /aria-live="polite"/);
  assert.match(settings, /data-testid="empty-state-explore-demo"/);
  assert.match(accountRoute, /FOP account \/ Рахунок ФОП/);
});
