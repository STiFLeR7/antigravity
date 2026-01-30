/**
 * @fileoverview Structured Logger - Production-grade logging for Antigravity.
 * 
 * The logger provides structured, leveled logging with support for:
 * - Contextual metadata
 * - Correlation IDs for tracing
 * - Multiple output transports
 * - Performance metrics
 * 
 * All log entries are JSON-serializable for easy parsing and analysis.
 * 
 * @module @orchidsai/antigravity/observability/logger
 * @version 0.1.0
 */

import type { UniqueId, Timestamp } from '../types/core.types.js';
import { Severity, createTimestamp, createUniqueId } from '../types/core.types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * A structured log entry.
 */
export interface LogEntry {
  /** Unique ID for this log entry */
  readonly id: UniqueId;
  
  /** Timestamp of the log */
  readonly timestamp: Timestamp;
  
  /** Severity level */
  readonly level: Severity;
  
  /** Log message */
  readonly message: string;
  
  /** Module that generated the log */
  readonly module: string;
  
  /** Correlation ID for tracing */
  readonly correlationId: UniqueId | null;
  
  /** Session ID if in a session */
  readonly sessionId: UniqueId | null;
  
  /** Additional structured data */
  readonly data: Readonly<Record<string, unknown>>;
  
  /** Error information if applicable */
  readonly error: LogError | null;
  
  /** Performance metrics if applicable */
  readonly metrics: LogMetrics | null;
}

/**
 * Error information in a log entry.
 */
export interface LogError {
  readonly name: string;
  readonly message: string;
  readonly stack: string | undefined;
  readonly code: string | undefined;
}

/**
 * Performance metrics in a log entry.
 */
export interface LogMetrics {
  readonly durationMs?: number;
  readonly memoryUsed?: number;
  readonly custom?: Readonly<Record<string, number>>;
}

/**
 * Transport for outputting logs.
 */
export interface LogTransport {
  readonly name: string;
  write(entry: LogEntry): void | Promise<void>;
}

/**
 * Configuration for the logger.
 */
export interface LoggerConfig {
  /** Minimum level to log */
  readonly minLevel: Severity;
  
  /** Module name for this logger instance */
  readonly module: string;
  
  /** Transports to write to */
  readonly transports: LogTransport[];
  
  /** Whether to include timestamps */
  readonly includeTimestamp: boolean;
  
  /** Default correlation ID */
  readonly defaultCorrelationId?: UniqueId | undefined;
  
  /** Default session ID */
  readonly defaultSessionId?: UniqueId | undefined;
}

/**
 * Severity level ordering for comparison.
 */
const SEVERITY_ORDER: Record<Severity, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

/**
 * Default configuration.
 */
const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: 'INFO' as Severity,
  module: 'antigravity',
  transports: [],
  includeTimestamp: true,
};

/**
 * Console transport - outputs to console with formatting.
 */
export class ConsoleTransport implements LogTransport {
  readonly name = 'console';
  
  private readonly useColors: boolean;
  
  constructor(useColors: boolean = true) {
    this.useColors = useColors;
  }

  write(entry: LogEntry): void {
    const prefix = this.formatPrefix(entry);
    const message = `${prefix} ${entry.message}`;
    
    switch (entry.level) {
      case Severity.DEBUG:
        console.debug(message, entry.data);
        break;
      case Severity.INFO:
        console.info(message, entry.data);
        break;
      case Severity.WARN:
        console.warn(message, entry.data);
        break;
      case Severity.ERROR:
      case Severity.FATAL:
        console.error(message, entry.data, entry.error);
        break;
    }
  }

  private formatPrefix(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp as number).toISOString();
    const level = entry.level.padEnd(5);
    const module = entry.module;
    
    if (this.useColors) {
      const color = this.getLevelColor(entry.level);
      return `\x1b[90m${timestamp}\x1b[0m ${color}${level}\x1b[0m \x1b[36m[${module}]\x1b[0m`;
    }
    
    return `${timestamp} ${level} [${module}]`;
  }

  private getLevelColor(level: Severity): string {
    switch (level) {
      case Severity.DEBUG: return '\x1b[90m'; // Gray
      case Severity.INFO: return '\x1b[32m';  // Green
      case Severity.WARN: return '\x1b[33m';  // Yellow
      case Severity.ERROR: return '\x1b[31m'; // Red
      case Severity.FATAL: return '\x1b[35m'; // Magenta
      default: return '\x1b[0m';
    }
  }
}

/**
 * Memory transport - stores logs in memory for testing/debugging.
 */
export class MemoryTransport implements LogTransport {
  readonly name = 'memory';
  
  private readonly entries: LogEntry[] = [];
  private readonly maxEntries: number;
  
  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  write(entry: LogEntry): void {
    this.entries.push(entry);
    
    // Trim if exceeds max
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  getEntries(): ReadonlyArray<LogEntry> {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }

  findByCorrelationId(correlationId: UniqueId): ReadonlyArray<LogEntry> {
    return this.entries.filter(e => e.correlationId === correlationId);
  }

  findByLevel(level: Severity): ReadonlyArray<LogEntry> {
    return this.entries.filter(e => e.level === level);
  }
}

/**
 * Structured logger for Antigravity.
 * 
 * @example
 * ```typescript
 * const logger = new Logger({
 *   module: 'agent.lifecycle',
 *   minLevel: 'DEBUG',
 *   transports: [new ConsoleTransport()],
 * });
 * 
 * logger.info('Agent started', { sessionId: '123' });
 * logger.error('Tool execution failed', { toolId: 'read_file' }, error);
 * ```
 */
export class Logger {
  private readonly config: LoggerConfig;
  private correlationId: UniqueId | null;
  private sessionId: UniqueId | null;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.correlationId = config.defaultCorrelationId ?? null;
    this.sessionId = config.defaultSessionId ?? null;
    
    // Add console transport by default if none specified
    if (this.config.transports.length === 0) {
      this.config = {
        ...this.config,
        transports: [new ConsoleTransport()],
      };
    }
  }

  /**
   * Creates a child logger with additional context.
   */
  child(context: {
    module?: string;
    correlationId?: UniqueId;
    sessionId?: UniqueId;
  }): Logger {
    const correlationId = context.correlationId ?? this.correlationId;
    const sessionId = context.sessionId ?? this.sessionId;
    
    return new Logger({
      minLevel: this.config.minLevel,
      module: context.module ?? this.config.module,
      transports: this.config.transports,
      includeTimestamp: this.config.includeTimestamp,
      defaultCorrelationId: correlationId ?? undefined,
      defaultSessionId: sessionId ?? undefined,
    });
  }

  /**
   * Sets the correlation ID for subsequent logs.
   */
  setCorrelationId(id: UniqueId): void {
    this.correlationId = id;
  }

  /**
   * Sets the session ID for subsequent logs.
   */
  setSessionId(id: UniqueId): void {
    this.sessionId = id;
  }

  /**
   * Logs a debug message.
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('DEBUG' as Severity, message, data);
  }

  /**
   * Logs an info message.
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('INFO' as Severity, message, data);
  }

  /**
   * Logs a warning message.
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('WARN' as Severity, message, data);
  }

  /**
   * Logs an error message.
   */
  error(message: string, data?: Record<string, unknown>, error?: Error): void {
    this.log('ERROR' as Severity, message, data, error);
  }

  /**
   * Logs a fatal message.
   */
  fatal(message: string, data?: Record<string, unknown>, error?: Error): void {
    this.log('FATAL' as Severity, message, data, error);
  }

  /**
   * Logs with performance metrics.
   */
  withMetrics(
    level: Severity,
    message: string,
    metrics: LogMetrics,
    data?: Record<string, unknown>,
  ): void {
    const entry = this.createEntry(level, message, data, undefined, metrics);
    this.writeEntry(entry);
  }

  /**
   * Times a function and logs its duration.
   */
  async time<T>(
    label: string,
    fn: () => Promise<T>,
    level: Severity = 'DEBUG' as Severity,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.withMetrics(level, `${label} completed`, { durationMs: duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.withMetrics('ERROR' as Severity, `${label} failed`, { durationMs: duration }, undefined);
      throw error;
    }
  }

  // ============ Private Methods ============

  private log(
    level: Severity,
    message: string,
    data?: Record<string, unknown>,
    error?: Error,
  ): void {
    // Check minimum level
    if (SEVERITY_ORDER[level] < SEVERITY_ORDER[this.config.minLevel]) {
      return;
    }

    const entry = this.createEntry(level, message, data, error);
    this.writeEntry(entry);
  }

  private createEntry(
    level: Severity,
    message: string,
    data?: Record<string, unknown>,
    error?: Error,
    metrics?: LogMetrics,
  ): LogEntry {
    return {
      id: createUniqueId(uuidv4()),
      timestamp: createTimestamp(),
      level,
      message,
      module: this.config.module,
      correlationId: this.correlationId,
      sessionId: this.sessionId,
      data: data ?? {},
      error: error ? this.formatError(error) : null,
      metrics: metrics ?? null,
    };
  }

  private formatError(error: Error): LogError {
    const errorWithCode = error as Error & { code?: string };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? undefined,
      code: errorWithCode.code ?? undefined,
    };
  }

  private writeEntry(entry: LogEntry): void {
    for (const transport of this.config.transports) {
      try {
        void transport.write(entry);
      } catch (transportError) {
        // Fallback to console if transport fails
        console.error(`Logger transport '${transport.name}' failed:`, transportError);
      }
    }
  }
}

/**
 * Creates a logger for a specific module.
 */
export function createLogger(module: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger({ ...config, module });
}

/**
 * Default logger instance.
 */
export const defaultLogger = createLogger('antigravity');
