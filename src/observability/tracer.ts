/**
 * @fileoverview Trace Recorder - Records and replays agent execution traces.
 * 
 * Traces are essential for:
 * - Debugging agent behavior
 * - Understanding decision patterns
 * - Reproducing issues
 * - Performance analysis
 * 
 * @module @orchidsai/antigravity/observability/tracer
 * @version 0.1.0
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  UniqueId,
  Timestamp,
  AgentPhase,
} from '../types/core.types.js';
import { createUniqueId, createTimestamp } from '../types/core.types.js';
import type { MCPContext } from '../types/mcp.types.js';

/**
 * A complete execution trace.
 */
export interface ExecutionTrace {
  /** Unique trace ID */
  readonly id: UniqueId;
  
  /** Session this trace belongs to */
  readonly sessionId: UniqueId;
  
  /** Trace version for compatibility */
  readonly version: string;
  
  /** When the trace started */
  readonly startedAt: Timestamp;
  
  /** When the trace ended */
  readonly endedAt: Timestamp | null;
  
  /** Whether execution completed successfully */
  readonly success: boolean | null;
  
  /** All recorded spans */
  readonly spans: ReadonlyArray<TraceSpan>;
  
  /** Context snapshots at key points */
  readonly contextSnapshots: ReadonlyArray<ContextSnapshot>;
  
  /** Metadata about the trace */
  readonly metadata: TraceMetadata;
}

/**
 * A span within a trace representing a unit of work.
 */
export interface TraceSpan {
  /** Unique span ID */
  readonly id: UniqueId;
  
  /** Parent span ID, if nested */
  readonly parentId: UniqueId | null;
  
  /** Name of the operation */
  readonly name: string;
  
  /** Type of span */
  readonly type: SpanType;
  
  /** When the span started */
  readonly startedAt: Timestamp;
  
  /** When the span ended */
  readonly endedAt: Timestamp | null;
  
  /** Duration in milliseconds */
  readonly durationMs: number | null;
  
  /** Status of the span */
  readonly status: SpanStatus;
  
  /** Associated agent phase */
  readonly phase: AgentPhase | null;
  
  /** Step number when span was created */
  readonly stepNumber: number;
  
  /** Additional attributes */
  readonly attributes: Readonly<Record<string, unknown>>;
  
  /** Events that occurred during the span */
  readonly events: ReadonlyArray<SpanEvent>;
}

/**
 * Types of trace spans.
 */
export enum SpanType {
  /** Top-level session span */
  SESSION = 'SESSION',
  
  /** Agent phase span */
  PHASE = 'PHASE',
  
  /** Tool invocation span */
  TOOL = 'TOOL',
  
  /** Planning operation */
  PLANNING = 'PLANNING',
  
  /** Reflection operation */
  REFLECTION = 'REFLECTION',
  
  /** Custom operation */
  CUSTOM = 'CUSTOM',
}

/**
 * Status of a span.
 */
export enum SpanStatus {
  RUNNING = 'RUNNING',
  OK = 'OK',
  ERROR = 'ERROR',
  CANCELLED = 'CANCELLED',
}

/**
 * An event that occurred during a span.
 */
export interface SpanEvent {
  readonly name: string;
  readonly timestamp: Timestamp;
  readonly attributes: Readonly<Record<string, unknown>>;
}

/**
 * Snapshot of context at a point in time.
 */
export interface ContextSnapshot {
  readonly id: UniqueId;
  readonly contextVersion: number;
  readonly capturedAt: Timestamp;
  readonly stepNumber: number;
  readonly context: MCPContext;
}

/**
 * Metadata about a trace.
 */
export interface TraceMetadata {
  readonly agentVersion: string;
  readonly environment: string;
  readonly intent: string;
  readonly workspaceRoot: string;
  readonly totalSteps: number;
  readonly totalDurationMs: number;
  readonly custom: Readonly<Record<string, unknown>>;
}

/**
 * Options for starting a span.
 */
export interface SpanOptions {
  readonly parentId?: UniqueId;
  readonly type?: SpanType;
  readonly phase?: AgentPhase;
  readonly stepNumber?: number;
  readonly attributes?: Record<string, unknown>;
}

/**
 * Records execution traces for debugging and analysis.
 * 
 * @example
 * ```typescript
 * const tracer = new TraceRecorder(sessionId);
 * 
 * const spanId = tracer.startSpan('planning', { type: SpanType.PLANNING });
 * // ... do planning work ...
 * tracer.endSpan(spanId, SpanStatus.OK);
 * 
 * const trace = tracer.finalize(true);
 * ```
 */
export class TraceRecorder {
  private readonly traceId: UniqueId;
  private readonly sessionId: UniqueId;
  private readonly spans: Map<UniqueId, TraceSpan>;
  private readonly contextSnapshots: ContextSnapshot[];
  private readonly startedAt: Timestamp;
  private currentStepNumber: number;
  private readonly activeSpanStack: UniqueId[];

  constructor(sessionId: UniqueId) {
    this.traceId = createUniqueId(uuidv4());
    this.sessionId = sessionId;
    this.spans = new Map();
    this.contextSnapshots = [];
    this.startedAt = createTimestamp();
    this.currentStepNumber = 0;
    this.activeSpanStack = [];
  }

  /**
   * Gets the trace ID.
   */
  getTraceId(): UniqueId {
    return this.traceId;
  }

  /**
   * Sets the current step number for new spans.
   */
  setStepNumber(step: number): void {
    this.currentStepNumber = step;
  }

  /**
   * Starts a new span.
   * 
   * @param name - Name of the operation
   * @param options - Span options
   * @returns The span ID
   */
  startSpan(name: string, options: SpanOptions = {}): UniqueId {
    const spanId = createUniqueId(uuidv4());
    const now = createTimestamp();
    
    // Use parent from options or current active span
    const parentId = options.parentId ?? 
      (this.activeSpanStack.length > 0 
        ? this.activeSpanStack[this.activeSpanStack.length - 1] 
        : null);

    const span: TraceSpan = {
      id: spanId,
      parentId: parentId ?? null,
      name,
      type: options.type ?? SpanType.CUSTOM,
      startedAt: now,
      endedAt: null,
      durationMs: null,
      status: SpanStatus.RUNNING,
      phase: options.phase ?? null,
      stepNumber: options.stepNumber ?? this.currentStepNumber,
      attributes: options.attributes ?? {},
      events: [],
    };

    this.spans.set(spanId, span);
    this.activeSpanStack.push(spanId);

    return spanId;
  }

  /**
   * Adds an event to a span.
   * 
   * @param spanId - The span to add event to
   * @param name - Event name
   * @param attributes - Event attributes
   */
  addEvent(
    spanId: UniqueId,
    name: string,
    attributes: Record<string, unknown> = {},
  ): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    const event: SpanEvent = {
      name,
      timestamp: createTimestamp(),
      attributes,
    };

    // Create updated span with new event
    const updatedSpan: TraceSpan = {
      ...span,
      events: [...span.events, event],
    };
    
    this.spans.set(spanId, updatedSpan);
  }

  /**
   * Sets attributes on a span.
   * 
   * @param spanId - The span to update
   * @param attributes - Attributes to set
   */
  setAttributes(spanId: UniqueId, attributes: Record<string, unknown>): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    const updatedSpan: TraceSpan = {
      ...span,
      attributes: { ...span.attributes, ...attributes },
    };
    
    this.spans.set(spanId, updatedSpan);
  }

  /**
   * Ends a span.
   * 
   * @param spanId - The span to end
   * @param status - Final status
   * @param attributes - Optional final attributes
   */
  endSpan(
    spanId: UniqueId,
    status: SpanStatus = SpanStatus.OK,
    attributes?: Record<string, unknown>,
  ): void {
    const span = this.spans.get(spanId);
    if (!span || span.endedAt !== null) return;

    const now = createTimestamp();
    const durationMs = (now as number) - (span.startedAt as number);

    const updatedSpan: TraceSpan = {
      ...span,
      endedAt: now,
      durationMs,
      status,
      attributes: attributes 
        ? { ...span.attributes, ...attributes }
        : span.attributes,
    };
    
    this.spans.set(spanId, updatedSpan);

    // Remove from active stack
    const stackIndex = this.activeSpanStack.indexOf(spanId);
    if (stackIndex !== -1) {
      this.activeSpanStack.splice(stackIndex, 1);
    }
  }

  /**
   * Captures a context snapshot.
   * 
   * @param context - The context to snapshot
   */
  captureContext(context: MCPContext): void {
    const snapshot: ContextSnapshot = {
      id: createUniqueId(uuidv4()),
      contextVersion: context.version,
      capturedAt: createTimestamp(),
      stepNumber: this.currentStepNumber,
      context,
    };
    
    this.contextSnapshots.push(snapshot);
  }

  /**
   * Finalizes the trace.
   * 
   * @param success - Whether execution succeeded
   * @param metadata - Additional metadata
   * @returns The complete trace
   */
  finalize(
    success: boolean,
    metadata: Partial<TraceMetadata> = {},
  ): ExecutionTrace {
    const now = createTimestamp();
    const durationMs = (now as number) - (this.startedAt as number);

    // End any remaining active spans (copy array since endSpan modifies it)
    const spansToEnd = [...this.activeSpanStack];
    for (const spanId of spansToEnd) {
      this.endSpan(spanId, success ? SpanStatus.OK : SpanStatus.ERROR);
    }

    const fullMetadata: TraceMetadata = {
      agentVersion: '0.1.0',
      environment: process.env['NODE_ENV'] ?? 'development',
      intent: metadata.intent ?? 'unknown',
      workspaceRoot: metadata.workspaceRoot ?? 'unknown',
      totalSteps: this.currentStepNumber,
      totalDurationMs: durationMs,
      custom: metadata.custom ?? {},
    };

    return {
      id: this.traceId,
      sessionId: this.sessionId,
      version: '1.0',
      startedAt: this.startedAt,
      endedAt: now,
      success,
      spans: Array.from(this.spans.values()),
      contextSnapshots: [...this.contextSnapshots],
      metadata: fullMetadata,
    };
  }

  /**
   * Gets spans for analysis.
   */
  getSpans(): ReadonlyArray<TraceSpan> {
    return Array.from(this.spans.values());
  }

  /**
   * Gets the currently active span, if any.
   */
  getActiveSpan(): TraceSpan | null {
    if (this.activeSpanStack.length === 0) return null;
    const activeId = this.activeSpanStack[this.activeSpanStack.length - 1];
    return this.spans.get(activeId!) ?? null;
  }
}

/**
 * Utility to create a traced operation.
 * Automatically starts and ends a span around the operation.
 */
export async function traced<T>(
  tracer: TraceRecorder,
  name: string,
  options: SpanOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const spanId = tracer.startSpan(name, options);
  
  try {
    const result = await operation();
    tracer.endSpan(spanId, SpanStatus.OK);
    return result;
  } catch (error) {
    tracer.addEvent(spanId, 'error', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    tracer.endSpan(spanId, SpanStatus.ERROR);
    throw error;
  }
}
