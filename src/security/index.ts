import { spawn } from "node:child_process";
const defaultServiceName = "mono-ledger-sync.monobank-token";

export interface MonobankTokenStore {
  getToken(profile: string): Promise<string | undefined>;
  setToken(profile: string, token: string): Promise<void>;
  deleteToken(profile: string): Promise<void>;
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
  };
}

function createSecureMonobankTokenStore(
  options: Required<MonobankTokenStoreOptions>,
): MonobankTokenStore | undefined {
  switch (options.platform) {
    case "linux":
      return createLinuxSecretServiceMonobankTokenStore(options);
    default:
      return undefined;
  }
}

export function createDefaultMonobankTokenStore(
  options: MonobankTokenStoreOptions = {},
): MonobankTokenStore {
  const sessionTokens = new Map<string, string>();
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
      } catch {
        sessionTokens.set(profile, token);
      }
    },
    async deleteToken(profile) {
      sessionTokens.delete(profile);
      await secureStore.deleteToken(profile);
    },
  };
}
