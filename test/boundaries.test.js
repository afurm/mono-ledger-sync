import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { productArchitecture, version } from "mono-ledger-sync/core";
import {
  createLocalApiServer,
  defaultLocalApiHost,
  localApiRoutePrefix,
  localApiServerFramework,
  resolveLocalApiAccessBinding,
  resolveLocalApiHost,
} from "mono-ledger-sync/server";
import {
  appNavigation,
  componentSystem,
  themeTokens,
  uiFramework,
} from "mono-ledger-sync/ui";

const webUiSourceRoots = ["src/web", "src/components", "src/hooks", "src/lib"];
const webUiSourceExtensions = new Set([".ts", ".tsx"]);
const disallowedComponentPackageNames = new Set([
  "@headlessui/react",
  "antd",
  "bootstrap",
  "daisyui",
  "evergreen-ui",
  "flowbite",
  "flowbite-react",
  "grommet",
  "primereact",
  "react-aria-components",
  "react-bootstrap",
  "reactstrap",
  "rsuite",
  "semantic-ui-react",
]);
const disallowedComponentPackagePrefixes = [
  "@chakra-ui/",
  "@mantine/",
  "@mui/",
  "@nextui-org/",
  "@heroui/",
];
const disallowedIconPackageNames = new Set([
  "@heroicons/react",
  "@phosphor-icons/react",
  "@tabler/icons-react",
  "iconoir-react",
  "phosphor-react",
  "react-feather",
  "react-icons",
  "tabler-icons-react",
]);
const disallowedIconPackagePrefixes = ["@fortawesome/"];
const shadcnImplementationPackageNames = new Set([
  "class-variance-authority",
  "clsx",
  "radix-ui",
  "tailwind-merge",
]);
const shadcnImplementationPackagePrefixes = ["@radix-ui/"];
const rawPaletteUtilityPattern =
  /\b(?:bg|text|border|ring|from|to|via)-(?:red|blue|green|yellow|purple|orange|pink|slate|gray|zinc|neutral|stone|amber|emerald|teal|cyan|sky|indigo|violet|fuchsia|rose)-[0-9]{2,3}\b/;
const arbitraryVisualUtilityPattern =
  /\b(?:rounded|text|tracking|leading|font)-\[[^\]]+\]/;

async function readJson(pathname) {
  return JSON.parse(await readFile(pathname, "utf8"));
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return collectSourceFiles(entryPath);
      }

      return webUiSourceExtensions.has(path.extname(entry.name))
        ? [entryPath]
        : [];
    }),
  );

  return files.flat();
}

function extractImportSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function isDisallowedComponentPackage(packageName) {
  return (
    disallowedComponentPackageNames.has(packageName) ||
    disallowedComponentPackagePrefixes.some((prefix) =>
      packageName.startsWith(prefix),
    )
  );
}

function isShadcnImplementationPackage(packageName) {
  return (
    shadcnImplementationPackageNames.has(packageName) ||
    shadcnImplementationPackagePrefixes.some((prefix) =>
      packageName.startsWith(prefix),
    )
  );
}

function isDisallowedIconPackage(packageName) {
  return (
    disallowedIconPackageNames.has(packageName) ||
    disallowedIconPackagePrefixes.some((prefix) =>
      packageName.startsWith(prefix),
    )
  );
}

function importPackageName(specifier) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("@/") ||
    specifier.startsWith("node:")
  ) {
    return undefined;
  }

  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");

    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }

  return specifier.split("/")[0];
}

test("exposes the product architecture without loading extra entrypoints", () => {
  assert.deepEqual(productArchitecture, {
    ui: "vite",
    server: "fastify",
    storage: "sqlite",
  });
});

test("defines the local API and UI boundaries", () => {
  assert.equal(localApiServerFramework, "fastify");
  assert.equal(localApiRoutePrefix, "/api");
  assert.equal(uiFramework, "vite");
  assert.equal(componentSystem, "shadcn/ui");
  assert.equal(themeTokens.primary, "#05962f");
  assert.deepEqual(appNavigation.slice(0, 4), [
    "overview",
    "transactions",
    "rules-and-mappings",
    "sync-and-webhooks",
  ]);
});

test("keeps shadcn as the only web component system", async () => {
  const packageJson = await readJson("package.json");
  const componentsJson = await readJson("components.json");
  const dependencyNames = Object.keys({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  }).sort();

  assert.equal(componentSystem, "shadcn/ui");
  assert.equal(componentsJson.$schema, "https://ui.shadcn.com/schema.json");
  assert.equal(componentsJson.aliases.ui, "@/components/ui");
  assert.equal(componentsJson.aliases.components, "@/components");
  assert.equal(componentsJson.iconLibrary, "lucide");
  assert.deepEqual(dependencyNames.filter(isDisallowedComponentPackage), []);

  const sourceFiles = (
    await Promise.all(webUiSourceRoots.map(collectSourceFiles))
  )
    .flat()
    .sort();
  const importViolations = [];

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8");

    for (const specifier of extractImportSpecifiers(source)) {
      const packageName = importPackageName(specifier);

      if (
        packageName !== undefined &&
        isDisallowedComponentPackage(packageName)
      ) {
        importViolations.push(`${sourceFile}: ${specifier}`);
      }
    }
  }

  assert.deepEqual(importViolations, []);
});

test("keeps web icons on the configured shadcn icon library", async () => {
  const packageJson = await readJson("package.json");
  const componentsJson = await readJson("components.json");
  const dependencyNames = Object.keys({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  }).sort();
  const appSource = await readFile("src/web/App.tsx", "utf8");
  const navigationSource = await readFile("src/web/navigation.ts", "utf8");
  const sourceFiles = (
    await Promise.all(webUiSourceRoots.map(collectSourceFiles))
  )
    .flat()
    .sort();
  const iconPackageViolations = [];
  const svgViolations = [];

  assert.equal(componentsJson.iconLibrary, "lucide");
  assert.ok(dependencyNames.includes("lucide-react"));
  assert.deepEqual(dependencyNames.filter(isDisallowedIconPackage), []);
  assert.match(appSource, /from "lucide-react"/);
  assert.match(navigationSource, /from "lucide-react"/);

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8");

    if (/<svg\b/i.test(source)) {
      svgViolations.push(`${sourceFile}: inline svg`);
    }

    for (const specifier of extractImportSpecifiers(source)) {
      const packageName = importPackageName(specifier);

      if (
        (packageName !== undefined && isDisallowedIconPackage(packageName)) ||
        /\.svg(?:\?|$)/.test(specifier)
      ) {
        iconPackageViolations.push(`${sourceFile}: ${specifier}`);
      }
    }
  }

  assert.deepEqual(iconPackageViolations, []);
  assert.deepEqual(svgViolations, []);
});

test("keeps web screens composed through shadcn primitives", async () => {
  const sourceFiles = (await collectSourceFiles("src/web")).sort();
  const primitiveImportViolations = [];

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8");

    for (const specifier of extractImportSpecifiers(source)) {
      const packageName = importPackageName(specifier);

      if (
        packageName !== undefined &&
        isShadcnImplementationPackage(packageName)
      ) {
        primitiveImportViolations.push(`${sourceFile}: ${specifier}`);
      }
    }
  }

  assert.deepEqual(primitiveImportViolations, []);
});

test("documents shadcn registry checks before new UI components", async () => {
  const contributing = await readFile("CONTRIBUTING.md", "utf8");
  const pullRequestTemplate = await readFile(
    ".github/PULL_REQUEST_TEMPLATE.md",
    "utf8",
  );

  assert.match(contributing, /shadcn\/ui registry/);
  assert.match(contributing, /src\/components\/ui/);
  assert.match(contributing, /before creating a new component/);
  assert.match(pullRequestTemplate, /shadcn\/ui registry/);
  assert.match(pullRequestTemplate, /src\/components\/ui/);
});

test("documents thin local UI component wrappers", async () => {
  const contributing = await readFile("CONTRIBUTING.md", "utf8");
  const pullRequestTemplate = await readFile(
    ".github/PULL_REQUEST_TEMPLATE.md",
    "utf8",
  );
  const thinWrapperPattern =
    /thin feature wrappers around shadcn primitives, data loading, and event handlers/;

  assert.match(contributing, thinWrapperPattern);
  assert.match(pullRequestTemplate, thinWrapperPattern);
});

test("keeps standard visual controls on shadcn primitives", async () => {
  const appSource = await readFile("src/web/App.tsx", "utf8");
  const requiredCompositionImports = [
    /from "@\/components\/ui\/card"/,
    /from "@\/components\/ui\/dropdown-menu"/,
    /from "@\/components\/ui\/input"/,
    /from "@\/components\/ui\/label"/,
    /from "@\/components\/ui\/select"/,
    /from "@\/components\/ui\/sheet"/,
    /from "@\/components\/ui\/sidebar"/,
    /from "@\/components\/ui\/table"/,
    /from "@\/components\/ui\/tabs"/,
    /from "@\/components\/ui\/textarea"/,
  ];

  assert.match(appSource, /from "@\/components\/ui\/checkbox"/);
  assert.match(appSource, /from "@\/components\/ui\/textarea"/);
  for (const importPattern of requiredCompositionImports) {
    assert.match(appSource, importPattern);
  }
  assert.doesNotMatch(appSource, /<button\b/);
  assert.doesNotMatch(appSource, /<label\b/);
  assert.doesNotMatch(appSource, /<select\b/);
  assert.doesNotMatch(appSource, /<table\b/);
  assert.doesNotMatch(appSource, /<textarea\b/);
  assert.doesNotMatch(appSource, /type="checkbox"/);
});

test("keeps screen colors on semantic tokens", async () => {
  const appSource = await readFile("src/web/App.tsx", "utf8");
  const stylesSource = await readFile("src/web/styles.css", "utf8");
  const alertSource = await readFile("src/components/ui/alert.tsx", "utf8");
  const badgeSource = await readFile("src/components/ui/badge.tsx", "utf8");
  const buttonSource = await readFile("src/components/ui/button.tsx", "utf8");
  const requiredScreenTokenPatterns = [
    /\bbg-background(?:\b|\/)/,
    /\btext-muted-foreground\b/,
    /\bborder-border\b/,
    /\bbg-primary(?:\b|\/)/,
    /\btext-primary-foreground\b/,
  ];

  assert.doesNotMatch(appSource, rawPaletteUtilityPattern);
  assert.doesNotMatch(appSource, arbitraryVisualUtilityPattern);
  for (const tokenPattern of requiredScreenTokenPatterns) {
    assert.match(appSource, tokenPattern);
  }
  assert.match(stylesSource, /@apply border-border/);
  assert.match(stylesSource, /@apply bg-background text-foreground/);
  assert.match(stylesSource, /--color-success:/);
  assert.match(stylesSource, /--color-warning:/);
  assert.match(stylesSource, /--color-info:/);
  assert.match(buttonSource, /bg-primary text-primary-foreground/);
  assert.match(alertSource, /warning:/);
  assert.match(alertSource, /info:/);
  assert.match(badgeSource, /success:/);
  assert.match(badgeSource, /cashback:/);
  assert.match(badgeSource, /transport:/);
});

test("documents the minimum local product flow", async () => {
  const workflow = await readFile(
    "examples/sample-workflows/minimum-product-flow.md",
    "utf8",
  );
  const readme = await readFile("README.md", "utf8");

  assert.match(workflow, /## 1\. Install and start the local app/);
  assert.match(
    workflow,
    /## 2\. Add a Monobank token when live sync is needed/,
  );
  assert.match(workflow, /## 3\. Sync accounts and statements/);
  assert.match(workflow, /## 4\. Review transactions/);
  assert.match(workflow, /## 5\. Categorize spending/);
  assert.match(workflow, /## 6\. Export local data/);
  assert.match(readme, /minimum local product flow/);
});

test("documents the shared domain model contract", async () => {
  const domainSource = await readFile("src/domain/index.ts", "utf8");
  const domainDoc = await readFile("docs/domain-model.md", "utf8");
  const readme = await readFile("README.md", "utf8");
  const typeNames = [
    "Profile",
    "LedgerSource",
    "MonobankAccount",
    "MonobankJar",
    "MonobankStatementItem",
    "MonobankRawEvent",
    "LedgerAccount",
    "LedgerEntry",
    "SyncCursor",
    "SyncRun",
    "Category",
    "Budget",
    "BudgetProgress",
    "ReportCurrencyConversionRate",
    "ConvertedReportTotals",
    "CashflowReportPoint",
    "CashflowReportCurrencyTotal",
    "CashflowReport",
    "SavingsRateReportPoint",
    "SavingsRateReportCurrencyTotal",
    "SavingsRateReport",
    "BalanceProjectionPoint",
    "BalanceProjectionCurrencyTotal",
    "BalanceProjectionEvent",
    "BalanceProjectionReport",
    "CategoryTrendReportPoint",
    "CategoryTrendReportCategory",
    "CategoryTrendReport",
    "MerchantTrendReportPoint",
    "MerchantTrendReportMerchant",
    "MerchantTrendReport",
    "MonthlySpendingCurrencyTotal",
    "MonthlySpendingCategory",
    "MonthlySpendingMerchant",
    "MonthlySpendingReport",
    "NetWorthTrend",
    "RecurringItem",
    "RecurringDetectionCandidate",
    "RecurringDetectionDecisionAction",
    "RecurringDetectionDecision",
    "RecurringDetectionDecisionResult",
    "RecurringCalendarEvent",
    "MissedRecurringPayment",
    "SubscriptionIncreaseAlert",
    "UpcomingRecurringPayment",
    "DomainError",
    "LocalActivityEvent",
  ];

  for (const typeName of typeNames) {
    assert.match(
      domainSource,
      new RegExp(`export (interface|class|type) ${typeName}\\b`),
    );
    assert.match(domainDoc, new RegExp(`\\b${typeName}\\b`));
  }

  assert.match(readme, /docs\/domain-model\.md/);
});

test("documents secure token storage boundaries", async () => {
  const decision = await readFile(
    "docs/decisions/0008-secure-token-storage.md",
    "utf8",
  );
  const readme = await readFile("README.md", "utf8");

  assert.match(decision, /macOS: Keychain Services/);
  assert.match(decision, /Windows: Credential Manager/);
  assert.match(decision, /Linux: Secret Service/);
  assert.match(decision, /CI and tests: no persistent provider by default/);
  assert.match(decision, /SQLite remains out of scope for token persistence/);
  assert.match(decision, /session-only token handling/);
  assert.match(readme, /0008-secure-token-storage\.md/);
});

test("documents safe local webhook exposure", async () => {
  const localFirstDoc = await readFile("docs/local-first.md", "utf8");
  const readme = await readFile("README.md", "utf8");

  assert.match(readme, /temporary HTTPS tunnel/);
  assert.match(readme, /exact high-entropy `webhook\.path`/);
  assert.match(readme, /statement pulls before/);
  assert.match(localFirstDoc, /Local webhook exposure/);
  assert.match(localFirstDoc, /temporary HTTPS tunnel/);
  assert.match(localFirstDoc, /never place tokens in\s+webhook URLs/);
});

test("documents token cleanup during local account removal", async () => {
  const localFirstDoc = await readFile("docs/local-first.md", "utf8");

  assert.match(localFirstDoc, /Removing local account data/);
  assert.match(localFirstDoc, /DELETE `?\/api\/app\/token`?/);
  assert.match(localFirstDoc, /Token deletion is profile-scoped/);
});

test("local web UI exposes webhook settings panel fields", async () => {
  const appSource = await readFile("src/web/App.tsx", "utf8");

  assert.match(appSource, /function WebhookSettingsPanel/);
  assert.match(appSource, /Profile/);
  assert.match(appSource, /Port/);
  assert.match(appSource, /Path/);
  assert.match(appSource, /Enabled/);
  assert.match(appSource, /Webhook endpoint/);
  assert.match(appSource, /Personal webhook payloads are hints/);
  assert.match(appSource, /verifiable personal webhook signature/);
  assert.match(appSource, /reconcile it through statement\s+pulls/);
});

test("local web UI exposes a privacy onboarding screen", async () => {
  const appSource = await readFile("src/web/App.tsx", "utf8");

  assert.match(appSource, /function PrivacyOnboardingCard/);
  assert.match(appSource, /Privacy-first local setup/);
  assert.match(appSource, /No cloud account required/);
  assert.match(appSource, /no hosted token relay/);
  assert.match(appSource, /Review privacy settings/);
});

test("rules UI keeps current rule previews and conflicts aligned", async () => {
  const appSource = await readFile("src/web/App.tsx", "utf8");

  assert.match(appSource, /matchType: CategoryRuleSummary\["matchType"\]/);
  assert.match(appSource, /function findRuleHistoricalMatches/);
  assert.match(appSource, /updateLedgerTransactionsBulk/);
  assert.match(appSource, /restoreLedgerTransactionCategories/);
  assert.match(appSource, /function applyPreviewedChanges/);
  assert.match(appSource, /function rollbackPreviewedChanges/);
  assert.match(appSource, /ruleApplyConfirmationMessage/);
  assert.match(appSource, /ruleRollbackConfirmationMessage/);
  assert.match(appSource, /Roll back apply/);
  assert.match(appSource, /categoryId: rule\.categoryId/);
  assert.match(appSource, /Preview before applying/);
  assert.match(appSource, /categoryRestoreEntryFromLedgerEntry/);
  assert.match(appSource, /rule\.matchType !== "fallback"/);
  assert.match(appSource, /function ruleHasMccOnlyHistoryConstraint/);
  assert.match(appSource, /MCC-only preview unavailable/);
  assert.match(appSource, /income amount/);
  assert.match(appSource, /normalizedValue === "any merchant"/);
  assert.doesNotMatch(appSource, /normalizedValue\.startsWith\("any"\)/);
  assert.match(appSource, /const merchantText = entry\.merchantName \?\? ""/);
  assert.doesNotMatch(
    appSource,
    /const merchantText = `\$\{entry\.merchantName \?\? ""\} \$\{entry\.description\}`/,
  );
  assert.match(
    appSource,
    /function findRuleConflicts\(\s*entries:[\s\S]*rules:/,
  );
  assert.match(appSource, /entry\.categorySource === "manual"/);
  assert.match(appSource, /entry\.categorySource === "user_rule"/);
  assert.match(appSource, /entry\.categorySource === "system_rule"/);
  assert.match(appSource, /entry\.categoryRuleVersion/);
  assert.match(appSource, /findRuleConflicts\(entries, rules\)/);
  assert.match(appSource, /rules=\{categoryRuleSummaries\}/);
  assert.doesNotMatch(
    appSource,
    /builtInRuleSummaries\.filter\(\(rule\) =>\s*ledgerEntryMatchesRule/,
  );
  assert.doesNotMatch(appSource, /historical apply controls stay disabled/);
});

test("web client caches local snapshots for offline browsing", async () => {
  const apiSource = await readFile("src/web/api.ts", "utf8");
  const appSource = await readFile("src/web/App.tsx", "utf8");
  const navigationSource = await readFile("src/web/navigation.ts", "utf8");

  assert.match(apiSource, /LOCAL_APP_SNAPSHOT_CACHE_PREFIX/);
  assert.match(apiSource, /LOCAL_APP_ACTIVE_SNAPSHOT_CACHE_KEY/);
  assert.match(apiSource, /function snapshotCacheKey/);
  assert.match(apiSource, /encodeURIComponent\(\s*profile,/);
  assert.match(apiSource, /encodeURIComponent\(databasePath\)/);
  assert.match(apiSource, /readCachedActiveSnapshotKey/);
  assert.match(apiSource, /writeCachedLocalAppSnapshot/);
  assert.match(apiSource, /readCachedLocalAppSnapshot/);
  assert.match(apiSource, /normalizeCachedLocalAppSnapshot/);
  assert.match(apiSource, /jars: snapshot\.jars \?\? \[\]/);
  assert.match(
    apiSource,
    /categorySpending: snapshot\.categorySpending \?\? \[\]/,
  );
  assert.match(apiSource, /budgetProgress: snapshot\.budgetProgress \?\? \[\]/);
  assert.match(
    apiSource,
    /savingsGoalProgress: snapshot\.savingsGoalProgress \?\? \[\]/,
  );
  assert.match(apiSource, /netWorthTrend: snapshot\.netWorthTrend \?\?/);
  assert.match(
    apiSource,
    /upcomingRecurringPayments: snapshot\.upcomingRecurringPayments \?\? \[\]/,
  );
  assert.match(
    apiSource,
    /missedRecurringPayments: snapshot\.missedRecurringPayments \?\? \[\]/,
  );
  assert.match(
    apiSource,
    /subscriptionIncreaseAlerts: snapshot\.subscriptionIncreaseAlerts \?\? \[\]/,
  );
  assert.match(
    apiSource,
    /monthlySpendingReport:\s*snapshot\.monthlySpendingReport \?\?/,
  );
  assert.match(apiSource, /cashflowReport:\s*snapshot\.cashflowReport \?\?/);
  assert.match(
    apiSource,
    /savingsRateReport:\s*snapshot\.savingsRateReport \?\?/,
  );
  assert.match(
    apiSource,
    /balanceProjectionReport:\s*snapshot\.balanceProjectionReport \?\?/,
  );
  assert.match(
    apiSource,
    /categoryTrendReport:\s*snapshot\.categoryTrendReport \?\?/,
  );
  assert.match(
    apiSource,
    /merchantTrendReport:\s*snapshot\.merchantTrendReport \?\?/,
  );
  assert.match(
    apiSource,
    /recurringDetectionCandidates: snapshot\.recurringDetectionCandidates \?\? \[\]/,
  );
  assert.match(
    apiSource,
    /recurringCalendar: snapshot\.recurringCalendar \?\? \[\]/,
  );
  assert.match(apiSource, /confirmRecurringDetection/);
  assert.match(apiSource, /ignoreRecurringDetection/);
  assert.match(apiSource, /loadMonthlySpendingReport/);
  assert.match(apiSource, /loadCashflowReport/);
  assert.match(apiSource, /loadSavingsRateReport/);
  assert.match(apiSource, /loadBalanceProjectionReport/);
  assert.match(apiSource, /loadCategoryTrendReport/);
  assert.match(apiSource, /loadMerchantTrendReport/);
  assert.match(apiSource, /convertedTotals\?: ConvertedReportTotals/);
  assert.match(apiSource, /snapshot\.summary\.monthToDate \?\?/);
  assert.match(apiSource, /try \{\s*return \(globalThis as/);
  assert.match(apiSource, /LOCAL_APP_TRANSACTION_LIMIT = 25/);
  assert.doesNotMatch(apiSource, /LEDGER_TRANSACTION_CACHE_PREFIX/);
  assert.match(apiSource, /offline: \{/);
  assert.match(appSource, /OVERVIEW_TRANSACTION_LIMIT = 8/);
  assert.match(appSource, /canUseSnapshotTransactionFallback/);
  assert.match(appSource, /snapshotTransactionFallbackPage/);
  assert.match(appSource, /total: snapshot\.transactions\.entries\.length/);
  assert.match(appSource, /Browsing last local snapshot/);
  assert.match(appSource, /snapshot\?\.offline\?\.reason/);
  assert.match(appSource, /MTD net cashflow/);
  assert.match(appSource, /Budget progress/);
  assert.match(appSource, /Net worth trend/);
  assert.match(appSource, /Cashflow report/);
  assert.match(appSource, /Savings rate report/);
  assert.match(appSource, /Balance projection/);
  assert.match(appSource, /Category trend report/);
  assert.match(appSource, /Merchant trend report/);
  assert.match(appSource, /convertedReportTotalLabel/);
  assert.match(appSource, /Monthly spending report/);
  assert.match(navigationSource, /id: "categories"/);
  assert.match(navigationSource, /id: "budgets"/);
  assert.match(navigationSource, /id: "recurring"/);
  assert.match(navigationSource, /id: "reports"/);
  assert.match(appSource, /function CategoriesRoute/);
  assert.match(appSource, /function BudgetsRoute/);
  assert.match(appSource, /function RecurringRoute/);
  assert.match(appSource, /function ReportsRoute/);
  assert.match(appSource, /function ExportsRoute/);
  assert.match(appSource, /case "exports":\s*return <ExportsRoute/);
  assert.match(appSource, /Spending by category/);
  assert.match(appSource, /Missed recurring payments/);
  assert.match(appSource, /Subscription increase alerts/);
  assert.match(appSource, /Recurring suggestions/);
  assert.match(appSource, /Upcoming recurring payments/);
  assert.match(appSource, /Recurring calendar/);
});

test("serves local API health through Fastify", async () => {
  const server = createLocalApiServer();

  try {
    const response = await server.inject({
      method: "GET",
      url: "/api/health",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      status: "ok",
      localOnly: true,
      version,
      framework: "fastify",
      apiPrefix: "/api",
      architecture: productArchitecture,
    });
  } finally {
    await server.close();
  }
});

test("local API binding defaults to loopback and rejects public hosts", async () => {
  assert.equal(defaultLocalApiHost, "127.0.0.1");
  assert.equal(resolveLocalApiHost(undefined), "127.0.0.1");
  assert.equal(resolveLocalApiHost(" localhost "), "localhost");
  assert.deepEqual(resolveLocalApiAccessBinding(), {
    localOnly: true,
    host: "127.0.0.1",
    authentication: "none",
  });
  assert.throws(
    () => resolveLocalApiHost("0.0.0.0"),
    /Local API host must be 127\.0\.0\.1 or localhost/,
  );
  assert.throws(
    () => createLocalApiServer({ host: "0.0.0.0" }),
    /External Local API binding requires/,
  );
  assert.deepEqual(
    resolveLocalApiAccessBinding({
      host: "0.0.0.0",
      accessPasscode: "test-passcode",
    }),
    {
      localOnly: false,
      host: "0.0.0.0",
      authentication: "passcode",
    },
  );

  const server = createLocalApiServer({
    port: 0,
  });

  try {
    const url = await server.listen();

    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);

    const response = await server.inject({
      method: "GET",
      url: "/api/app/config",
    });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.deepEqual(body.access, {
      localOnly: true,
      host: "127.0.0.1",
      authentication: "none",
    });
    assert.equal(body.webhook.host, "127.0.0.1");
  } finally {
    await server.close();
  }
});

test("external local API binding requires passcode access", async () => {
  const passcode = "test-passcode";
  const authorization = `Basic ${Buffer.from(`local:${passcode}`).toString(
    "base64",
  )}`;
  const server = createLocalApiServer({
    host: "0.0.0.0",
    accessPasscode: passcode,
    profile: "demo",
    source: "fixture",
  });

  try {
    const blocked = await server.inject({
      method: "GET",
      url: "/api/app/config",
    });

    assert.equal(blocked.statusCode, 401);
    assert.equal(blocked.json().error, "access_auth_required");
    assert.match(String(blocked.headers["www-authenticate"]), /Basic realm/);

    const configResponse = await server.inject({
      method: "GET",
      url: "/api/app/config",
      headers: { authorization },
    });
    const config = configResponse.json();

    assert.equal(configResponse.statusCode, 200);
    assert.deepEqual(config.access, {
      localOnly: false,
      host: "0.0.0.0",
      authentication: "passcode",
    });

    const headerConfigResponse = await server.inject({
      method: "GET",
      url: "/api/app/config",
      headers: { "x-mono-ledger-sync-passcode": passcode },
    });

    assert.equal(headerConfigResponse.statusCode, 200);

    const webhookResponse = await server.inject({
      method: "POST",
      url: config.webhook.path,
      body: {},
    });

    assert.notEqual(webhookResponse.statusCode, 401);
  } finally {
    await server.close();
  }
});

test("exposes local webhook settings in app config", async () => {
  const server = createLocalApiServer({
    profile: "demo",
    source: "fixture",
    host: "127.0.0.1",
    port: 55443,
  });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/api/app/config",
    });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.deepEqual(body.access, {
      localOnly: true,
      host: "127.0.0.1",
      authentication: "none",
    });
    assert.equal(body.webhook.enabled, true);
    assert.match(body.webhook.path, /^\/api\/webhooks\/monobank-[a-f0-9]{32}$/);
    assert.equal(body.webhook.host, "127.0.0.1");
    assert.equal(body.webhook.port, 55443);
    assert.equal(
      body.webhook.url,
      `http://127.0.0.1:55443${body.webhook.path}`,
    );
  } finally {
    await server.close();
  }
});

test("serves the built local web UI when available", async () => {
  const server = createLocalApiServer({
    profile: "demo",
    source: "fixture",
  });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/",
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /^<!doctype html>/);
    assert.match(response.body, /mono-ledger-sync/);
    assert.match(response.body, /id="root"/);
    assert.match(response.body, /\/assets\//);
  } finally {
    await server.close();
  }
});

test("serves bundled fixture summary through the local API", async () => {
  const server = createLocalApiServer({
    profile: "demo",
    source: "fixture",
  });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/api/fixtures/summary",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      source: "fixture",
      profile: "demo",
      accounts: 2,
      jars: 1,
      currencyRates: 3,
      statementAccounts: 3,
      statementItems: 7,
      webhookEvents: 1,
      errorStates: 3,
    });
  } finally {
    await server.close();
  }
});

test("serves bundled fixture client info through the local API", async () => {
  const server = createLocalApiServer({
    profile: "demo",
    source: "fixture",
  });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/api/fixtures/client-info",
    });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.equal(body.source, "fixture");
    assert.equal(body.profile, "demo");
    assert.equal(body.clientInfo.clientId, "fixture-client-primary");
    assert.equal(body.clientInfo.accounts.length, 2);
  } finally {
    await server.close();
  }
});

test("serves bundled fixture statements through the local API", async () => {
  const server = createLocalApiServer({
    profile: "demo",
    source: "fixture",
  });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/api/fixtures/statements",
    });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.equal(body.source, "fixture");
    assert.equal(body.profile, "demo");
    assert.equal(body.totalItems, 7);
    assert.deepEqual(
      body.accounts.map((account) => account.accountId),
      [
        "fixture-account-uah-main",
        "fixture-account-eur-savings",
        "fixture-account-empty",
      ],
    );
    assert.ok(
      body.accounts[0].items.some(
        (item) => item.id === "fixture-stmt-2026-04-01-salary",
      ),
    );
  } finally {
    await server.close();
  }
});
