/**
 * @fileoverview Tool contract type definitions.
 * 
 * Tools are the mechanism by which agents interact with the world.
 * Every tool must conform to these contracts to ensure consistent
 * behavior, proper validation, and safe execution.
 * 
 * @module @orchidsai/antigravity/types/tools
 * @version 0.1.0
 */

import { z } from 'zod';
import type { UniqueId, Timestamp, ToolResult } from './core.types.js';
import type { MCPContext, MCPSchema } from './mcp.types.js';

/**
 * Complete definition of a tool available to the agent.
 * 
 * Tools are self-describing units of functionality. Each tool
 * carries its own schema, permissions, and execution logic,
 * making it possible to validate and audit tool usage.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  /** Unique identifier for this tool */
  readonly id: string;
  
  /** Human-readable name */
  readonly name: string;
  
  /** Detailed description of what this tool does */
  readonly description: string;
  
  /** Category for grouping and permissions */
  readonly category: ToolCategory;
  
  /** Input parameter schema */
  readonly inputSchema: MCPSchema;
  
  /** Output schema */
  readonly outputSchema: MCPSchema;
  
  /** Required permissions to use this tool */
  readonly permissions: ReadonlyArray<ToolPermission>;
  
  /** Whether this tool has side effects */
  readonly hasSideEffects: boolean;
  
  /** Whether this tool is idempotent */
  readonly idempotent: boolean;
  
  /** Estimated execution time in milliseconds */
  readonly estimatedDurationMs: number;
  
  /** The actual execution function */
  readonly execute: ToolExecutor<TInput, TOutput>;
  
  /** Optional validation function for complex input rules */
  readonly validate?: ToolValidator<TInput>;
  
  /** Version of this tool definition */
  readonly version: string;
}

/**
 * Categories for organizing tools.
 */
export enum ToolCategory {
  /** File system operations */
  FILESYSTEM = 'FILESYSTEM',
  
  /** Code execution */
  EXECUTION = 'EXECUTION',
  
  /** Code analysis and parsing */
  ANALYSIS = 'ANALYSIS',
  
  /** Git operations */
  VERSION_CONTROL = 'VERSION_CONTROL',
  
  /** Search operations */
  SEARCH = 'SEARCH',
  
  /** External API calls */
  EXTERNAL = 'EXTERNAL',
  
  /** Memory operations */
  MEMORY = 'MEMORY',
  
  /** General utility tools */
  UTILITY = 'UTILITY',
}

/**
 * Permission types required for tool execution.
 */
export enum ToolPermission {
  /** Read files from workspace */
  FILE_READ = 'FILE_READ',
  
  /** Write files to workspace */
  FILE_WRITE = 'FILE_WRITE',
  
  /** Delete files from workspace */
  FILE_DELETE = 'FILE_DELETE',
  
  /** Execute shell commands */
  SHELL_EXECUTE = 'SHELL_EXECUTE',
  
  /** Access network resources */
  NETWORK_ACCESS = 'NETWORK_ACCESS',
  
  /** Modify git state */
  GIT_WRITE = 'GIT_WRITE',
  
  /** Access environment variables */
  ENV_ACCESS = 'ENV_ACCESS',
}

/**
 * Function signature for tool execution.
 */
export type ToolExecutor<TInput, TOutput> = (
  input: TInput,
  context: ToolExecutionContext,
) => Promise<ToolResult<TOutput>>;

/**
 * Function signature for input validation.
 */
export type ToolValidator<TInput> = (
  input: TInput,
  context: MCPContext,
) => ValidationResult;

/**
 * Result of input validation.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<ValidationError>;
  readonly warnings: ReadonlyArray<ValidationWarning>;
}

/**
 * A validation error that prevents execution.
 */
export interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly code: string;
}

/**
 * A validation warning that doesn't prevent execution.
 */
export interface ValidationWarning {
  readonly field: string;
  readonly message: string;
  readonly suggestion: string;
}

/**
 * Context provided to tool execution.
 */
export interface ToolExecutionContext {
  /** Current MCP context */
  readonly mcpContext: MCPContext;
  
  /** Unique ID for this execution */
  readonly executionId: UniqueId;
  
  /** Workspace root path */
  readonly workspaceRoot: string;
  
  /** Allowed paths for file operations */
  readonly allowedPaths: ReadonlyArray<string>;
  
  /** Signal for cancellation */
  readonly abortSignal: AbortSignal;
  
  /** Logger for this execution */
  readonly logger: ExecutionLogger;
  
  /** Whether running in dry-run mode */
  readonly dryRun: boolean;
}

/**
 * Logger interface for tool execution.
 */
export interface ExecutionLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Registry entry for a registered tool.
 */
export interface ToolRegistryEntry {
  // Using 'any' here to allow storing different generic tool types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly definition: ToolDefinition<any, any>;
  readonly registeredAt: Timestamp;
  readonly enabled: boolean;
  readonly invocationCount: number;
  readonly lastInvokedAt: Timestamp | null;
  readonly averageDurationMs: number;
}

/**
 * Request to invoke a tool through the registry.
 */
export interface ToolInvocationRequest {
  /** Tool ID to invoke */
  readonly toolId: string;
  
  /** Input parameters */
  readonly input: unknown;
  
  /** Requesting context */
  readonly context: MCPContext;
  
  /** Optional timeout override */
  readonly timeoutMs?: number;
  
  /** Whether to skip validation */
  readonly skipValidation?: boolean;
}

/**
 * Zod schemas for runtime validation.
 * These provide type-safe validation at runtime boundaries.
 */

export const ToolPermissionSchema = z.nativeEnum(ToolPermission);

export const ToolCategorySchema = z.nativeEnum(ToolCategory);

export const ValidationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string(),
});

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(ValidationErrorSchema),
  warnings: z.array(z.object({
    field: z.string(),
    message: z.string(),
    suggestion: z.string(),
  })),
});

/**
 * Helper to create a successful validation result.
 */
export function validationSuccess(): ValidationResult {
  return {
    valid: true,
    errors: [],
    warnings: [],
  };
}

/**
 * Helper to create a failed validation result.
 */
export function validationFailure(errors: ValidationError[]): ValidationResult {
  return {
    valid: false,
    errors,
    warnings: [],
  };
}
