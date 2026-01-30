/**
 * @fileoverview Observability module public exports.
 * 
 * @module @orchidsai/antigravity/observability
 * @version 0.1.0
 */

export {
  Logger,
  ConsoleTransport,
  MemoryTransport,
  createLogger,
  defaultLogger,
  type LogEntry,
  type LogError,
  type LogMetrics,
  type LogTransport,
  type LoggerConfig,
} from './logger.js';

export {
  TraceRecorder,
  traced,
  SpanType,
  SpanStatus,
  type ExecutionTrace,
  type TraceSpan,
  type SpanEvent,
  type ContextSnapshot,
  type TraceMetadata,
  type SpanOptions,
} from './tracer.js';
