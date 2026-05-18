import { redactSensitiveText } from "../privacy/index.js";
import type { RedactSensitiveTextOptions } from "../privacy/index.js";

export type StructuredLogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLogOptions {
  secrets?: readonly string[];
  replacement?: string;
  logger?: (line: string) => void;
}

const sensitiveLogFieldNames = new Set([
  "authorization",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "xtoken",
  "xsign",
  "xkeyid",
  "iban",
  "accountiban",
  "counteriban",
  "counteredrpou",
  "countername",
  "maskedpan",
  "rawjson",
  "payloadjson",
]);

const defaultLoggers: Record<StructuredLogLevel, (line: string) => void> = {
  debug: console.debug.bind(console),
  info: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function redactOptions(
  options: StructuredLogOptions,
): RedactSensitiveTextOptions {
  return {
    ...(options.replacement !== undefined
      ? { replacement: options.replacement }
      : {}),
    ...(options.secrets !== undefined ? { secrets: options.secrets } : {}),
  };
}

function normalizeLogFieldName(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveLogField(key: string): boolean {
  const normalizedKey = normalizeLogFieldName(key);

  return (
    sensitiveLogFieldNames.has(normalizedKey) ||
    normalizedKey.endsWith("token") ||
    normalizedKey.endsWith("secret")
  );
}

function redactionReplacement(options: StructuredLogOptions): string {
  return options.replacement ?? "[redacted]";
}

function redactStructuredLogValue(
  value: unknown,
  options: StructuredLogOptions,
  seen: WeakSet<object>,
): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === "string") {
    return redactSensitiveText(value, redactOptions(options));
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();

    return Number.isNaN(timestamp) ? null : value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveText(value.message, redactOptions(options)),
    };
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const redactedArray = value.map((item) =>
      redactStructuredLogValue(item, options, seen),
    );

    seen.delete(value);

    return redactedArray;
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    redacted[key] = isSensitiveLogField(key)
      ? redactionReplacement(options)
      : redactStructuredLogValue(item, options, seen);
  }

  seen.delete(value);

  return redacted;
}

function redactLogValue(value: unknown, options: StructuredLogOptions): string {
  if (value === undefined || value === null) {
    return String(value);
  }

  if (typeof value === "string") {
    return redactSensitiveText(value, {
      ...redactOptions(options),
    });
  }

  const redactedValue = redactStructuredLogValue(value, options, new WeakSet());

  return redactSensitiveText(
    JSON.stringify(redactedValue),
    redactOptions(options),
  );
}

export function formatStructuredLogLine(
  level: StructuredLogLevel,
  message: string,
  details?: unknown,
  options: StructuredLogOptions = {},
): string {
  const redactedMessage = redactSensitiveText(message, {
    ...redactOptions(options),
  });

  if (details === undefined) {
    return `[${level.toUpperCase()}] ${redactedMessage}`;
  }

  return `[${level.toUpperCase()}] ${redactedMessage} ${redactLogValue(details, options)}`;
}

export function logStructured(
  level: StructuredLogLevel,
  message: string,
  details?: unknown,
  options: StructuredLogOptions = {},
): string {
  const line = formatStructuredLogLine(level, message, details, options);
  const sink = options.logger ?? defaultLoggers[level];

  sink(line);
  return line;
}
