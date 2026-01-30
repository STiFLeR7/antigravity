/**
 * @fileoverview MCP (Model Context Protocol) type definitions.
 * 
 * MCP defines the contract between the agent and its environment.
 * All context flows through MCP structures, ensuring consistent
 * data representation across the system.
 * 
 * @module @orchidsai/antigravity/types/mcp
 * @version 0.1.0
 */

import type {
  UniqueId,
  Timestamp,
  UserIntent,
  WorkspaceMetadata,
  ToolResult,
  Priority,
} from './core.types.js';

/**
 * The central context container for agent operations.
 * 
 * MCPContext is the "single source of truth" during agent execution.
 * It accumulates state as the agent progresses through its lifecycle,
 * providing a complete picture of the current situation.
 * 
 * @remarks
 * Context is immutable by convention. Updates should create new
 * context instances rather than mutating existing ones.
 */
export interface MCPContext {
  /** Unique identifier for this context instance */
  readonly id: UniqueId;
  
  /** Session ID this context belongs to */
  readonly sessionId: UniqueId;
  
  /** Version number, incremented on each update */
  readonly version: number;
  
  /** The user's original intent */
  readonly intent: UserIntent;
  
  /** Current workspace state */
  readonly workspace: WorkspaceMetadata;
  
  /** References to relevant memories */
  readonly memoryRefs: ReadonlyArray<MemoryReference>;
  
  /** Results from recent tool executions */
  readonly recentResults: ReadonlyArray<ToolResult>;
  
  /** Current plan being executed */
  readonly activePlan: ExecutionPlan | null;
  
  /** Accumulated facts discovered during execution */
  readonly facts: ReadonlyArray<ContextFact>;
  
  /** Active constraints affecting execution */
  readonly constraints: ReadonlyArray<ExecutionConstraint>;
  
  /** Timestamp when context was created */
  readonly createdAt: Timestamp;
  
  /** Timestamp of last update */
  readonly updatedAt: Timestamp;
}

/**
 * Reference to a memory entry without loading full content.
 * Used to indicate relevant memories without bloating context.
 */
export interface MemoryReference {
  /** Unique identifier of the memory */
  readonly memoryId: UniqueId;
  
  /** Type of memory (episodic, semantic, procedural) */
  readonly memoryType: MemoryType;
  
  /** Brief summary of the memory content */
  readonly summary: string;
  
  /** Relevance score to current context (0.0 - 1.0) */
  readonly relevance: number;
  
  /** When this memory was created */
  readonly createdAt: Timestamp;
}

/**
 * Classification of memory types.
 */
export enum MemoryType {
  /** Memories of specific events/sessions */
  EPISODIC = 'EPISODIC',
  
  /** Factual knowledge about the codebase */
  SEMANTIC = 'SEMANTIC',
  
  /** How-to knowledge for tasks */
  PROCEDURAL = 'PROCEDURAL',
}

/**
 * A discovered fact that enriches the context.
 * Facts are immutable truths learned during execution.
 */
export interface ContextFact {
  /** Unique identifier */
  readonly id: UniqueId;
  
  /** Category of the fact */
  readonly category: FactCategory;
  
  /** The fact statement */
  readonly statement: string;
  
  /** Confidence level (0.0 - 1.0) */
  readonly confidence: number;
  
  /** Source that established this fact */
  readonly source: string;
  
  /** When this fact was discovered */
  readonly discoveredAt: Timestamp;
}

/**
 * Categories for context facts.
 */
export enum FactCategory {
  /** Facts about code structure */
  CODE_STRUCTURE = 'CODE_STRUCTURE',
  
  /** Facts about dependencies */
  DEPENDENCY = 'DEPENDENCY',
  
  /** Facts about user preferences */
  USER_PREFERENCE = 'USER_PREFERENCE',
  
  /** Facts about system state */
  SYSTEM_STATE = 'SYSTEM_STATE',
  
  /** Facts about errors encountered */
  ERROR_PATTERN = 'ERROR_PATTERN',
  
  /** Facts discovered during exploration */
  DISCOVERY = 'DISCOVERY',
  
  /** Facts from validation/verification */
  VALIDATION = 'VALIDATION',
}

/**
 * A constraint that affects execution decisions.
 */
export interface ExecutionConstraint {
  /** Unique identifier */
  readonly id: UniqueId;
  
  /** Type of constraint */
  readonly type: ConstraintType;
  
  /** Description of the constraint */
  readonly description: string;
  
  /** Whether this constraint is mandatory */
  readonly mandatory: boolean;
  
  /** Source of this constraint */
  readonly source: 'user' | 'system' | 'inferred';
}

/**
 * Types of execution constraints.
 */
export enum ConstraintType {
  /** Must not modify certain files */
  FILE_PROTECTION = 'FILE_PROTECTION',
  
  /** Must use specific patterns/styles */
  STYLE_REQUIREMENT = 'STYLE_REQUIREMENT',
  
  /** Must complete within time limit */
  TIME_BOUND = 'TIME_BOUND',
  
  /** Must not exceed resource limits */
  RESOURCE_LIMIT = 'RESOURCE_LIMIT',
  
  /** Must maintain compatibility */
  COMPATIBILITY = 'COMPATIBILITY',
}

/**
 * Represents a planned sequence of actions.
 */
export interface ExecutionPlan {
  /** Unique identifier for this plan */
  readonly id: UniqueId;
  
  /** Human-readable description of the plan */
  readonly description: string;
  
  /** Ordered list of planned actions */
  readonly actions: ReadonlyArray<PlannedAction>;
  
  /** Index of currently executing action */
  readonly currentIndex: number;
  
  /** Overall confidence in plan success (0.0 - 1.0) */
  readonly confidence: number;
  
  /** When this plan was created */
  readonly createdAt: Timestamp;
  
  /** Whether this plan has been revised */
  readonly revision: number;
}

/**
 * A single action within an execution plan.
 */
export interface PlannedAction {
  /** Unique identifier */
  readonly id: UniqueId;
  
  /** Position in the plan (0-indexed) */
  readonly index: number;
  
  /** Tool to be invoked */
  readonly toolId: string;
  
  /** Description of what this action does */
  readonly description: string;
  
  /** Expected parameters (may be refined at execution) */
  readonly expectedParameters: Readonly<Record<string, unknown>>;
  
  /** Dependencies on previous actions */
  readonly dependsOn: ReadonlyArray<UniqueId>;
  
  /** Priority of this action */
  readonly priority: Priority;
  
  /** Execution status */
  readonly status: PlannedActionStatus;
}

/**
 * Status of a planned action.
 */
export enum PlannedActionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
}

/**
 * Represents a message in the MCP communication protocol.
 */
export interface MCPMessage {
  /** Unique message identifier */
  readonly id: UniqueId;
  
  /** Type of message */
  readonly type: MCPMessageType;
  
  /** Message payload */
  readonly payload: unknown;
  
  /** Correlation ID for request-response matching */
  readonly correlationId: UniqueId | null;
  
  /** Timestamp of message creation */
  readonly timestamp: Timestamp;
}

/**
 * Types of MCP messages.
 */
export enum MCPMessageType {
  /** Request to perform an action */
  REQUEST = 'REQUEST',
  
  /** Response to a request */
  RESPONSE = 'RESPONSE',
  
  /** One-way notification */
  NOTIFICATION = 'NOTIFICATION',
  
  /** Error message */
  ERROR = 'ERROR',
  
  /** Context update broadcast */
  CONTEXT_UPDATE = 'CONTEXT_UPDATE',
}

/**
 * Schema definition for tool inputs/outputs.
 * Based on JSON Schema with additional metadata.
 */
export interface MCPSchema {
  /** Schema identifier */
  readonly id: string;
  
  /** Schema version */
  readonly version: string;
  
  /** JSON Schema definition */
  readonly schema: Readonly<Record<string, unknown>>;
  
  /** Human-readable description */
  readonly description: string;
  
  /** Example values for documentation */
  readonly examples: ReadonlyArray<unknown>;
}
