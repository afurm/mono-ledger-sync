import { spawn } from "node:child_process";
const defaultServiceName = "mono-ledger-sync.monobank-token";

export interface MonobankTokenStore {
  getToken(profile: string): Promise<string | undefined>;
  setToken(profile: string, token: string): Promise<void>;
  deleteToken(profile: string): Promise<void>;
  getStatus?(profile: string): Promise<MonobankTokenStoreStatus>;
}

export type MonobankTokenStoreStorage = "secure" | "session";
export type MonobankTokenStorePersistence = "persistent" | "session";
export type MonobankTokenStoreFallbackReason =
  | "secure_storage_unavailable"
  | "secure_storage_write_failed";

export interface MonobankTokenStoreStatus {
  storage: MonobankTokenStoreStorage;
  persistence: MonobankTokenStorePersistence;
  fallbackReason?: MonobankTokenStoreFallbackReason;
}

export interface MonobankTokenStoreCommandResult {
  stdout: string;
  stderr: string;
}

export type MonobankTokenStoreCommandRunner = (
  file: string,
  args: readonly string[],
  options?: { input?: string },
) => Promise<MonobankTokenStoreCommandResult>;

export interface MonobankTokenStoreOptions {
  serviceName?: string;
  platform?: NodeJS.Platform;
  runCommand?: MonobankTokenStoreCommandRunner;
}

async function runDefaultCommand(
  file: string,
  args: readonly string[],
  options: { input?: string } = {},
): Promise<MonobankTokenStoreCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, [...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${file} exited with code ${code ?? "unknown"}${
            stderr.trim() ? `: ${stderr.trim()}` : ""
          }`,
        ),
      );
    });

    child.stdin.end(options.input ?? "");
  });
}

function tokenAccount(profile: string): string {
  return `monobank:${profile}`;
}

export function createSessionMonobankTokenStore(): MonobankTokenStore {
  const tokens = new Map<string, string>();

  return {
    async getToken(profile) {
      return tokens.get(profile);
    },
    async setToken(profile, token) {
      tokens.set(profile, token);
    },
    async deleteToken(profile) {
      tokens.delete(profile);
    },
    async getStatus() {
      return {
        storage: "session",
        persistence: "session",
        fallbackReason: "secure_storage_unavailable",
      };
    },
  };
}

function createLinuxSecretServiceMonobankTokenStore(
  options: Required<
    Pick<MonobankTokenStoreOptions, "serviceName" | "runCommand">
  >,
): MonobankTokenStore {
  const attributes = (profile: string): readonly string[] => [
    "application",
    options.serviceName,
    "kind",
    "monobank-token",
    "profile",
    profile,
  ];

  return {
    async getToken(profile) {
      try {
        const result = await options.runCommand("secret-tool", [
          "lookup",
          ...attributes(profile),
        ]);

        return result.stdout.trim() || undefined;
      } catch {
        return undefined;
      }
    },
    async setToken(profile, token) {
      await options.runCommand(
        "secret-tool",
        [
          "store",
          "--label",
          `${options.serviceName} Monobank token (${profile})`,
          ...attributes(profile),
        ],
        { input: token },
      );
    },
    async deleteToken(profile) {
      try {
        await options.runCommand("secret-tool", [
          "clear",
          ...attributes(profile),
        ]);
      } catch {
        // Missing credentials are already deleted from the product perspective.
      }
    },
    async getStatus() {
      return {
        storage: "secure",
        persistence: "persistent",
      };
    },
  };
}

function createMacOsKeychainMonobankTokenStore(
  options: Required<
    Pick<MonobankTokenStoreOptions, "serviceName" | "runCommand">
  >,
): MonobankTokenStore {
  return {
    async getToken(profile) {
      try {
        const result = await options.runCommand("security", [
          "find-generic-password",
          "-s",
          options.serviceName,
          "-a",
          tokenAccount(profile),
          "-w",
        ]);

        return result.stdout.trim() || undefined;
      } catch {
        return undefined;
      }
    },
    async setToken(profile, token) {
      await options.runCommand(
        "security",
        [
          "add-generic-password",
          "-U",
          "-s",
          options.serviceName,
          "-a",
          tokenAccount(profile),
          "-w",
        ],
        { input: `${token}\n` },
      );
    },
    async deleteToken(profile) {
      try {
        await options.runCommand("security", [
          "delete-generic-password",
          "-s",
          options.serviceName,
          "-a",
          tokenAccount(profile),
        ]);
      } catch {
        // Missing credentials are already deleted from the product perspective.
      }
    },
    async getStatus() {
      return {
        storage: "secure",
        persistence: "persistent",
      };
    },
  };
}

const windowsCredentialScript = String.raw`
$ErrorActionPreference = 'Stop'
$vault = New-Object Windows.Security.Credentials.PasswordVault
$resource = $args[0]
$profile = $args[1]
$operation = $args[2]
if ($operation -eq 'set') {
  $secret = [Console]::In.ReadToEnd()
  try {
    $existing = $vault.Retrieve($resource, $profile)
    $vault.Remove($existing)
  } catch {}
  $vault.Add((New-Object Windows.Security.Credentials.PasswordCredential($resource, $profile, $secret)))
} elseif ($operation -eq 'get') {
  $credential = $vault.Retrieve($resource, $profile)
  $credential.RetrievePassword()
  [Console]::Out.Write($credential.Password)
} elseif ($operation -eq 'delete') {
  try {
    $credential = $vault.Retrieve($resource, $profile)
    $vault.Remove($credential)
  } catch {}
}
`;

function createWindowsCredentialManagerMonobankTokenStore(
  options: Required<
    Pick<MonobankTokenStoreOptions, "serviceName" | "runCommand">
  >,
): MonobankTokenStore {
  const commandArgs = (
    profile: string,
    operation: "get" | "set" | "delete",
  ): readonly string[] => [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    windowsCredentialScript,
    options.serviceName,
    tokenAccount(profile),
    operation,
  ];

  return {
    async getToken(profile) {
      try {
        const result = await options.runCommand(
          "powershell.exe",
          commandArgs(profile, "get"),
        );

        return result.stdout.trim() || undefined;
      } catch {
        return undefined;
      }
    },
    async setToken(profile, token) {
      await options.runCommand("powershell.exe", commandArgs(profile, "set"), {
        input: token,
      });
    },
    async deleteToken(profile) {
      await options.runCommand(
        "powershell.exe",
        commandArgs(profile, "delete"),
      );
    },
    async getStatus() {
      return {
        storage: "secure",
        persistence: "persistent",
      };
    },
  };
}

function createSecureMonobankTokenStore(
  options: Required<MonobankTokenStoreOptions>,
): MonobankTokenStore | undefined {
  switch (options.platform) {
    case "darwin":
      return createMacOsKeychainMonobankTokenStore(options);
    case "linux":
      return createLinuxSecretServiceMonobankTokenStore(options);
    case "win32":
      return createWindowsCredentialManagerMonobankTokenStore(options);
    default:
      return undefined;
  }
}

export function createDefaultMonobankTokenStore(
  options: MonobankTokenStoreOptions = {},
): MonobankTokenStore {
  const sessionTokens = new Map<string, string>();
  const fallbackReasons = new Map<string, MonobankTokenStoreFallbackReason>();
  const secureStore = createSecureMonobankTokenStore({
    serviceName: options.serviceName ?? defaultServiceName,
    platform: options.platform ?? process.platform,
    runCommand: options.runCommand ?? runDefaultCommand,
  });

  if (secureStore === undefined) {
    return createSessionMonobankTokenStore();
  }

  return {
    async getToken(profile) {
      if (sessionTokens.has(profile)) {
        return sessionTokens.get(profile);
      }

      return secureStore.getToken(profile);
    },
    async setToken(profile, token) {
      try {
        await secureStore.setToken(profile, token);
        sessionTokens.delete(profile);
        fallbackReasons.delete(profile);
      } catch {
        sessionTokens.set(profile, token);
        fallbackReasons.set(profile, "secure_storage_write_failed");
      }
    },
    async deleteToken(profile) {
      sessionTokens.delete(profile);
      fallbackReasons.delete(profile);
      await secureStore.deleteToken(profile);
    },
    async getStatus(profile) {
      if (sessionTokens.has(profile)) {
        return {
          storage: "session",
          persistence: "session",
          fallbackReason:
            fallbackReasons.get(profile) ?? "secure_storage_unavailable",
        };
      }

      return (
        (await secureStore.getStatus?.(profile)) ?? {
          storage: "secure",
          persistence: "persistent",
        }
      );
    },
  };
}
