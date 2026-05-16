import { redactSensitiveText } from "../privacy/index.js";
import type { RedactSensitiveTextOptions } from "../privacy/index.js";

export type StructuredLogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLogOptions {
  secrets?: readonly string[];
  replacement?: string;
  logger?: (line: string) => void;
}

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

function redactLogValue(value: unknown, options: StructuredLogOptions): string {
  if (value === undefined || value === null) {
    return String(value);
  }

  if (typeof value === "string") {
    return redactSensitiveText(value, {
      ...redactOptions(options),
    });
  }

  return redactSensitiveText(JSON.stringify(value), redactOptions(options));
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
