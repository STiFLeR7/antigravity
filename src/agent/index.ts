/**
 * @fileoverview Agent module public exports.
 * 
 * @module @orchidsai/antigravity/agent
 * @version 0.1.0
 */

export {
  LifecycleController,
  createLifecycle,
  type LifecycleEvents,
  type PhaseMetadata,
  type LifecycleError,
  type LifecycleState,
  type PhaseHistoryEntry,
} from './lifecycle.js';

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
} from './decision-loop.js';
