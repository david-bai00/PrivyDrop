import { postLogToBackend } from "@/app/config/api";
import { getLoggingConfig } from "@/app/config/environment";

export type RuntimeLogLevel = "debug" | "info" | "warn" | "error";

export interface RuntimeLogSample {
  rate: number;
  key?: string;
}

export interface RuntimeLogEntry {
  event: string;
  context?: unknown;
  sample?: RuntimeLogSample;
}

export interface RuntimeLogEnvelope {
  timestamp: string;
  level: RuntimeLogLevel;
  scope: string;
  event: string;
  context?: unknown;
}

interface ScopedLogger {
  debug: (entry: RuntimeLogEntry) => void;
  info: (entry: RuntimeLogEntry) => void;
  warn: (entry: RuntimeLogEntry) => void;
  error: (entry: RuntimeLogEntry) => void;
}

interface CreateLoggerOptions {
  scope: string;
}

const BACKEND_LOG_LIMIT = 4000;
const SCOPE_PATTERN = /^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)*$/;
const EVENT_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

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

function sanitizeContext(context?: unknown): unknown {
  if (context === undefined) {
    return undefined;
  }

  return sanitizeValue(context, new WeakSet<object>());
}

function serializeEnvelope(envelope: RuntimeLogEnvelope): string {
  try {
    return JSON.stringify(envelope);
  } catch (error) {
    return JSON.stringify({
      timestamp: envelope.timestamp,
      level: envelope.level,
      scope: envelope.scope,
      event: envelope.event,
      context: {
        serializationError:
          error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function resolveBackendSampleRate(
  level: RuntimeLogLevel,
  entry: RuntimeLogEntry
): number {
  if (level === "warn" || level === "error") {
    return 1;
  }

  const loggingConfig = getLoggingConfig();
  const configuredRate = loggingConfig.backendSampleRates[level];
  const entryRate = entry.sample?.rate ?? 1;

  return Math.max(0, Math.min(1, configuredRate, entryRate));
}

function shouldWriteToBackend(
  level: RuntimeLogLevel,
  envelope: RuntimeLogEnvelope,
  entry: RuntimeLogEntry
): boolean {
  const loggingConfig = getLoggingConfig();

  if (!loggingConfig.enableBackendLogs) {
    return false;
  }

  const sampleRate = resolveBackendSampleRate(level, entry);
  if (sampleRate >= 1) {
    return true;
  }
  if (sampleRate <= 0) {
    return false;
  }

  const sampleKey =
    entry.sample?.key ?? `${envelope.scope}:${envelope.event}:${serializeEnvelope(envelope)}`;
  const normalizedHash = hashString(sampleKey) / 0xffffffff;

  return normalizedHash < sampleRate;
}

function writeConsole(envelope: RuntimeLogEnvelope): void {
  if (!shouldWriteToConsole(envelope.level)) {
    return;
  }

  const consoleMethod =
    envelope.level === "debug"
      ? console.debug
      : envelope.level === "info"
        ? console.info
        : envelope.level === "warn"
          ? console.warn
          : console.error;

  const line = `[${envelope.level.toUpperCase()}] [${envelope.scope}] ${envelope.event}`;

  if (envelope.context === undefined) {
    consoleMethod(line);
    return;
  }

  consoleMethod(line, envelope.context);
}

function writeBackend(
  envelope: RuntimeLogEnvelope,
  entry: RuntimeLogEntry
): void {
  if (!shouldWriteToBackend(envelope.level, envelope, entry)) {
    return;
  }

  void postLogToBackend(serializeEnvelope(envelope).slice(0, BACKEND_LOG_LIMIT));
}

function assertValidScope(scope: string): void {
  if (!SCOPE_PATTERN.test(scope)) {
    throw new Error(
      `Invalid logger scope "${scope}". Expected PascalCase or PascalCase.PascalCase.`
    );
  }
}

function assertValidEvent(event: string): void {
  if (!EVENT_PATTERN.test(event)) {
    throw new Error(
      `Invalid logger event "${event}". Expected lower_snake_case.`
    );
  }
}

function createEnvelope(
  scope: string,
  level: RuntimeLogLevel,
  entry: RuntimeLogEntry
): RuntimeLogEnvelope {
  assertValidEvent(entry.event);

  const context = sanitizeContext(entry.context);

  return {
    timestamp: new Date().toISOString(),
    level,
    scope,
    event: entry.event,
    ...(context === undefined ? {} : { context }),
  };
}

function logInternal(
  scope: string,
  level: RuntimeLogLevel,
  entry: RuntimeLogEntry
): void {
  const envelope = createEnvelope(scope, level, entry);
  writeConsole(envelope);
  writeBackend(envelope, entry);
}

export function createLogger({ scope }: CreateLoggerOptions): ScopedLogger {
  assertValidScope(scope);

  return {
    debug: (entry: RuntimeLogEntry) => logInternal(scope, "debug", entry),
    info: (entry: RuntimeLogEntry) => logInternal(scope, "info", entry),
    warn: (entry: RuntimeLogEntry) => logInternal(scope, "warn", entry),
    error: (entry: RuntimeLogEntry) => logInternal(scope, "error", entry),
  };
}
