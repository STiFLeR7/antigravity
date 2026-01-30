/**
 * @fileoverview Main entry point for Antigravity.
 * 
 * Antigravity is an MCP-backed agent runtime designed for OrchidsAI IDE.
 * It provides a disciplined, auditable system for autonomous interaction
 * with development environments.
 * 
 * @module @orchidsai/antigravity
 * @version 0.1.0
 * 
 * @example
 * ```typescript
 * import {
 *   DecisionLoop,
 *   ToolRegistry,
 *   ContextManager,
 *   filesystemTools,
 *   createLogger,
 * } from '@orchidsai/antigravity';
 * 
 * // Setup
 * const registry = new ToolRegistry({
 *   grantedPermissions: ['FILE_READ', 'FILE_WRITE'],
 * });
 * filesystemTools.forEach(tool => registry.register(tool));
 * 
 * // Create and run agent
 * const loop = new DecisionLoop(config, registry);
 * const result = await loop.run(intent, workspace);
 * ```
 */

// ============ Core Types ============
export {
  // Identifiers
  type UniqueId,
  type Timestamp,
  createUniqueId,
  createTimestamp,
  
  // Enums
  AgentPhase,
  ActionOutcome,
  Priority,
  Severity,
  
  // Core interfaces
  type UserIntent,
  type WorkspaceMetadata,
  type TextRange,
  type ToolResult,
  type ToolError,
  type AgentStep,
  type ToolInvocation,
  type AgentConfig,
  DEFAULT_AGENT_CONFIG,
} from './types/index.js';

// ============ MCP Types ============
export {
  // Context types
  type MCPContext,
  type MemoryReference,
  MemoryType,
  type ContextFact,
  FactCategory,
  type ExecutionConstraint,
  ConstraintType,
  
  // Plan types
  type ExecutionPlan,
  type PlannedAction,
  PlannedActionStatus,
  
  // Message types
  type MCPMessage,
  MCPMessageType,
  type MCPSchema,
} from './types/index.js';

// ============ Tool Types ============
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
  validationSuccess,
  validationFailure,
} from './types/index.js';

// ============ MCP Runtime ============
export {
  ContextManager,
  createMinimalIntent,
  createMinimalWorkspace,
  type CreateContextOptions,
  type UpdateContextOptions,
} from './mcp/index.js';

export {
  ToolRegistry,
  DEFAULT_REGISTRY_CONFIG,
  type ToolRegistryConfig,
  type ToolRegistryEvents,
} from './mcp/index.js';

// ============ Agent Runtime ============
export {
  LifecycleController,
  createLifecycle,
  type LifecycleEvents,
  type PhaseMetadata,
  type LifecycleError,
  type LifecycleState,
  type PhaseHistoryEntry,
} from './agent/index.js';

export {
  DecisionLoop,
  createSimplePlanner,
  createSimpleReflector,
  type DecisionLoopEvents,
  type DecisionLoopConfig,
  type Planner,
  type Reflector,
  type ReflectionResult,
  type ReflectionAdjustment,
  type LoopResult,
} from './agent/index.js';

// ============ Observability ============
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
} from './observability/index.js';

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
} from './observability/index.js';

// ============ Built-in Tools ============
export {
  listDirectoryTool,
  readFileTool,
  writeFileTool,
  filesystemTools,
} from './tools/index.js';

// ============ Providers (Multi-LLM Support) ============
export {
  // Base
  LLMProvider,
  BaseProvider,
  zodToJsonSchema,
  type ProviderConfig,
  type ToolCallRequest,
  type ToolCallResponse,
  type UniversalToolSchema,
  type JSONSchemaProperty,
  
  // Claude
  ClaudeProvider,
  createClaudeProvider,
  type MCPTool,
  type MCPToolCall,
  type MCPToolResult,
  
  // OpenAI
  OpenAIProvider,
  createOpenAIProvider,
  createAzureOpenAIProvider,
  type OpenAITool,
  type OpenAIToolCall,
  type OpenAIToolResult,
  
  // Gemini
  GeminiProvider,
  createGeminiProvider,
  createVertexAIProvider,
  type GeminiTool,
  type GeminiFunctionCall,
  type GeminiFunctionResponse,
  
  // Factory
  createProvider,
  getSupportedProviders,
} from './providers/index.js';

// ============ Server ============
export {
  UnifiedServer,
  startUnifiedServer,
  type UnifiedServerConfig,
  type UnifiedServerEvents,
} from './server/index.js';

// ============ Version Info ============
export const VERSION = '0.2.0';
export const MCP_SCHEMA_VERSION = '1.0';
