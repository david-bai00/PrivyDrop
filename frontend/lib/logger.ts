import { postLogToBackend } from "@/app/config/api";
import { getLoggingConfig } from "@/app/config/environment";

export type RuntimeLogLevel = "debug" | "info" | "warn" | "error";
export type LegacyConsoleLogLevel = "log" | "warn" | "error";

interface ScopedLogger {
  debug: (message: string, context?: unknown) => void;
  info: (message: string, context?: unknown) => void;
  warn: (message: string, context?: unknown) => void;
  error: (message: string, context?: unknown) => void;
}

const BACKEND_LOG_LIMIT = 4000;

function normalizeLevel(
  level: RuntimeLogLevel | LegacyConsoleLogLevel
): RuntimeLogLevel {
  return level === "log" ? "info" : level;
}

function shouldWriteToConsole(level: RuntimeLogLevel): boolean {
  const loggingConfig = getLoggingConfig();

  switch (level) {
    case "debug":
      return loggingConfig.enableDebugConsoleLogs;
    case "info":
      return loggingConfig.enableInfoConsoleLogs;
    case "warn":
      return true;
    case "error":
      return true;
    default:
      return false;
  }
}

function shouldWriteToBackend(): boolean {
  return getLoggingConfig().enableBackendLogs;
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, seen));
  }

  const objectValue = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  Object.entries(objectValue).forEach(([key, entry]) => {
    result[key] = sanitizeValue(entry, seen);
  });

  return result;
}

function serializeContext(context?: unknown): string {
  if (context === undefined) {
    return "";
  }

  if (typeof context === "string") {
    return context;
  }

  try {
    return JSON.stringify(sanitizeValue(context, new WeakSet<object>()));
  } catch (error) {
    return `{"serializationError":"${
      error instanceof Error ? error.message : String(error)
    }"}`;
  }
}

function buildLogLine(
  scope: string,
  level: RuntimeLogLevel,
  message: string,
  context?: unknown
): string {
  const contextText = serializeContext(context);
  const baseMessage = `[${scope}] ${message}`;

  if (!contextText) {
    return baseMessage;
  }

  return `${baseMessage} ${contextText}`;
}

function writeConsole(
  level: RuntimeLogLevel,
  logLine: string,
  context?: unknown
): void {
  if (!shouldWriteToConsole(level)) {
    return;
  }

  const consoleMethod =
    level === "debug"
      ? console.debug
      : level === "info"
        ? console.info
        : level === "warn"
          ? console.warn
          : console.error;

  if (context === undefined) {
    consoleMethod(logLine);
    return;
  }

  consoleMethod(logLine, context);
}

function writeBackend(level: RuntimeLogLevel, logLine: string): void {
  if (!shouldWriteToBackend()) {
    return;
  }

  const backendMessage = `[${level.toUpperCase()}] ${logLine}`.slice(
    0,
    BACKEND_LOG_LIMIT
  );

  void postLogToBackend(backendMessage);
}

function logInternal(
  scope: string,
  level: RuntimeLogLevel,
  message: string,
  context?: unknown
): void {
  const logLine = buildLogLine(scope, level, message, context);
  writeConsole(level, logLine, context);
  writeBackend(level, logLine);
}

export function createLogger(scope: string): ScopedLogger {
  return {
    debug: (message: string, context?: unknown) =>
      logInternal(scope, "debug", message, context),
    info: (message: string, context?: unknown) =>
      logInternal(scope, "info", message, context),
    warn: (message: string, context?: unknown) =>
      logInternal(scope, "warn", message, context),
    error: (message: string, context?: unknown) =>
      logInternal(scope, "error", message, context),
  };
}

export function logWithLegacyLevel(
  scope: string,
  level: LegacyConsoleLogLevel,
  message: string,
  context?: unknown
): void {
  logInternal(scope, normalizeLevel(level), message, context);
}
