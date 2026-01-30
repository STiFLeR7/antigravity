/**
 * @fileoverview Tool Registry - Central registry for tool management.
 * 
 * The Tool Registry maintains all available tools, handles registration,
 * validation, and provides lookup capabilities. It enforces tool contracts
 * and tracks usage metrics.
 * 
 * @module @orchidsai/antigravity/mcp/tool-registry
 * @version 0.1.0
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'eventemitter3';
import type {
  UniqueId,
  ToolResult,
  ToolError,
} from '../types/core.types.js';
import { createUniqueId, createTimestamp } from '../types/core.types.js';
import type { MCPContext } from '../types/mcp.types.js';
import type {
  ToolDefinition,
  ToolCategory,
  ToolPermission,
  ToolRegistryEntry,
  ToolInvocationRequest,
  ToolExecutionContext,
  ValidationResult,
  ExecutionLogger,
} from '../types/tools.types.js';
import { validationSuccess } from '../types/tools.types.js';

/**
 * Events emitted by the Tool Registry.
 */
export interface ToolRegistryEvents {
  'tool:registered': (entry: ToolRegistryEntry) => void;
  'tool:unregistered': (toolId: string) => void;
  'tool:invoked': (toolId: string, executionId: UniqueId) => void;
  'tool:completed': (toolId: string, executionId: UniqueId, result: ToolResult) => void;
  'tool:failed': (toolId: string, executionId: UniqueId, error: ToolError) => void;
}

/**
 * Configuration for the Tool Registry.
 */
export interface ToolRegistryConfig {
  /** Default timeout for tool execution */
  readonly defaultTimeoutMs: number;
  
  /** Whether to enforce strict schema validation */
  readonly strictValidation: boolean;
  
  /** Categories that are allowed */
  readonly allowedCategories: ReadonlyArray<ToolCategory>;
  
  /** Permissions that are granted */
  readonly grantedPermissions: ReadonlyArray<ToolPermission>;
}

/**
 * Default registry configuration.
 */
export const DEFAULT_REGISTRY_CONFIG: ToolRegistryConfig = {
  defaultTimeoutMs: 30_000,
  strictValidation: true,
  allowedCategories: [],
  grantedPermissions: [],
};

/**
 * Central registry for tool management.
 * 
 * The registry is the single source of truth for available tools.
 * It handles:
 * - Tool registration and unregistration
 * - Permission checking
 * - Invocation dispatching
 * - Usage metrics tracking
 * 
 * @example
 * ```typescript
 * const registry = new ToolRegistry(config);
 * registry.register(readFileTool);
 * const result = await registry.invoke({
 *   toolId: 'filesystem.read',
 *   input: { path: './src/index.ts' },
 *   context: mcpContext,
 * });
 * ```
 */
export class ToolRegistry extends EventEmitter<ToolRegistryEvents> {
  private readonly tools: Map<string, ToolRegistryEntry>;
  private readonly config: ToolRegistryConfig;

  constructor(config: Partial<ToolRegistryConfig> = {}) {
    super();
    this.tools = new Map();
    this.config = { ...DEFAULT_REGISTRY_CONFIG, ...config };
  }

  /**
   * Registers a new tool with the registry.
   * 
   * @param definition - The tool definition to register
   * @throws Error if tool ID is already registered
   */
  register<TInput, TOutput>(definition: ToolDefinition<TInput, TOutput>): void {
    if (this.tools.has(definition.id)) {
      throw new Error(`Tool with ID '${definition.id}' is already registered`);
    }

    // Validate category is allowed
    if (
      this.config.allowedCategories.length > 0 &&
      !this.config.allowedCategories.includes(definition.category)
    ) {
      throw new Error(
        `Tool category '${definition.category}' is not allowed. ` +
        `Allowed categories: ${this.config.allowedCategories.join(', ')}`
      );
    }

    const entry: ToolRegistryEntry = {
      definition,
      registeredAt: createTimestamp(),
      enabled: true,
      invocationCount: 0,
      lastInvokedAt: null,
      averageDurationMs: 0,
    };

    this.tools.set(definition.id, entry);
    this.emit('tool:registered', entry);
  }

  /**
   * Unregisters a tool from the registry.
   * 
   * @param toolId - The ID of the tool to unregister
   * @returns true if the tool was unregistered, false if not found
   */
  unregister(toolId: string): boolean {
    const existed = this.tools.delete(toolId);
    if (existed) {
      this.emit('tool:unregistered', toolId);
    }
    return existed;
  }

  /**
   * Gets a tool definition by ID.
   * 
   * @param toolId - The tool ID to look up
   * @returns The tool definition or null if not found
   */
  get(toolId: string): ToolDefinition | null {
    const entry = this.tools.get(toolId);
    return entry?.definition ?? null;
  }

  /**
   * Checks if a tool is registered and enabled.
   * 
   * @param toolId - The tool ID to check
   */
  has(toolId: string): boolean {
    const entry = this.tools.get(toolId);
    return entry !== undefined && entry.enabled;
  }

  /**
   * Lists all registered tools.
   * 
   * @param category - Optional category filter
   */
  list(category?: ToolCategory): ReadonlyArray<ToolDefinition> {
    const definitions: ToolDefinition[] = [];
    
    for (const entry of this.tools.values()) {
      if (!entry.enabled) continue;
      if (category !== undefined && entry.definition.category !== category) continue;
      definitions.push(entry.definition);
    }
    
    return definitions;
  }

  /**
   * Enables or disables a tool.
   * 
   * @param toolId - The tool ID
   * @param enabled - Whether to enable or disable
   */
  setEnabled(toolId: string, enabled: boolean): void {
    const entry = this.tools.get(toolId);
    if (entry) {
      // Create a new entry to maintain immutability principles
      this.tools.set(toolId, { ...entry, enabled });
    }
  }

  /**
   * Invokes a tool with the given request.
   * 
   * @param request - The invocation request
   * @returns The tool result
   */
  async invoke(request: ToolInvocationRequest): Promise<ToolResult> {
    const executionId = createUniqueId(uuidv4());
    const startTime = Date.now();

    const entry = this.tools.get(request.toolId);
    
    // Check tool exists
    if (!entry) {
      return this.createErrorResult(
        executionId,
        request.toolId,
        'TOOL_NOT_FOUND',
        `Tool '${request.toolId}' is not registered`,
        false,
        Date.now() - startTime,
      );
    }

    // Check tool is enabled
    if (!entry.enabled) {
      return this.createErrorResult(
        executionId,
        request.toolId,
        'TOOL_DISABLED',
        `Tool '${request.toolId}' is currently disabled`,
        true,
        Date.now() - startTime,
      );
    }

    const definition = entry.definition;

    // Check permissions
    const permissionCheck = this.checkPermissions(definition.permissions);
    if (!permissionCheck.valid) {
      return this.createErrorResult(
        executionId,
        request.toolId,
        'PERMISSION_DENIED',
        `Missing permissions: ${permissionCheck.missing.join(', ')}`,
        false,
        Date.now() - startTime,
      );
    }

    // Validate input
    if (request.skipValidation !== true) {
      const validation = await this.validateInput(definition, request.input, request.context);
      if (!validation.valid) {
        return this.createErrorResult(
          executionId,
          request.toolId,
          'VALIDATION_FAILED',
          `Input validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
          true,
          Date.now() - startTime,
        );
      }
    }

    // Prepare execution context
    const execContext = this.createExecutionContext(
      executionId,
      request.context,
    );

    this.emit('tool:invoked', request.toolId, executionId);

    // Execute with timeout
    const timeoutMs = request.timeoutMs ?? this.config.defaultTimeoutMs;
    
    try {
      const result = await this.executeWithTimeout(
        definition,
        request.input,
        execContext,
        timeoutMs,
      );

      // Update metrics
      this.updateMetrics(entry, Date.now() - startTime);
      
      this.emit('tool:completed', request.toolId, executionId, result);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorResult = this.createErrorResult(
        executionId,
        request.toolId,
        'EXECUTION_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
        true,
        duration,
      );
      
      this.emit('tool:failed', request.toolId, executionId, errorResult.error!);
      
      return errorResult;
    }
  }

  /**
   * Gets metrics for a specific tool.
   */
  getMetrics(toolId: string): ToolRegistryEntry | null {
    return this.tools.get(toolId) ?? null;
  }

  // ============ Private Methods ============

  private checkPermissions(required: ReadonlyArray<ToolPermission>): {
    valid: boolean;
    missing: ToolPermission[];
  } {
    const missing: ToolPermission[] = [];
    
    for (const permission of required) {
      if (!this.config.grantedPermissions.includes(permission)) {
        missing.push(permission);
      }
    }
    
    return {
      valid: missing.length === 0,
      missing,
    };
  }

  private validateInput(
    definition: ToolDefinition,
    input: unknown,
    context: MCPContext,
  ): Promise<ValidationResult> {
    // If tool has custom validator, use it
    if (definition.validate) {
      return Promise.resolve(definition.validate(input, context));
    }
    
    // Otherwise, rely on schema validation (to be implemented with zod)
    // For now, return success
    return Promise.resolve(validationSuccess());
  }

  private createExecutionContext(
    executionId: UniqueId,
    mcpContext: MCPContext,
  ): ToolExecutionContext {
    const logger: ExecutionLogger = {
      debug: (msg, data) => console.debug(`[${executionId}] ${msg}`, data),
      info: (msg, data) => console.info(`[${executionId}] ${msg}`, data),
      warn: (msg, data) => console.warn(`[${executionId}] ${msg}`, data),
      error: (msg, data) => console.error(`[${executionId}] ${msg}`, data),
    };

    const abortController = new AbortController();

    return {
      mcpContext,
      executionId,
      workspaceRoot: mcpContext.workspace.rootPath,
      allowedPaths: [mcpContext.workspace.rootPath],
      abortSignal: abortController.signal,
      logger,
      dryRun: false,
    };
  }

  private async executeWithTimeout<TInput, TOutput>(
    definition: ToolDefinition<TInput, TOutput>,
    input: TInput,
    context: ToolExecutionContext,
    timeoutMs: number,
  ): Promise<ToolResult<TOutput>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      definition.execute(input, context)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private createErrorResult(
    executionId: UniqueId,
    toolId: string,
    code: string,
    message: string,
    recoverable: boolean,
    durationMs: number,
  ): ToolResult {
    return {
      id: executionId,
      toolId,
      success: false,
      data: null,
      error: {
        code,
        message,
        recoverable,
        suggestions: [],
      },
      durationMs,
      completedAt: createTimestamp(),
    };
  }

  private updateMetrics(entry: ToolRegistryEntry, durationMs: number): void {
    const newCount = entry.invocationCount + 1;
    const newAverage = 
      (entry.averageDurationMs * entry.invocationCount + durationMs) / newCount;
    
    this.tools.set(entry.definition.id, {
      ...entry,
      invocationCount: newCount,
      lastInvokedAt: createTimestamp(),
      averageDurationMs: newAverage,
    });
  }
}
