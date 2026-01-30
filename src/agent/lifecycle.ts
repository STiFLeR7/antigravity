/**
 * @fileoverview Agent Lifecycle Controller - Manages agent state transitions.
 * 
 * The lifecycle controller enforces the agent state machine, ensuring
 * valid transitions and providing hooks for observability. It is the
 * authoritative source for "what phase is the agent in?"
 * 
 * State Machine:
 * ```
 *                    ┌─────────────────────────────────────┐
 *                    │                                     │
 *                    ▼                                     │
 *   IDLE ──► PLANNING ──► ACTING ──► OBSERVING ──► REFLECTING
 *                                                    │     │
 *                                                    │     │
 *                                          ┌────────┘     │
 *                                          ▼              ▼
 *                                      COMPLETE        FAILED
 *                                          
 *   Any state can transition to SUSPENDED (external pause)
 * ```
 * 
 * @module @orchidsai/antigravity/agent/lifecycle
 * @version 0.1.0
 */

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import type { UniqueId, Timestamp } from '../types/core.types.js';
import { AgentPhase, createUniqueId, createTimestamp } from '../types/core.types.js';

/**
 * Events emitted during lifecycle transitions.
 */
export interface LifecycleEvents {
  'phase:enter': (phase: AgentPhase, metadata: PhaseMetadata) => void;
  'phase:exit': (phase: AgentPhase, metadata: PhaseMetadata) => void;
  'transition': (from: AgentPhase, to: AgentPhase, reason: string) => void;
  'error': (error: LifecycleError) => void;
}

/**
 * Metadata associated with a phase.
 */
export interface PhaseMetadata {
  readonly enteredAt: Timestamp;
  readonly stepNumber: number;
  readonly reason: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * Error during lifecycle operations.
 */
export interface LifecycleError {
  readonly code: string;
  readonly message: string;
  readonly phase: AgentPhase;
  readonly attemptedTransition?: AgentPhase;
}

/**
 * Snapshot of current lifecycle state.
 */
export interface LifecycleState {
  readonly sessionId: UniqueId;
  readonly currentPhase: AgentPhase;
  readonly previousPhase: AgentPhase | null;
  readonly stepNumber: number;
  readonly phaseHistory: ReadonlyArray<PhaseHistoryEntry>;
  readonly startedAt: Timestamp;
  readonly lastTransitionAt: Timestamp;
  readonly isTerminal: boolean;
}

/**
 * Entry in the phase history.
 */
export interface PhaseHistoryEntry {
  readonly phase: AgentPhase;
  readonly stepNumber: number;
  readonly enteredAt: Timestamp;
  readonly exitedAt: Timestamp | null;
  readonly reason: string;
}

/**
 * Valid transitions from each phase.
 * This is the authoritative definition of the state machine.
 */
const VALID_TRANSITIONS: ReadonlyMap<AgentPhase, ReadonlyArray<AgentPhase>> = new Map([
  [AgentPhase.IDLE, [AgentPhase.PLANNING, AgentPhase.SUSPENDED]],
  [AgentPhase.PLANNING, [AgentPhase.ACTING, AgentPhase.REFLECTING, AgentPhase.FAILED, AgentPhase.SUSPENDED]],
  [AgentPhase.ACTING, [AgentPhase.OBSERVING, AgentPhase.FAILED, AgentPhase.SUSPENDED]],
  [AgentPhase.OBSERVING, [AgentPhase.REFLECTING, AgentPhase.FAILED, AgentPhase.SUSPENDED]],
  [AgentPhase.REFLECTING, [AgentPhase.PLANNING, AgentPhase.COMPLETE, AgentPhase.FAILED, AgentPhase.SUSPENDED]],
  [AgentPhase.SUSPENDED, [AgentPhase.PLANNING, AgentPhase.FAILED]],
  [AgentPhase.COMPLETE, []],
  [AgentPhase.FAILED, []],
]);

/**
 * Terminal phases that cannot transition to other phases.
 */
const TERMINAL_PHASES: ReadonlySet<AgentPhase> = new Set([
  AgentPhase.COMPLETE,
  AgentPhase.FAILED,
]);

/**
 * Manages agent lifecycle and state transitions.
 * 
 * The controller ensures:
 * 1. Only valid transitions occur
 * 2. Phase history is recorded
 * 3. Events are emitted for observability
 * 4. Terminal states are respected
 * 
 * @example
 * ```typescript
 * const lifecycle = new LifecycleController(sessionId);
 * lifecycle.on('transition', (from, to, reason) => {
 *   console.log(`Transition: ${from} → ${to} (${reason})`);
 * });
 * 
 * lifecycle.transition(AgentPhase.PLANNING, 'Starting task');
 * lifecycle.transition(AgentPhase.ACTING, 'Executing tool');
 * ```
 */
export class LifecycleController extends EventEmitter<LifecycleEvents> {
  private readonly sessionId: UniqueId;
  private currentPhase: AgentPhase;
  private previousPhase: AgentPhase | null;
  private stepNumber: number;
  private readonly phaseHistory: PhaseHistoryEntry[];
  private readonly startedAt: Timestamp;
  private lastTransitionAt: Timestamp;
  private currentPhaseEntry: PhaseHistoryEntry | null;

  constructor(sessionId?: UniqueId) {
    super();
    this.sessionId = sessionId ?? createUniqueId(uuidv4());
    this.currentPhase = AgentPhase.IDLE;
    this.previousPhase = null;
    this.stepNumber = 0;
    this.phaseHistory = [];
    this.startedAt = createTimestamp();
    this.lastTransitionAt = this.startedAt;
    this.currentPhaseEntry = null;
    
    // Record initial phase
    this.enterPhase(AgentPhase.IDLE, 'Session initialized');
  }

  /**
   * Gets the current lifecycle state.
   */
  getState(): LifecycleState {
    return {
      sessionId: this.sessionId,
      currentPhase: this.currentPhase,
      previousPhase: this.previousPhase,
      stepNumber: this.stepNumber,
      phaseHistory: [...this.phaseHistory],
      startedAt: this.startedAt,
      lastTransitionAt: this.lastTransitionAt,
      isTerminal: this.isTerminal(),
    };
  }

  /**
   * Gets the current phase.
   */
  getCurrentPhase(): AgentPhase {
    return this.currentPhase;
  }

  /**
   * Gets the current step number.
   */
  getStepNumber(): number {
    return this.stepNumber;
  }

  /**
   * Checks if the agent is in a terminal state.
   */
  isTerminal(): boolean {
    return TERMINAL_PHASES.has(this.currentPhase);
  }

  /**
   * Checks if a transition to the target phase is valid.
   * 
   * @param targetPhase - The phase to transition to
   */
  canTransition(targetPhase: AgentPhase): boolean {
    const validTargets = VALID_TRANSITIONS.get(this.currentPhase);
    return validTargets !== undefined && validTargets.includes(targetPhase);
  }

  /**
   * Transitions to a new phase.
   * 
   * @param targetPhase - The phase to transition to
   * @param reason - Reason for the transition
   * @param data - Optional metadata for the transition
   * @throws Error if the transition is invalid
   */
  transition(
    targetPhase: AgentPhase,
    reason: string,
    data: Record<string, unknown> = {},
  ): void {
    // Check if already in terminal state
    if (this.isTerminal()) {
      const error: LifecycleError = {
        code: 'TERMINAL_STATE',
        message: `Cannot transition from terminal state '${this.currentPhase}'`,
        phase: this.currentPhase,
        attemptedTransition: targetPhase,
      };
      this.emit('error', error);
      throw new Error(error.message);
    }

    // Check if transition is valid
    if (!this.canTransition(targetPhase)) {
      const error: LifecycleError = {
        code: 'INVALID_TRANSITION',
        message: `Invalid transition: '${this.currentPhase}' → '${targetPhase}'`,
        phase: this.currentPhase,
        attemptedTransition: targetPhase,
      };
      this.emit('error', error);
      throw new Error(error.message);
    }

    // Exit current phase
    this.exitPhase();

    // Update state
    this.previousPhase = this.currentPhase;
    this.currentPhase = targetPhase;
    this.lastTransitionAt = createTimestamp();
    
    // Increment step for non-administrative transitions
    if (targetPhase !== AgentPhase.SUSPENDED) {
      this.stepNumber++;
    }

    // Emit transition event
    this.emit('transition', this.previousPhase, this.currentPhase, reason);

    // Enter new phase
    this.enterPhase(targetPhase, reason, data);
  }

  /**
   * Forces a transition to FAILED state from any non-terminal state.
   * This is an escape hatch for unrecoverable errors.
   * 
   * @param reason - Reason for failure
   */
  fail(reason: string): void {
    if (this.isTerminal()) {
      return; // Already terminal, do nothing
    }

    this.exitPhase();
    
    this.previousPhase = this.currentPhase;
    this.currentPhase = AgentPhase.FAILED;
    this.lastTransitionAt = createTimestamp();
    
    this.emit('transition', this.previousPhase, AgentPhase.FAILED, reason);
    this.enterPhase(AgentPhase.FAILED, reason, { forced: true });
  }

  /**
   * Completes the agent successfully.
   * Only valid from REFLECTING phase.
   * 
   * @param reason - Completion reason
   */
  complete(reason: string): void {
    if (!this.canTransition(AgentPhase.COMPLETE)) {
      throw new Error(`Cannot complete from phase '${this.currentPhase}'`);
    }
    this.transition(AgentPhase.COMPLETE, reason);
  }

  /**
   * Suspends the agent.
   * Valid from any non-terminal phase.
   * 
   * @param reason - Suspension reason
   */
  suspend(reason: string): void {
    if (!this.canTransition(AgentPhase.SUSPENDED)) {
      throw new Error(`Cannot suspend from phase '${this.currentPhase}'`);
    }
    this.transition(AgentPhase.SUSPENDED, reason);
  }

  /**
   * Resumes a suspended agent.
   * 
   * @param reason - Resume reason
   */
  resume(reason: string): void {
    if (this.currentPhase !== AgentPhase.SUSPENDED) {
      throw new Error('Can only resume from SUSPENDED state');
    }
    this.transition(AgentPhase.PLANNING, reason);
  }

  // ============ Private Methods ============

  private enterPhase(
    phase: AgentPhase,
    reason: string,
    data: Record<string, unknown> = {},
  ): void {
    const now = createTimestamp();
    
    this.currentPhaseEntry = {
      phase,
      stepNumber: this.stepNumber,
      enteredAt: now,
      exitedAt: null,
      reason,
    };

    const metadata: PhaseMetadata = {
      enteredAt: now,
      stepNumber: this.stepNumber,
      reason,
      data,
    };

    this.emit('phase:enter', phase, metadata);
  }

  private exitPhase(): void {
    if (this.currentPhaseEntry) {
      const now = createTimestamp();
      
      const completedEntry: PhaseHistoryEntry = {
        ...this.currentPhaseEntry,
        exitedAt: now,
      };
      
      this.phaseHistory.push(completedEntry);
      
      const metadata: PhaseMetadata = {
        enteredAt: this.currentPhaseEntry.enteredAt,
        stepNumber: this.currentPhaseEntry.stepNumber,
        reason: this.currentPhaseEntry.reason,
        data: {},
      };

      this.emit('phase:exit', this.currentPhase, metadata);
      this.currentPhaseEntry = null;
    }
  }
}

/**
 * Creates a new lifecycle controller for a session.
 */
export function createLifecycle(sessionId?: UniqueId): LifecycleController {
  return new LifecycleController(sessionId);
}
