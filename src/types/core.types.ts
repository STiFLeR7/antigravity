/**
 * @fileoverview Core type definitions for Antigravity agent runtime.
 * 
 * These types form the foundational vocabulary of the system. Every component
 * in Antigravity references these primitives to ensure type safety and
 * consistent data flow across the agent lifecycle.
 * 
 * @module @orchidsai/antigravity/types
 * @version 0.1.0
 */

/**
 * Unique identifier type used throughout the system.
 * Format: UUID v4 string for global uniqueness.
 */
export type UniqueId = string & { readonly __brand: 'UniqueId' };

/**
 * Unix timestamp in milliseconds.
 * Used for all temporal operations and event ordering.
 */
export type Timestamp = number & { readonly __brand: 'Timestamp' };

/**
 * Represents the current phase of agent execution.
 * 
 * The agent lifecycle follows a strict state machine:
 * IDLE → PLANNING → ACTING → OBSERVING → REFLECTING → (PLANNING | COMPLETE | FAILED)
 * 
 * @remarks
 * - IDLE: Agent is initialized but has not received a goal
 * - PLANNING: Agent is determining the next action to take
 * - ACTING: Agent is executing a tool or action
 * - OBSERVING: Agent is processing the results of an action
 * - REFLECTING: Agent is analyzing progress and deciding continuation
 * - COMPLETE: Agent has successfully achieved the goal
 * - FAILED: Agent has exhausted options or encountered unrecoverable error
 * - SUSPENDED: Agent is paused, awaiting external signal to resume
 */
export enum AgentPhase {
  IDLE = 'IDLE',
  PLANNING = 'PLANNING',
  ACTING = 'ACTING',
  OBSERVING = 'OBSERVING',
  REFLECTING = 'REFLECTING',
  COMPLETE = 'COMPLETE',
  FAILED = 'FAILED',
  SUSPENDED = 'SUSPENDED',
}

/**
 * Classification of action outcomes.
 * Used to determine the next step in the agent loop.
 */
export enum ActionOutcome {
  SUCCESS = 'SUCCESS',
  PARTIAL = 'PARTIAL',
  FAILURE = 'FAILURE',
  TIMEOUT = 'TIMEOUT',
  SKIPPED = 'SKIPPED',
}

/**
 * Priority levels for agent tasks and actions.
 * Lower numeric values indicate higher priority.
 */
export enum Priority {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
  BACKGROUND = 4,
}

/**
 * Severity levels for logging and error reporting.
 */
export enum Severity {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

/**
 * Represents a user's intent as parsed from natural language.
 * This is the semantic representation of what the user wants to achieve.
 */
export interface UserIntent {
  /** Raw input from the user */
  readonly rawInput: string;
  
  /** Parsed action verb (e.g., "create", "fix", "refactor") */
  readonly action: string;
  
  /** Target of the action (e.g., file path, function name) */
  readonly target: string | null;
  
  /** Additional constraints or requirements */
  readonly constraints: ReadonlyArray<string>;
  
  /** Confidence score of intent parsing (0.0 - 1.0) */
  readonly confidence: number;
  
  /** Timestamp when intent was captured */
  readonly capturedAt: Timestamp;
}

/**
 * Metadata about the current workspace state.
 * Provides context about the development environment.
 */
export interface WorkspaceMetadata {
  /** Absolute path to workspace root */
  readonly rootPath: string;
  
  /** Detected project type (e.g., "typescript", "python") */
  readonly projectType: string | null;
  
  /** List of detected frameworks */
  readonly frameworks: ReadonlyArray<string>;
  
  /** Active file in editor, if any */
  readonly activeFile: string | null;
  
  /** Selected text range, if any */
  readonly selection: TextRange | null;
  
  /** Git branch, if in a repository */
  readonly gitBranch: string | null;
  
  /** Whether there are uncommitted changes */
  readonly hasUncommittedChanges: boolean;
  
  /** Last scan timestamp */
  readonly scannedAt: Timestamp;
}

/**
 * Represents a range of text in a file.
 */
export interface TextRange {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

/**
 * Result from a tool execution.
 * Standardized format for all tool outputs.
 */
export interface ToolResult<T = unknown> {
  /** Unique identifier for this result */
  readonly id: UniqueId;
  
  /** ID of the tool that produced this result */
  readonly toolId: string;
  
  /** Whether execution succeeded */
  readonly success: boolean;
  
  /** The actual output data */
  readonly data: T | null;
  
  /** Error information if execution failed */
  readonly error: ToolError | null;
  
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  
  /** Timestamp when execution completed */
  readonly completedAt: Timestamp;
}

/**
 * Structured error from tool execution.
 */
export interface ToolError {
  /** Error code for programmatic handling */
  readonly code: string;
  
  /** Human-readable error message */
  readonly message: string;
  
  /** Whether this error is recoverable */
  readonly recoverable: boolean;
  
  /** Suggested recovery actions, if any */
  readonly suggestions: ReadonlyArray<string>;
  
  /** Stack trace for debugging (only in development) */
  readonly stack?: string;
}

/**
 * Represents a single step in the agent's execution history.
 * Every decision and action is recorded as a step.
 */
export interface AgentStep {
  /** Unique identifier for this step */
  readonly id: UniqueId;
  
  /** Sequential step number within the session */
  readonly stepNumber: number;
  
  /** Phase during this step */
  readonly phase: AgentPhase;
  
  /** Description of what happened in this step */
  readonly description: string;
  
  /** Reasoning that led to this step */
  readonly reasoning: string | null;
  
  /** Tool invocation, if any */
  readonly toolInvocation: ToolInvocation | null;
  
  /** Result from tool execution, if any */
  readonly result: ToolResult | null;
  
  /** Outcome classification */
  readonly outcome: ActionOutcome;
  
  /** Duration of this step in milliseconds */
  readonly durationMs: number;
  
  /** Timestamp when step started */
  readonly startedAt: Timestamp;
  
  /** Timestamp when step completed */
  readonly completedAt: Timestamp;
}

/**
 * Represents a request to invoke a tool.
 */
export interface ToolInvocation {
  /** ID of the tool to invoke */
  readonly toolId: string;
  
  /** Input parameters for the tool */
  readonly parameters: Readonly<Record<string, unknown>>;
  
  /** Why this tool was chosen */
  readonly rationale: string;
}

/**
 * Configuration options for the agent runtime.
 */
export interface AgentConfig {
  /** Maximum number of steps before forced termination */
  readonly maxSteps: number;
  
  /** Timeout for individual tool executions (ms) */
  readonly toolTimeoutMs: number;
  
  /** Timeout for the entire agent session (ms) */
  readonly sessionTimeoutMs: number;
  
  /** Whether to enable verbose logging */
  readonly verbose: boolean;
  
  /** Whether to run in dry-run mode (no side effects) */
  readonly dryRun: boolean;
  
  /** Allowed tool categories */
  readonly allowedToolCategories: ReadonlyArray<string>;
  
  /** Paths that are off-limits for file operations */
  readonly forbiddenPaths: ReadonlyArray<string>;
}

/**
 * Creates a branded UniqueId from a string.
 */
export function createUniqueId(value: string): UniqueId {
  return value as UniqueId;
}

/**
 * Creates a branded Timestamp from current time.
 */
export function createTimestamp(value?: number): Timestamp {
  return (value ?? Date.now()) as Timestamp;
}

/**
 * Default configuration for the agent runtime.
 */
export const DEFAULT_AGENT_CONFIG: Readonly<AgentConfig> = {
  maxSteps: 50,
  toolTimeoutMs: 30_000,
  sessionTimeoutMs: 300_000,
  verbose: false,
  dryRun: false,
  allowedToolCategories: ['filesystem', 'execution', 'analysis'],
  forbiddenPaths: ['/etc', '/usr', 'C:\\Windows', 'C:\\Program Files'],
} as const;
