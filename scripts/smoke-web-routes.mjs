import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";
import { messages } from "../dist/web/i18n.js";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const routeIds = [
  "overview",
  "transactions",
  "categories",
  "budgets",
  "recurring",
  "reports",
  "rules",
  "sync",
  "accounts",
  "exports",
  "logs",
  "settings",
  "help",
];

const routes = routeIds.map((routeId) => [
  routeId,
  messages.routes[routeId].title,
]);

const screenshotDir = process.env.SMOKE_WEB_SCREENSHOT_DIR?.trim();
const screenshotRouteIds = new Set(
  (process.env.SMOKE_WEB_SCREENSHOT_ROUTES ?? "")
    .split(",")
    .map((routeId) => routeId.trim())
    .filter(Boolean),
);

function localUrl(server) {
  const url = server.resolvedUrls?.local[0];

  if (!url) {
    throw new Error("Vite did not report a local URL.");
  }

  return url.replace(/\/$/, "");
}

async function main() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mono-ledger-routes-"));
  const api = createLocalApiServer({
    profile: "route-smoke",
    source: "fixture",
    dataDir: tempRoot,
    host: "127.0.0.1",
    port: 0,
    monobankTokenStore: createSessionMonobankTokenStore(),
  });
  let vite;
  let browser;

  try {
    const apiUrl = await api.listen();
    const apiPort = new URL(apiUrl).port;

    process.env.MONO_LEDGER_SYNC_HOST = "127.0.0.1";
    process.env.MONO_LEDGER_SYNC_PORT = apiPort;

    const syncResponse = await api.inject({
      method: "POST",
      url: "/api/sync/run",
    });

    assert.equal(
      syncResponse.statusCode,
      200,
      `fixture sync failed: ${syncResponse.body}`,
    );

    vite = await createViteServer({
      configFile: path.join(rootDir, "vite.config.ts"),
      root: rootDir,
      clearScreen: false,
      logLevel: "error",
      server: {
        host: "127.0.0.1",
        port: 0,
        strictPort: false,
      },
    });
    await vite.listen();

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    const consoleErrors = [];
    const pageErrors = [];
    const missingFavicons = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    page.on("response", (response) => {
      if (
        response.url().includes("/favicon.ico") &&
        response.status() === 404
      ) {
        missingFavicons.push(response.url());
      }
    });

    const baseUrl = localUrl(vite);

    if (screenshotDir) {
      await mkdir(screenshotDir, { recursive: true });
    }

    for (const [routeId, routeTitle] of routes) {
      const consoleErrorCount = consoleErrors.length;
      const pageErrorCount = pageErrors.length;
      const missingFaviconCount = missingFavicons.length;

      await page.goto(`${baseUrl}/#${routeId}`, {
        waitUntil: "networkidle",
      });
      await page.waitForSelector("main");

      const heading = await page.locator("h1").first().textContent();
      assert.equal(heading?.trim(), routeTitle);

      const bodyText = await page.locator("body").innerText();
      assert.ok(bodyText.trim().length > 0, `${routeId} rendered empty body`);

      const overlayCount = await page.locator("vite-error-overlay").count();
      assert.equal(overlayCount, 0, `${routeId} rendered Vite error overlay`);

      const accessibilityViolations = await page.evaluate(() => {
        const visible = (element) => {
          const style = window.getComputedStyle(element);
          return (
            element.getClientRects().length > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
          );
        };
        const name = (element) => {
          const labelledBy = (element.getAttribute("aria-labelledby") ?? "")
            .split(/\s+/)
            .filter(Boolean)
            .map((id) => document.getElementById(id)?.textContent)
            .join(" ");

          return [
            element.getAttribute("aria-label"),
            labelledBy,
            element.closest("label")?.textContent,
            element.getAttribute("title"),
            element.textContent,
          ]
            .filter(Boolean)
            .join(" ")
            .trim();
        };
        const violations = [];

        for (const control of document.querySelectorAll(
          "button, a[href], input, textarea, select",
        )) {
          if (
            !visible(control) ||
            control.getAttribute("aria-hidden") === "true"
          ) {
            continue;
          }

          if (
            control.matches("input, textarea, select") &&
            control.getAttribute("type") !== "hidden"
          ) {
            const hasLabel =
              control.labels?.length > 0 ||
              Boolean(control.getAttribute("aria-label")) ||
              Boolean(control.getAttribute("aria-labelledby"));
            if (!hasLabel) {
              violations.push(`${control.tagName.toLowerCase()} missing label`);
            }
          } else if (!name(control)) {
            violations.push(`${control.tagName.toLowerCase()} missing name`);
          }
        }

        const ids = [...document.querySelectorAll("[id]")].map(
          (element) => element.id,
        );
        for (const id of new Set(ids)) {
          if (ids.filter((value) => value === id).length > 1) {
            violations.push(`duplicate id: ${id}`);
          }
        }

        for (const image of document.querySelectorAll("img")) {
          if (!image.hasAttribute("alt")) {
            violations.push("img missing alt");
          }
        }

        return violations;
      });
      assert.deepEqual(
        accessibilityViolations,
        [],
        `${routeId} has accessibility violations`,
      );

      const faviconStatus = await page.evaluate(async () => {
        const response = await fetch("/favicon.ico", { cache: "no-store" });
        return response.status;
      });
      assert.notEqual(
        faviconStatus,
        404,
        `${routeId} favicon.ico returned 404`,
      );

      assert.deepEqual(
        consoleErrors.slice(consoleErrorCount),
        [],
        `${routeId} logged console errors`,
      );
      assert.deepEqual(
        pageErrors.slice(pageErrorCount),
        [],
        `${routeId} raised page errors`,
      );
      assert.deepEqual(
        missingFavicons.slice(missingFaviconCount),
        [],
        `${routeId} requested a missing favicon`,
      );

      if (
        screenshotDir &&
        (screenshotRouteIds.size === 0 || screenshotRouteIds.has(routeId))
      ) {
        await page.screenshot({
          path: path.join(screenshotDir, `${routeId}.png`),
          fullPage: false,
        });
      }

      console.log(`route smoke ok: ${routeId}`);
    }

    await page.goto(`${baseUrl}/#overview`, { waitUntil: "networkidle" });
    assert.equal(
      await page
        .getByRole("link", { name: messages.shell.skipToMainContent })
        .count(),
      1,
    );
    assert.equal(
      (await page.locator('[aria-live="polite"]').count()) > 0,
      true,
    );
    console.log("route smoke ok: accessibility-navigation");

    // Drill into the Settings route and confirm the F5 'Copy backup
    // directory' button renders next to the Recent backups section.
    await page.goto(`${baseUrl}/#settings`, { waitUntil: "networkidle" });
    await page.waitForSelector("main");
    await page.locator('[data-testid="backup-copy-directory"]').waitFor();
    console.log("route smoke ok: settings/backup-copy-directory");

    // Drill into the Exports route and confirm the G3 extended preview
    // (date range, included columns, excluded sensitive fields) renders
    // for every supported format.
    await page.goto(`${baseUrl}/#exports`, { waitUntil: "networkidle" });
    await page.waitForSelector("main");
    await page.locator('[data-testid="export-preview"]').waitFor();
    await page.locator('[data-testid="export-preview-rows"]').waitFor();
    await page.locator('[data-testid="export-preview-date-range"]').waitFor();
    await page
      .locator('[data-testid="export-preview-included-columns"]')
      .waitFor();
    await page
      .locator('[data-testid="export-preview-excluded-sensitive"]')
      .waitFor();
    console.log("route smoke ok: exports/preview");

    // Drill into the Accounts route and confirm the E5 per-account
    // sync health section (last successful window, failed webhooks 24h,
    // cursor age, next allowed pull) renders in the account drawer.
    await page.goto(`${baseUrl}/#accounts`, { waitUntil: "networkidle" });
    await page.waitForSelector("main");
    // The "Details" button is the trigger; click the first one.
    await page
      .getByRole("button", { name: /^details$/i })
      .first()
      .click();
    await page.locator('[data-testid="account-sync-health"]').waitFor();
    await page
      .locator('[data-testid="account-sync-health-last-successful-window"]')
      .waitFor();
    await page
      .locator('[data-testid="account-sync-health-failed-webhooks-24h"]')
      .waitFor();
    await page
      .locator('[data-testid="account-sync-health-cursor-age"]')
      .waitFor();
    await page
      .locator('[data-testid="account-sync-health-next-allowed-pull"]')
      .waitFor();
    console.log("route smoke ok: accounts/sync-health");

    // Drill into the Accounts route and confirm the E4 jar goal
    // progress details (remaining, latest movement, projected completion)
    // render without console errors.
    await page.goto(`${baseUrl}/#accounts`, { waitUntil: "networkidle" });
    await page.waitForSelector("main");
    await page.locator('[data-testid="jar-card"]').first().waitFor();
    await page.locator('[data-testid="jar-remaining"]').first().waitFor();
    await page.locator('[data-testid="jar-latest-movement"]').first().waitFor();
    await page
      .locator('[data-testid="jar-projected-completion"]')
      .first()
      .waitFor();
    console.log("route smoke ok: accounts/jar-goal-progress");
    // Drill into the Sync route Activity tab and confirm the F4 surface
    // (last-24h summary + grouped cards) renders without console errors.
    await page.goto(`${baseUrl}/#sync`, { waitUntil: "networkidle" });
    await page.waitForSelector("main");
    await page.getByRole("tab", { name: /^activity$/i }).click();
    await page.locator('[data-testid="sync-activity-tab"]').waitFor();
    // After a fixture sync, the activity sources are non-empty so the
    // summary block (not the empty-state) should be visible.
    await page.locator('[data-testid="sync-activity-summary"]').waitFor();
    console.log("route smoke ok: sync/activity-tab");
    // Drill into the Sync route Storage tab and confirm the F3 surface
    // (modified time, copy-path buttons, integrity / migrations / row
    // counts) renders without console errors.
    await page.goto(`${baseUrl}/#sync`, { waitUntil: "networkidle" });
    await page.waitForSelector("main");
    // The default tab is "Runs"; click the Storage tab trigger.
    await page.getByRole("tab", { name: /^storage$/i }).click();
    await page.locator('[data-testid="sync-storage-tab"]').waitFor();
    await page.locator('[data-testid="storage-database-path"]').waitFor();
    await page.locator('[data-testid="storage-copy-database-path"]').waitFor();
    await page.locator('[data-testid="storage-copy-data-directory"]').waitFor();
    await page.locator('[data-testid="storage-database-modified"]').waitFor();
    await page.locator('[data-testid="storage-details"]').waitFor();
    console.log("route smoke ok: sync/storage-tab");
  } finally {
    if (browser) {
      await browser.close();
    }

    if (vite) {
      await vite.close();
    }

    await api.close();
    await rm(tempRoot, { force: true, recursive: true });
  }
}

await main();
