/**
 * @fileoverview Public type exports for Antigravity.
 * 
 * This module re-exports all public types from the types directory,
 * providing a single import point for consumers.
 * 
 * @module @orchidsai/antigravity/types
 * @version 0.1.0
 */

// Core types
export {
  type UniqueId,
  type Timestamp,
  AgentPhase,
  ActionOutcome,
  Priority,
  Severity,
  type UserIntent,
  type WorkspaceMetadata,
  type TextRange,
  type ToolResult,
  type ToolError,
  type AgentStep,
  type ToolInvocation,
  type AgentConfig,
  createUniqueId,
  createTimestamp,
  DEFAULT_AGENT_CONFIG,
} from './core.types.js';

// MCP types
export {
  type MCPContext,
  type MemoryReference,
  MemoryType,
  type ContextFact,
  FactCategory,
  type ExecutionConstraint,
  ConstraintType,
  type ExecutionPlan,
  type PlannedAction,
  PlannedActionStatus,
  type MCPMessage,
  MCPMessageType,
  type MCPSchema,
} from './mcp.types.js';

// Tool types
export {
  type ToolDefinition,
  ToolCategory,
  ToolPermission,
  type ToolExecutor,
  type ToolValidator,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ToolExecutionContext,
  type ExecutionLogger,
  type ToolRegistryEntry,
  type ToolInvocationRequest,
  ToolPermissionSchema,
  ToolCategorySchema,
  ValidationErrorSchema,
  ValidationResultSchema,
  validationSuccess,
  validationFailure,
} from './tools.types.js';
