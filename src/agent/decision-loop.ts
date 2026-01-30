/**
 * @fileoverview Agent Decision Loop - Core execution engine for the agent.
 * 
 * The decision loop is the heart of Antigravity. It orchestrates the
 * Goal → Plan → Act → Observe → Reflect → Continue cycle, coordinating
 * between the lifecycle controller, context manager, and tool registry.
 * 
 * Design Principles:
 * 1. Deterministic - Same inputs produce same outputs
 * 2. Observable - Every decision is logged and traceable
 * 3. Interruptible - Can be paused and resumed
 * 4. Bounded - Enforces step limits and timeouts
 * 
 * @module @orchidsai/antigravity/agent/decision-loop
 * @version 0.1.0
 */

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import type {
  UniqueId,
  Timestamp,
  AgentConfig,
  AgentStep,
  ToolResult,
  ToolInvocation,
  UserIntent,
  WorkspaceMetadata,
} from '../types/core.types.js';
import {
  AgentPhase,
  ActionOutcome,
  createUniqueId,
  createTimestamp,
} from '../types/core.types.js';
import type { MCPContext, ExecutionPlan, PlannedAction } from '../types/mcp.types.js';
import { PlannedActionStatus } from '../types/mcp.types.js';
import { LifecycleController, createLifecycle } from './lifecycle.js';
import { ContextManager } from '../mcp/context-manager.js';
import { ToolRegistry } from '../mcp/tool-registry.js';

/**
 * Events emitted by the decision loop.
 */
export interface DecisionLoopEvents {
  'loop:start': (sessionId: UniqueId, intent: UserIntent) => void;
  'loop:step': (step: AgentStep) => void;
  'loop:complete': (sessionId: UniqueId, steps: ReadonlyArray<AgentStep>) => void;
  'loop:failed': (sessionId: UniqueId, reason: string, steps: ReadonlyArray<AgentStep>) => void;
  'loop:suspended': (sessionId: UniqueId) => void;
  'planning:start': (stepNumber: number) => void;
  'planning:complete': (plan: ExecutionPlan) => void;
  'action:start': (action: PlannedAction) => void;
  'action:complete': (action: PlannedAction, result: ToolResult) => void;
  'reflection:start': (stepNumber: number) => void;
  'reflection:complete': (shouldContinue: boolean, reason: string) => void;
}

/**
 * Configuration for the decision loop.
 */
export interface DecisionLoopConfig extends AgentConfig {
  /** Planner function - determines next actions */
  readonly planner: Planner;
  
  /** Reflector function - decides if goal is achieved */
  readonly reflector: Reflector;
}

/**
 * Planner function signature.
 * Takes context and returns an execution plan.
 */
export type Planner = (context: MCPContext) => Promise<ExecutionPlan>;

/**
 * Reflector function signature.
 * Analyzes results and decides whether to continue.
 */
export type Reflector = (
  context: MCPContext,
  steps: ReadonlyArray<AgentStep>,
) => Promise<ReflectionResult>;

/**
 * Result of reflection analysis.
 */
export interface ReflectionResult {
  /** Whether to continue execution */
  readonly shouldContinue: boolean;
  
  /** If not continuing, is it success or failure? */
  readonly isSuccess: boolean;
  
  /** Reason for the decision */
  readonly reason: string;
  
  /** Optional adjustments to make */
  readonly adjustments: ReflectionAdjustment[];
}

/**
 * Adjustment suggested by reflection.
 */
export interface ReflectionAdjustment {
  readonly type: 'add_constraint' | 'modify_plan' | 'retry_action' | 'skip_action';
  readonly description: string;
  readonly data: Record<string, unknown>;
}

/**
 * Result of running the decision loop.
 */
export interface LoopResult {
  readonly sessionId: UniqueId;
  readonly success: boolean;
  readonly steps: ReadonlyArray<AgentStep>;
  readonly finalContext: MCPContext;
  readonly duration: number;
  readonly reason: string;
}

/**
 * The core decision loop that drives agent execution.
 * 
 * The loop follows this cycle:
 * 1. PLANNING - Determine what actions to take
 * 2. ACTING - Execute the next planned action
 * 3. OBSERVING - Process the action's results
 * 4. REFLECTING - Decide whether to continue
 * 
 * @example
 * ```typescript
 * const loop = new DecisionLoop({
 *   ...DEFAULT_AGENT_CONFIG,
 *   planner: myPlanner,
 *   reflector: myReflector,
 * }, toolRegistry);
 * 
 * const result = await loop.run(userIntent, workspaceMetadata);
 * console.log(`Completed in ${result.steps.length} steps`);
 * ```
 */
export class DecisionLoop extends EventEmitter<DecisionLoopEvents> {
  private readonly config: DecisionLoopConfig;
  private readonly toolRegistry: ToolRegistry;
  private readonly contextManager: ContextManager;
  
  private lifecycle: LifecycleController | null = null;
  private context: MCPContext | null = null;
  private steps: AgentStep[] = [];
  private isRunning: boolean = false;

  constructor(config: DecisionLoopConfig, toolRegistry: ToolRegistry) {
    super();
    this.config = config;
    this.toolRegistry = toolRegistry;
    this.contextManager = new ContextManager();
  }

  /**
   * Runs the decision loop for a given intent.
   * 
   * @param intent - The user's intent
   * @param workspace - Current workspace metadata
   * @returns The loop result
   */
  async run(intent: UserIntent, workspace: WorkspaceMetadata): Promise<LoopResult> {
    const startTime = Date.now();
    const sessionId = createUniqueId(uuidv4());
    
    // Initialize state
    this.lifecycle = createLifecycle(sessionId);
    this.steps = [];
    this.isRunning = true;
    
    // Create initial context
    this.context = this.contextManager.create({
      sessionId,
      intent,
      workspace,
    });

    // Setup lifecycle event forwarding
    this.setupLifecycleEvents();

    this.emit('loop:start', sessionId, intent);

    try {
      // Start the loop
      this.lifecycle.transition(AgentPhase.PLANNING, 'Beginning task execution');
      
      // Main execution loop
      while (this.isRunning && !this.lifecycle.isTerminal()) {
        // Check step limit
        if (this.lifecycle.getStepNumber() >= this.config.maxSteps) {
          this.lifecycle.fail(`Exceeded maximum steps (${this.config.maxSteps})`);
          break;
        }

        const phase = this.lifecycle.getCurrentPhase();
        
        switch (phase) {
          case AgentPhase.PLANNING:
            await this.executePlanningPhase();
            break;
            
          case AgentPhase.ACTING:
            await this.executeActingPhase();
            break;
            
          case AgentPhase.OBSERVING:
            this.executeObservingPhase();
            break;
            
          case AgentPhase.REFLECTING:
            await this.executeReflectingPhase();
            break;
            
          case AgentPhase.SUSPENDED:
            // Wait for resume signal
            this.emit('loop:suspended', sessionId);
            return this.createResult(sessionId, false, 'Suspended', startTime);
            
          default:
            // Should not reach here for non-terminal phases
            break;
        }
      }

      // Determine final result
      const success = this.lifecycle.getCurrentPhase() === AgentPhase.COMPLETE;
      const reason = success ? 'Task completed successfully' : 'Task failed';
      
      if (success) {
        this.emit('loop:complete', sessionId, this.steps);
      } else {
        this.emit('loop:failed', sessionId, reason, this.steps);
      }
      
      return this.createResult(sessionId, success, reason, startTime);
      
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.lifecycle?.fail(reason);
      this.emit('loop:failed', sessionId, reason, this.steps);
      return this.createResult(sessionId, false, reason, startTime);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stops the currently running loop.
   */
  stop(reason: string = 'Stopped by user'): void {
    if (this.isRunning && this.lifecycle) {
      this.isRunning = false;
      this.lifecycle.fail(reason);
    }
  }

  /**
   * Suspends the currently running loop.
   */
  suspend(reason: string = 'Suspended by user'): void {
    if (this.isRunning && this.lifecycle) {
      this.lifecycle.suspend(reason);
    }
  }

  /**
   * Gets the current execution state.
   */
  getState(): {
    isRunning: boolean;
    phase: AgentPhase | null;
    stepNumber: number;
    steps: ReadonlyArray<AgentStep>;
  } {
    return {
      isRunning: this.isRunning,
      phase: this.lifecycle?.getCurrentPhase() ?? null,
      stepNumber: this.lifecycle?.getStepNumber() ?? 0,
      steps: [...this.steps],
    };
  }

  // ============ Phase Execution Methods ============

  private async executePlanningPhase(): Promise<void> {
    if (!this.context || !this.lifecycle) return;

    const stepNumber = this.lifecycle.getStepNumber();
    this.emit('planning:start', stepNumber);

    const stepStart = createTimestamp();
    
    // Invoke planner
    const plan = await this.config.planner(this.context);
    
    // Update context with plan
    this.context = this.contextManager.update(this.context, { plan });
    
    // Record step
    const step = this.createStep(
      stepNumber,
      AgentPhase.PLANNING,
      `Created plan with ${plan.actions.length} actions`,
      plan.description,
      null,
      null,
      ActionOutcome.SUCCESS,
      stepStart,
    );
    this.steps.push(step);
    this.emit('loop:step', step);
    this.emit('planning:complete', plan);

    // Transition to ACTING
    this.lifecycle.transition(AgentPhase.ACTING, 'Plan created, beginning execution');
  }

  private async executeActingPhase(): Promise<void> {
    if (!this.context || !this.lifecycle) return;

    const plan = this.context.activePlan;
    if (!plan) {
      this.lifecycle.fail('No active plan');
      return;
    }

    // Find next pending action
    const nextAction = plan.actions.find(a => a.status === PlannedActionStatus.PENDING);
    if (!nextAction) {
      // All actions complete, go to observation
      this.lifecycle.transition(AgentPhase.OBSERVING, 'All planned actions executed');
      return;
    }

    this.emit('action:start', nextAction);

    const stepStart = createTimestamp();
    const stepNumber = this.lifecycle.getStepNumber();

    // Execute the tool
    const invocation: ToolInvocation = {
      toolId: nextAction.toolId,
      parameters: nextAction.expectedParameters,
      rationale: nextAction.description,
    };

    let result: ToolResult;
    let outcome: ActionOutcome;

    try {
      result = await this.toolRegistry.invoke({
        toolId: nextAction.toolId,
        input: nextAction.expectedParameters,
        context: this.context,
        timeoutMs: this.config.toolTimeoutMs,
      });
      
      outcome = result.success ? ActionOutcome.SUCCESS : ActionOutcome.FAILURE;
    } catch (error) {
      result = {
        id: createUniqueId(uuidv4()),
        toolId: nextAction.toolId,
        success: false,
        data: null,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          recoverable: true,
          suggestions: [],
        },
        durationMs: Date.now() - (stepStart as number),
        completedAt: createTimestamp(),
      };
      outcome = ActionOutcome.FAILURE;
    }

    // Update context with result
    this.context = this.contextManager.update(this.context, {
      addResults: [result],
    });

    // Update plan action status
    const updatedActions = plan.actions.map(a =>
      a.id === nextAction.id
        ? { ...a, status: result.success ? PlannedActionStatus.COMPLETED : PlannedActionStatus.FAILED }
        : a
    );
    
    const updatedPlan: ExecutionPlan = {
      ...plan,
      actions: updatedActions,
      currentIndex: plan.currentIndex + 1,
    };
    
    this.context = this.contextManager.update(this.context, { plan: updatedPlan });

    // Record step
    const step = this.createStep(
      stepNumber,
      AgentPhase.ACTING,
      `Executed ${nextAction.toolId}`,
      nextAction.description,
      invocation,
      result,
      outcome,
      stepStart,
    );
    this.steps.push(step);
    this.emit('loop:step', step);
    this.emit('action:complete', nextAction, result);

    // Check if more actions or move to observation
    const remainingActions = updatedActions.filter(a => a.status === PlannedActionStatus.PENDING);
    if (remainingActions.length === 0 || !result.success) {
      this.lifecycle.transition(AgentPhase.OBSERVING, 'Proceeding to observation');
    }
    // Otherwise, stay in ACTING for next action
  }

  private executeObservingPhase(): void {
    if (!this.context || !this.lifecycle) return;

    // In the observing phase, we process and summarize results
    // For now, this is a pass-through to reflection
    const stepNumber = this.lifecycle.getStepNumber();
    const stepStart = createTimestamp();

    const recentResults = this.context.recentResults;
    const successCount = recentResults.filter(r => r.success).length;
    const totalCount = recentResults.length;

    const step = this.createStep(
      stepNumber,
      AgentPhase.OBSERVING,
      `Observed ${successCount}/${totalCount} successful results`,
      null,
      null,
      null,
      ActionOutcome.SUCCESS,
      stepStart,
    );
    this.steps.push(step);
    this.emit('loop:step', step);

    this.lifecycle.transition(AgentPhase.REFLECTING, 'Results observed, reflecting');
  }

  private async executeReflectingPhase(): Promise<void> {
    if (!this.context || !this.lifecycle) return;

    const stepNumber = this.lifecycle.getStepNumber();
    this.emit('reflection:start', stepNumber);

    const stepStart = createTimestamp();

    // Invoke reflector
    const reflection = await this.config.reflector(this.context, this.steps);

    this.emit('reflection:complete', reflection.shouldContinue, reflection.reason);

    const step = this.createStep(
      stepNumber,
      AgentPhase.REFLECTING,
      reflection.reason,
      reflection.shouldContinue ? 'Continuing execution' : 'Terminating',
      null,
      null,
      ActionOutcome.SUCCESS,
      stepStart,
    );
    this.steps.push(step);
    this.emit('loop:step', step);

    // Decide next phase
    if (!reflection.shouldContinue) {
      if (reflection.isSuccess) {
        this.lifecycle.complete(reflection.reason);
      } else {
        this.lifecycle.fail(reflection.reason);
      }
    } else {
      // Continue with new planning
      this.lifecycle.transition(AgentPhase.PLANNING, 'Continuing with next iteration');
    }
  }

  // ============ Helper Methods ============

  private setupLifecycleEvents(): void {
    // Forward lifecycle events to loop events if needed
    // This is where we'd add observability hooks
  }

  private createStep(
    stepNumber: number,
    phase: AgentPhase,
    description: string,
    reasoning: string | null,
    toolInvocation: ToolInvocation | null,
    result: ToolResult | null,
    outcome: ActionOutcome,
    startedAt: Timestamp,
  ): AgentStep {
    const completedAt = createTimestamp();
    
    return {
      id: createUniqueId(uuidv4()),
      stepNumber,
      phase,
      description,
      reasoning,
      toolInvocation,
      result,
      outcome,
      durationMs: (completedAt as number) - (startedAt as number),
      startedAt,
      completedAt,
    };
  }

  private createResult(
    sessionId: UniqueId,
    success: boolean,
    reason: string,
    startTime: number,
  ): LoopResult {
    return {
      sessionId,
      success,
      steps: [...this.steps],
      finalContext: this.context!,
      duration: Date.now() - startTime,
      reason,
    };
  }
}

/**
 * Creates a simple planner that returns a single-action plan.
 * Useful for testing and simple scenarios.
 */
export function createSimplePlanner(
  getAction: (context: MCPContext) => PlannedAction | null,
): Planner {
  return (context: MCPContext): Promise<ExecutionPlan> => {
    const action = getAction(context);
    
    return Promise.resolve({
      id: createUniqueId(uuidv4()),
      description: action ? `Execute ${action.toolId}` : 'No actions planned',
      actions: action ? [action] : [],
      currentIndex: 0,
      confidence: action ? 0.8 : 0.0,
      createdAt: createTimestamp(),
      revision: 0,
    });
  };
}

/**
 * Creates a simple reflector that stops after first failure or N steps.
 */
export function createSimpleReflector(maxIterations: number = 1): Reflector {
  let iterations = 0;
  
  return (context: MCPContext, _steps: ReadonlyArray<AgentStep>): Promise<ReflectionResult> => {
    iterations++;
    
    // Check for failures
    const lastResult = context.recentResults[context.recentResults.length - 1];
    if (lastResult && !lastResult.success) {
      return Promise.resolve({
        shouldContinue: false,
        isSuccess: false,
        reason: `Action failed: ${lastResult.error?.message ?? 'Unknown error'}`,
        adjustments: [],
      });
    }
    
    // Check iteration limit
    if (iterations >= maxIterations) {
      return Promise.resolve({
        shouldContinue: false,
        isSuccess: true,
        reason: 'Completed planned iterations',
        adjustments: [],
      });
    }
    
    return Promise.resolve({
      shouldContinue: true,
      isSuccess: false,
      reason: 'Continuing to next iteration',
      adjustments: [],
    });
  };
}
