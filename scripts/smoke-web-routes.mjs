import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

import { createSessionMonobankTokenStore } from "../dist/security/index.js";
import { createLocalApiServer } from "../dist/server/index.js";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const routes = [
  ["overview", "Money at a glance"],
  ["transactions", "Ledger transactions"],
  ["categories", "Category spending"],
  ["budgets", "Budget progress"],
  ["recurring", "Recurring payments"],
  ["reports", "Local reports"],
  ["rules", "Automation rules"],
  ["sync", "Sync control center"],
  ["accounts", "Connected accounts"],
  ["exports", "Local export flows"],
  ["logs", "Diagnostics timeline"],
  ["settings", "Local workspace settings"],
  ["help", "Local setup help"],
];

const screenshotDir = process.env.SMOKE_WEB_SCREENSHOT_DIR?.trim();

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
    const page = await browser.newPage();
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

      if (screenshotDir) {
        await page.screenshot({
          path: path.join(screenshotDir, `${routeId}.png`),
          fullPage: true,
        });
      }

      console.log(`route smoke ok: ${routeId}`);
    }

    // Drill into the Settings route and confirm the F5 'Copy backup
    // directory' button renders next to the Recent backups section.
    await page.goto(`${baseUrl}/#settings`, { waitUntil: "networkidle" });
    await page.waitForSelector("main");
    await page.locator('[data-testid="backup-copy-directory"]').waitFor();
    console.log("route smoke ok: settings/backup-copy-directory");
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
