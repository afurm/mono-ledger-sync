export const SUPPORTED_LOCALES = ["uk-UA", "en-US"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "uk-UA";

export type RouteCopyId =
  | "overview"
  | "transactions"
  | "categories"
  | "budgets"
  | "recurring"
  | "reports"
  | "rules"
  | "sync"
  | "accounts"
  | "exports"
  | "logs"
  | "settings"
  | "help";

export interface RouteCopy {
  label: string;
  title: string;
  description: string;
}

interface AppMessages {
  readonly routes: Record<RouteCopyId, RouteCopy>;
  readonly secondaryRoutes: {
    readonly localDatabase: string;
    readonly privacyModel: string;
  };
  readonly shell: {
    readonly localLedger: string;
    readonly workspace: string;
    readonly localContext: string;
    readonly localStatus: string;
    readonly version: string;
    readonly database: string;
    readonly diagnostics: string;
    readonly localProfile: string;
    readonly loading: string;
    readonly pending: string;
    readonly waitingForLocalApi: string;
    readonly localBind: string;
    readonly openNavigation: string;
    readonly navigation: string;
    readonly chooseWorkspaceRoute: string;
    readonly skipToMainContent: string;
    readonly refreshLocalData: string;
    readonly runSync: string;
    readonly syncing: string;
    readonly localApiUnavailable: string;
    readonly localFirstWorkspaceTitle: string;
    readonly localFirstWorkspaceDescription: string;
    readonly demoDataTitle: string;
    readonly demoDataDescription: string;
    readonly waitingForFirstSync: string;
    readonly loadErrorFallback: string;
    readonly syncCompleteTitle: string;
    readonly syncCompleteDescription: string;
    readonly syncFailedTitle: string;
    readonly syncFailedDescription: string;
    readonly demoReadyTitle: string;
    readonly demoReadyDescription: string;
    readonly demoStartFailedTitle: string;
    readonly demoStartFailedDescription: string;
    readonly transactionsLoading: string;
    readonly syncLoading: string;
    readonly accountsLoading: string;
    readonly settingsLoading: string;
    readonly sourceLabel: (source: string) => string;
    readonly bindLabel: (host: string) => string;
    readonly routeReadyContext: (
      description: string,
      profile: string,
      source: string,
    ) => string;
    readonly routeLoadingContext: (description: string) => string;
    readonly routeLoaded: (title: string) => string;
    readonly routeLoading: (title: string) => string;
    readonly updatedAt: (value: string) => string;
  };
  readonly theme: {
    readonly label: string;
    readonly mode: string;
    readonly system: string;
    readonly light: string;
    readonly dark: string;
    readonly tooltip: (mode: string) => string;
  };
  readonly firstRun: {
    readonly missingHeading: string;
    readonly missingDescription: string;
    readonly connectedHeading: string;
    readonly awaitingSyncDescription: string;
    readonly liveDescription: (
      name: string,
      accounts: number,
      jars: number,
    ) => string;
    readonly getTokenLabel: string;
    readonly recheckConnectionLabel: string;
    readonly noTokenSaved: string;
    readonly awaitingFirstSync: string;
    readonly liveInventory: string;
    readonly emptyStateHeading: string;
    readonly emptyStateDescription: string;
    readonly openSettingsLabel: string;
    readonly loadingDemo: string;
    readonly exploreDemoData: string;
    readonly demoDescription: string;
  };
  readonly token: {
    readonly configured: string;
    readonly configuredDescription: string;
    readonly sessionOnly: string;
    readonly sessionWriteFailedDescription: string;
    readonly sessionDescription: string;
    readonly notConfigured: string;
    readonly notConfiguredDescription: string;
  };
  readonly format: {
    readonly notSynced: string;
    readonly notAvailable: string;
    readonly justNow: string;
  };
}

const ukMessages: AppMessages = {
  routes: {
    overview: {
      label: "Огляд",
      title: "Фінанси на долоні",
      description:
        "Баланси, стан синхронізації, останній рух коштів і свіжість локального реєстру.",
    },
    transactions: {
      label: "Транзакції",
      title: "Транзакції реєстру",
      description:
        "Пошук, фільтри, перевірка й перегляд нормалізованих локальних транзакцій.",
    },
    categories: {
      label: "Категорії",
      title: "Витрати за категоріями",
      description:
        "Підсумки категорій, динаміка витрат і деталізація рядків витрат.",
    },
    budgets: {
      label: "Бюджети",
      title: "Виконання бюджету",
      description:
        "Місячні бюджети категорій, перенесення залишків і стан перевитрат.",
    },
    recurring: {
      label: "Регулярні",
      title: "Регулярні платежі",
      description:
        "Виявлені підписки, пропущені платежі, майбутні списання й календар.",
    },
    reports: {
      label: "Звіти",
      title: "Локальні звіти",
      description:
        "Витрати, cashflow, заощадження, прогнози, категорії та мерчанти.",
    },
    rules: {
      label: "Правила й мапінги",
      title: "Правила автоматизації",
      description:
        "Категоризація, очищення мерчантів, перевірка дублікатів і мапінги експорту.",
    },
    sync: {
      label: "Синхронізація",
      title: "Центр синхронізації",
      description:
        "Підключення Monobank, webhook-доставка, розклад, сховище й активність.",
    },
    accounts: {
      label: "Рахунки",
      title: "Підключені рахунки",
      description:
        "Картки, баланси, валюти, банки та локальний контекст курсорів виписок.",
    },
    exports: {
      label: "Експорт",
      title: "Локальний експорт",
      description:
        "CSV, JSON, JSONL, journal CSV, Parquet і знеособлені SQLite-знімки.",
    },
    logs: {
      label: "Журнал",
      title: "Діагностична стрічка",
      description:
        "Знеособлена активність синхронізації, webhook, експорту, правил, попереджень і помилок.",
    },
    settings: {
      label: "Налаштування",
      title: "Налаштування простору",
      description:
        "Профіль, шлях до бази, стан токена, приватність, резервні копії та видалення.",
    },
    help: {
      label: "Довідка",
      title: "Довідка з локального запуску",
      description:
        "Налаштування токена, резервні копії, рецепти експорту, діагностика й модель приватності.",
    },
  },
  secondaryRoutes: {
    localDatabase: "Локальна база",
    privacyModel: "Модель приватності",
  },
  shell: {
    localLedger: "Локальний реєстр",
    workspace: "Простір",
    localContext: "Локальний контекст",
    localStatus: "Локальний стан",
    version: "Версія",
    database: "База даних",
    diagnostics: "Діагностика",
    localProfile: "Локальний профіль",
    loading: "Завантаження",
    pending: "очікується",
    waitingForLocalApi: "Очікування локального API",
    localBind: "локальна прив'язка",
    openNavigation: "Відкрити навігацію",
    navigation: "Навігація",
    chooseWorkspaceRoute: "Виберіть розділ робочого простору.",
    skipToMainContent: "Перейти до основного вмісту",
    refreshLocalData: "Оновити локальні дані",
    runSync: "Синхронізувати",
    syncing: "Синхронізація",
    localApiUnavailable: "Локальний API недоступний",
    localFirstWorkspaceTitle: "Локальний робочий простір",
    localFirstWorkspaceDescription:
      "Токени й фінансові дані залишаються на цьому комп'ютері. Інтерфейс читає локальний Fastify API та пише у SQLite-реєстр активного профілю.",
    demoDataTitle: "Демо-дані",
    demoDataDescription:
      "Цей профіль містить синтетичні fixtures, а не живі транзакції Monobank. Збереження валідного токена очистить демо-рядки перед переходом до живої синхронізації.",
    waitingForFirstSync: "Очікування першої синхронізації",
    loadErrorFallback: "Локальний API недоступний",
    syncCompleteTitle: "Локальну синхронізацію завершено",
    syncCompleteDescription:
      "Дані SQLite-реєстру оновлено з налаштованого джерела.",
    syncFailedTitle: "Локальна синхронізація не вдалася",
    syncFailedDescription:
      "Локальний Fastify API не зміг завершити синхронізацію.",
    demoReadyTitle: "Демо-простір готовий",
    demoReadyDescription:
      "Синтетичні fixtures Monobank завантажено локально й відокремлено від живих даних.",
    demoStartFailedTitle: "Демо-простір не вдалося запустити",
    demoStartFailedDescription:
      "Локальний реєстр із fixtures не вдалося завантажити.",
    transactionsLoading: "Транзакції завантажуються",
    syncLoading: "Синхронізація і вебхуки завантажуються",
    accountsLoading: "Рахунки завантажуються",
    settingsLoading: "Налаштування завантажуються",
    sourceLabel: (source) => `джерело: ${source}`,
    bindLabel: (host) => `прив'язка: ${host}`,
    routeReadyContext: (description, profile, source) =>
      `${description} Профіль: ${profile}; ${source}.`,
    routeLoadingContext: (description) =>
      `${description} Очікування локального API.`,
    routeLoaded: (title) => `${title} завантажено`,
    routeLoading: (title) => `${title} завантажується`,
    updatedAt: (value) => `Оновлено ${value}`,
  },
  theme: {
    label: "Тема",
    mode: "Режим теми",
    system: "Системна",
    light: "Світла",
    dark: "Темна",
    tooltip: (mode) => `Тема: ${mode}`,
  },
  firstRun: {
    missingHeading: "Увійдіть через Monobank",
    missingDescription:
      "Вставте персональний API-токен Monobank, щоб завантажити реальні рахунки, банки й виписки в цей локальний простір. Токен залишається на цьому пристрої.",
    connectedHeading: "Monobank підключено",
    awaitingSyncDescription:
      "Для цього профілю збережено токен Monobank. Запустіть синхронізацію, щоб заповнити маскований підсумок рахунків.",
    liveDescription: (name, accounts, jars) =>
      `Рахунок Monobank: ${name} · рахунків: ${accounts} · банок: ${jars}`,
    getTokenLabel: "Отримати токен на api.monobank.ua",
    recheckConnectionLabel: "Перевірити підключення Monobank",
    noTokenSaved: "Токен не збережено",
    awaitingFirstSync: "Очікує першої синхронізації",
    liveInventory: "Актуальна інвентаризація",
    emptyStateHeading: "Увійдіть через Monobank, щоб переглянути цей розділ",
    emptyStateDescription:
      "Цей екран потребує збереженого токена Monobank, щоб завантажити реальні рахунки, банки, транзакції та виписки. Токен залишається на цьому пристрої й нікуди більше не надсилається.",
    openSettingsLabel: "Відкрити налаштування для токена",
    loadingDemo: "Демо завантажується",
    exploreDemoData: "Переглянути демо-дані",
    demoDescription:
      "Демо-режим використовує синтетичні fixtures. Збереження справжнього токена Monobank видаляє демо-реєстр перед першою живою синхронізацією.",
  },
  token: {
    configured: "Налаштовано",
    configuredDescription:
      "Токен Monobank доступний із захищеного локального сховища.",
    sessionOnly: "Лише сесія",
    sessionWriteFailedDescription:
      "Захищене сховище було недоступне під час збереження, тому токен доступний лише до зупинки цього сервера.",
    sessionDescription:
      "Токен Monobank доступний лише для поточної сесії сервера.",
    notConfigured: "Не налаштовано",
    notConfiguredDescription:
      "Для цього простору токен не налаштовано. Синхронізація Monobank не запускатиметься.",
  },
  format: {
    notSynced: "Не синхронізовано",
    notAvailable: "Недоступно",
    justNow: "щойно",
  },
};

const enMessages: AppMessages = {
  routes: {
    overview: {
      label: "Overview",
      title: "Money at a glance",
      description:
        "Balances, sync health, recent movement, and local ledger freshness.",
    },
    transactions: {
      label: "Transactions",
      title: "Ledger transactions",
      description:
        "Search, filter, review, and inspect normalized local transaction rows.",
    },
    categories: {
      label: "Categories",
      title: "Category spending",
      description:
        "Category totals, trend movement, and drill-downs into expense rows.",
    },
    budgets: {
      label: "Budgets",
      title: "Budget progress",
      description:
        "Monthly category budgets, rollover choices, and overspend state.",
    },
    recurring: {
      label: "Recurring",
      title: "Recurring payments",
      description:
        "Detected subscriptions, missed payments, upcoming charges, and calendar.",
    },
    reports: {
      label: "Reports",
      title: "Local reports",
      description:
        "Spending, cashflow, savings, projection, category, and merchant reports.",
    },
    rules: {
      label: "Rules & Mappings",
      title: "Automation rules",
      description:
        "Categorization, merchant cleanup, duplicate review, and export mappings.",
    },
    sync: {
      label: "Sync & Webhooks",
      title: "Sync control center",
      description:
        "Monobank connection, webhook delivery, schedules, storage, and activity.",
    },
    accounts: {
      label: "Accounts",
      title: "Connected accounts",
      description:
        "Cards, balances, currencies, jars, and local statement cursor context.",
    },
    exports: {
      label: "Exports",
      title: "Local export flows",
      description:
        "CSV, JSON, JSONL, journal CSV, Parquet, and redacted SQLite snapshots.",
    },
    logs: {
      label: "Logs",
      title: "Diagnostics timeline",
      description:
        "Redacted sync, webhook, export, rule, warning, and error activity.",
    },
    settings: {
      label: "Settings",
      title: "Local workspace settings",
      description:
        "Profile, database path, token status, privacy, backups, and deletion.",
    },
    help: {
      label: "Help",
      title: "Local setup help",
      description:
        "Token setup, backups, export recipes, troubleshooting, and privacy model.",
    },
  },
  secondaryRoutes: {
    localDatabase: "Local database",
    privacyModel: "Privacy model",
  },
  shell: {
    localLedger: "Local ledger",
    workspace: "Workspace",
    localContext: "Local context",
    localStatus: "Local status",
    version: "Version",
    database: "Database",
    diagnostics: "Diagnostics",
    localProfile: "Local profile",
    loading: "Loading",
    pending: "pending",
    waitingForLocalApi: "Waiting for local API",
    localBind: "local bind",
    openNavigation: "Open navigation",
    navigation: "Navigation",
    chooseWorkspaceRoute: "Choose a workspace route.",
    skipToMainContent: "Skip to main content",
    refreshLocalData: "Refresh local data",
    runSync: "Run Sync",
    syncing: "Syncing",
    localApiUnavailable: "Local API unavailable",
    localFirstWorkspaceTitle: "Local-first workspace",
    localFirstWorkspaceDescription:
      "Tokens and financial data stay on this machine. The UI reads the local Fastify API and writes to the profile-scoped SQLite ledger.",
    demoDataTitle: "Demo data",
    demoDataDescription:
      "This profile contains synthetic fixtures, not live Monobank transactions. Saving a valid token clears these demo rows before switching to live sync.",
    waitingForFirstSync: "Waiting for first sync",
    loadErrorFallback: "Local API unavailable",
    syncCompleteTitle: "Local sync complete",
    syncCompleteDescription:
      "SQLite ledger data refreshed from the configured source.",
    syncFailedTitle: "Local sync failed",
    syncFailedDescription: "The local Fastify API could not complete sync.",
    demoReadyTitle: "Demo workspace ready",
    demoReadyDescription:
      "Synthetic Monobank fixtures are loaded locally and clearly separated from live data.",
    demoStartFailedTitle: "Demo workspace could not start",
    demoStartFailedDescription: "The local fixture ledger could not be loaded.",
    transactionsLoading: "Transactions loading",
    syncLoading: "Sync and webhooks loading",
    accountsLoading: "Accounts loading",
    settingsLoading: "Settings loading",
    sourceLabel: (source) => `${source} source`,
    bindLabel: (host) => `${host} bind`,
    routeReadyContext: (description, profile, source) =>
      `${description} ${profile} profile / ${source}.`,
    routeLoadingContext: (description) =>
      `${description} Waiting for local API.`,
    routeLoaded: (title) => `${title} loaded`,
    routeLoading: (title) => `${title} loading`,
    updatedAt: (value) => `Updated ${value}`,
  },
  theme: {
    label: "Theme",
    mode: "Theme mode",
    system: "System",
    light: "Light",
    dark: "Dark",
    tooltip: (mode) => `Theme: ${mode}`,
  },
  firstRun: {
    missingHeading: "Sign in with Monobank",
    missingDescription:
      "Paste a personal API token from Monobank to load your real accounts, jars, and statements into this local workspace. The token stays on this device.",
    connectedHeading: "Monobank is connected",
    awaitingSyncDescription:
      "A Monobank token is saved for this profile. Run a sync to populate the masked account summary.",
    liveDescription: (name, accounts, jars) =>
      `Monobank account: ${name} · ${accounts} accounts · ${jars} jars`,
    getTokenLabel: "Get token on api.monobank.ua",
    recheckConnectionLabel: "Re-check Monobank connection",
    noTokenSaved: "No token saved",
    awaitingFirstSync: "Awaiting first sync",
    liveInventory: "Live inventory",
    emptyStateHeading: "Sign in with Monobank to see this view",
    emptyStateDescription:
      "This screen needs a saved Monobank token to load real accounts, jars, transactions, and statements. The token stays on this device and is never sent anywhere else.",
    openSettingsLabel: "Open Settings to paste token",
    loadingDemo: "Loading demo",
    exploreDemoData: "Explore demo data",
    demoDescription:
      "Demo mode uses synthetic fixture data. Saving a real Monobank token removes the demo ledger before the first live sync.",
  },
  token: {
    configured: "Configured",
    configuredDescription:
      "A Monobank token is available from secure local storage.",
    sessionOnly: "Session only",
    sessionWriteFailedDescription:
      "Secure storage was unavailable during save, so the token is available only until this server stops.",
    sessionDescription:
      "A Monobank token is available only for the running server session.",
    notConfigured: "Not configured",
    notConfiguredDescription:
      "No token is configured for this workspace. Monobank sync will not run.",
  },
  format: {
    notSynced: "Not synced",
    notAvailable: "Not available",
    justNow: "Just now",
  },
};

export const localeMessages: Record<AppLocale, AppMessages> = {
  "uk-UA": ukMessages,
  "en-US": enMessages,
};

export const messages = localeMessages[DEFAULT_LOCALE];

export function getAppMessages(
  locale: AppLocale = DEFAULT_LOCALE,
): AppMessages {
  return localeMessages[locale];
}
