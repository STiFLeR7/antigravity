/**
 * @fileoverview MCP Context Manager - Core context handling for agent operations.
 * 
 * The Context Manager is responsible for creating, updating, and querying
 * the MCP context. It enforces immutability and tracks context evolution
 * throughout the agent lifecycle.
 * 
 * @module @orchidsai/antigravity/mcp/context-manager
 * @version 0.1.0
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  UniqueId,
  UserIntent,
  WorkspaceMetadata,
  ToolResult,
} from '../types/core.types.js';
import { createUniqueId, createTimestamp } from '../types/core.types.js';
import type {
  MCPContext,
  MemoryReference,
  ContextFact,
  ExecutionConstraint,
  ExecutionPlan,
} from '../types/mcp.types.js';

/**
 * Options for creating a new context.
 */
export interface CreateContextOptions {
  readonly sessionId: UniqueId;
  readonly intent: UserIntent;
  readonly workspace: WorkspaceMetadata;
  readonly memoryRefs?: ReadonlyArray<MemoryReference>;
  readonly constraints?: ReadonlyArray<ExecutionConstraint>;
}

/**
 * Options for updating an existing context.
 */
export interface UpdateContextOptions {
  readonly memoryRefs?: ReadonlyArray<MemoryReference>;
  readonly addResults?: ReadonlyArray<ToolResult>;
  readonly addFacts?: ReadonlyArray<ContextFact>;
  readonly addConstraints?: ReadonlyArray<ExecutionConstraint>;
  readonly plan?: ExecutionPlan | null;
  readonly workspace?: Partial<WorkspaceMetadata>;
}

/**
 * Manages MCP context instances with immutable updates.
 * 
 * The ContextManager follows these principles:
 * 1. All updates create new context instances (immutability)
 * 2. Version numbers track context evolution
 * 3. History is preserved for debugging and replay
 * 
 * @example
 * ```typescript
 * const manager = new ContextManager();
 * const ctx = manager.create({ sessionId, intent, workspace });
 * const updated = manager.update(ctx, { addFacts: [newFact] });
 * ```
 */
export class ContextManager {
  /** Maximum number of recent results to retain */
  private readonly maxRecentResults: number;
  
  /** Context history for replay/debugging */
  private readonly history: Map<UniqueId, MCPContext[]>;

  constructor(options: { maxRecentResults?: number } = {}) {
    this.maxRecentResults = options.maxRecentResults ?? 10;
    this.history = new Map();
  }

  /**
   * Creates a new MCP context with the given options.
   * 
   * @param options - Configuration for the new context
   * @returns A fresh MCPContext instance
   */
  create(options: CreateContextOptions): MCPContext {
    const now = createTimestamp();
    const contextId = createUniqueId(uuidv4());

    const context: MCPContext = {
      id: contextId,
      sessionId: options.sessionId,
      version: 1,
      intent: options.intent,
      workspace: options.workspace,
      memoryRefs: options.memoryRefs ?? [],
      recentResults: [],
      activePlan: null,
      facts: [],
      constraints: options.constraints ?? [],
      createdAt: now,
      updatedAt: now,
    };

    // Initialize history for this session
    this.initializeHistory(options.sessionId, context);

    return context;
  }

  /**
   * Creates an updated context with new data.
   * 
   * @param current - The current context to update
   * @param updates - The updates to apply
   * @returns A new MCPContext with updates applied
   */
  update(current: MCPContext, updates: UpdateContextOptions): MCPContext {
    const now = createTimestamp();
    const newContextId = createUniqueId(uuidv4());

    // Merge recent results, keeping only the most recent
    const mergedResults = this.mergeResults(
      current.recentResults,
      updates.addResults ?? [],
    );

    // Merge facts, avoiding duplicates
    const mergedFacts = this.mergeFacts(
      current.facts,
      updates.addFacts ?? [],
    );

    // Merge constraints
    const mergedConstraints = this.mergeConstraints(
      current.constraints,
      updates.addConstraints ?? [],
    );

    // Merge workspace updates
    const updatedWorkspace = updates.workspace
      ? this.mergeWorkspace(current.workspace, updates.workspace)
      : current.workspace;

    const updated: MCPContext = {
      id: newContextId,
      sessionId: current.sessionId,
      version: current.version + 1,
      intent: current.intent,
      workspace: updatedWorkspace,
      memoryRefs: updates.memoryRefs ?? current.memoryRefs,
      recentResults: mergedResults,
      activePlan: updates.plan !== undefined ? updates.plan : current.activePlan,
      facts: mergedFacts,
      constraints: mergedConstraints,
      createdAt: current.createdAt,
      updatedAt: now,
    };

    // Record in history
    this.recordHistory(current.sessionId, updated);

    return updated;
  }

  /**
   * Retrieves the context history for a session.
   * 
   * @param sessionId - The session to get history for
   * @returns Array of historical contexts, oldest first
   */
  getHistory(sessionId: UniqueId): ReadonlyArray<MCPContext> {
    return this.history.get(sessionId) ?? [];
  }

  /**
   * Gets a specific version of context from history.
   * 
   * @param sessionId - The session ID
   * @param version - The version number to retrieve
   * @returns The context at that version, or null if not found
   */
  getVersion(sessionId: UniqueId, version: number): MCPContext | null {
    const sessionHistory = this.history.get(sessionId);
    if (!sessionHistory) return null;
    
    return sessionHistory.find(ctx => ctx.version === version) ?? null;
  }

  /**
   * Clears history for a session.
   * 
   * @param sessionId - The session to clear
   */
  clearHistory(sessionId: UniqueId): void {
    this.history.delete(sessionId);
  }

  /**
   * Queries facts from context by category.
   * 
   * @param context - The context to query
   * @param category - Optional category filter
   * @returns Matching facts
   */
  queryFacts(
    context: MCPContext,
    category?: string,
  ): ReadonlyArray<ContextFact> {
    if (category === undefined || category === null) return context.facts;
    
    return context.facts.filter(fact => String(fact.category) === category);
  }

  /**
   * Checks if a constraint applies to a given operation.
   * 
   * @param context - The context to check
   * @param _operationType - Type of operation being performed (reserved for future use)
   * @returns Relevant constraints
   */
  findApplicableConstraints(
    context: MCPContext,
    _operationType: string,
  ): ReadonlyArray<ExecutionConstraint> {
    // For now, return all mandatory constraints
    // In the future, this could be more sophisticated
    return context.constraints.filter(c => c.mandatory);
  }

  // ============ Private Methods ============

  private initializeHistory(sessionId: UniqueId, context: MCPContext): void {
    this.history.set(sessionId, [context]);
  }

  private recordHistory(sessionId: UniqueId, context: MCPContext): void {
    const sessionHistory = this.history.get(sessionId);
    if (sessionHistory) {
      sessionHistory.push(context);
    } else {
      this.history.set(sessionId, [context]);
    }
  }

  private mergeResults(
    existing: ReadonlyArray<ToolResult>,
    additions: ReadonlyArray<ToolResult>,
  ): ReadonlyArray<ToolResult> {
    const combined = [...existing, ...additions];
    
    // Keep only the most recent results
    if (combined.length > this.maxRecentResults) {
      return combined.slice(-this.maxRecentResults);
    }
    
    return combined;
  }

  private mergeFacts(
    existing: ReadonlyArray<ContextFact>,
    additions: ReadonlyArray<ContextFact>,
  ): ReadonlyArray<ContextFact> {
    // Use a map to deduplicate by statement
    const factMap = new Map<string, ContextFact>();
    
    for (const fact of existing) {
      factMap.set(fact.statement, fact);
    }
    
    for (const fact of additions) {
      // New facts override existing ones with same statement
      factMap.set(fact.statement, fact);
    }
    
    return Array.from(factMap.values());
  }

  private mergeConstraints(
    existing: ReadonlyArray<ExecutionConstraint>,
    additions: ReadonlyArray<ExecutionConstraint>,
  ): ReadonlyArray<ExecutionConstraint> {
    // Use a map to deduplicate by ID
    const constraintMap = new Map<UniqueId, ExecutionConstraint>();
    
    for (const constraint of existing) {
      constraintMap.set(constraint.id, constraint);
    }
    
    for (const constraint of additions) {
      constraintMap.set(constraint.id, constraint);
    }
    
    return Array.from(constraintMap.values());
  }

  private mergeWorkspace(
    existing: WorkspaceMetadata,
    updates: Partial<WorkspaceMetadata>,
  ): WorkspaceMetadata {
    return {
      rootPath: updates.rootPath ?? existing.rootPath,
      projectType: updates.projectType ?? existing.projectType,
      frameworks: updates.frameworks ?? existing.frameworks,
      activeFile: updates.activeFile ?? existing.activeFile,
      selection: updates.selection ?? existing.selection,
      gitBranch: updates.gitBranch ?? existing.gitBranch,
      hasUncommittedChanges: updates.hasUncommittedChanges ?? existing.hasUncommittedChanges,
      scannedAt: updates.scannedAt ?? existing.scannedAt,
    };
  }
}

/**
 * Creates a minimal user intent for testing or simple scenarios.
 */
export function createMinimalIntent(rawInput: string): UserIntent {
  return {
    rawInput,
    action: 'unknown',
    target: null,
    constraints: [],
    confidence: 0.5,
    capturedAt: createTimestamp(),
  };
}

/**
 * Creates minimal workspace metadata for testing.
 */
export function createMinimalWorkspace(rootPath: string): WorkspaceMetadata {
  return {
    rootPath,
    projectType: null,
    frameworks: [],
    activeFile: null,
    selection: null,
    gitBranch: null,
    hasUncommittedChanges: false,
    scannedAt: createTimestamp(),
  };
}
