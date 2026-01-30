/**
 * @fileoverview Unit tests for LifecycleController
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LifecycleController } from './lifecycle.js';
import { AgentPhase, createUniqueId } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

describe('LifecycleController', () => {
  let controller: LifecycleController;

  beforeEach(() => {
    controller = new LifecycleController();
  });

  describe('initial state', () => {
    it('should start in IDLE phase', () => {
      expect(controller.getCurrentPhase()).toBe(AgentPhase.IDLE);
    });

    it('should not be in terminal state initially', () => {
      expect(controller.isTerminal()).toBe(false);
    });

    it('should have step number 0', () => {
      expect(controller.getStepNumber()).toBe(0);
    });
  });

  describe('getState()', () => {
    it('should return current lifecycle state', () => {
      const state = controller.getState();
      
      expect(state.currentPhase).toBe(AgentPhase.IDLE);
      expect(state.previousPhase).toBeNull();
      expect(state.stepNumber).toBe(0);
      expect(state.isTerminal).toBe(false);
    });
  });

  describe('transition()', () => {
    it('should transition from IDLE to PLANNING', () => {
      expect(() => controller.transition(AgentPhase.PLANNING, 'Starting')).not.toThrow();
      expect(controller.getCurrentPhase()).toBe(AgentPhase.PLANNING);
    });

    it('should follow the valid transition sequence', () => {
      controller.transition(AgentPhase.PLANNING, 'Plan');
      controller.transition(AgentPhase.ACTING, 'Act');
      controller.transition(AgentPhase.OBSERVING, 'Observe');
      controller.transition(AgentPhase.REFLECTING, 'Reflect');
      
      expect(controller.getCurrentPhase()).toBe(AgentPhase.REFLECTING);
    });

    it('should allow REFLECTING to PLANNING (loop)', () => {
      controller.transition(AgentPhase.PLANNING, 'Plan');
      controller.transition(AgentPhase.ACTING, 'Act');
      controller.transition(AgentPhase.OBSERVING, 'Observe');
      controller.transition(AgentPhase.REFLECTING, 'Reflect');
      controller.transition(AgentPhase.PLANNING, 'Continue');
      
      expect(controller.getCurrentPhase()).toBe(AgentPhase.PLANNING);
    });

    it('should allow REFLECTING to COMPLETE', () => {
      controller.transition(AgentPhase.PLANNING, 'Plan');
      controller.transition(AgentPhase.ACTING, 'Act');
      controller.transition(AgentPhase.OBSERVING, 'Observe');
      controller.transition(AgentPhase.REFLECTING, 'Reflect');
      controller.transition(AgentPhase.COMPLETE, 'Done');
      
      expect(controller.getCurrentPhase()).toBe(AgentPhase.COMPLETE);
      expect(controller.isTerminal()).toBe(true);
    });

    it('should throw on invalid transitions', () => {
      // Cannot go directly from IDLE to ACTING
      expect(() => controller.transition(AgentPhase.ACTING, 'Invalid')).toThrow();
    });

    it('should throw on transitions from terminal states', () => {
      controller.transition(AgentPhase.PLANNING, 'Plan');
      controller.transition(AgentPhase.ACTING, 'Act');
      controller.transition(AgentPhase.OBSERVING, 'Observe');
      controller.transition(AgentPhase.REFLECTING, 'Reflect');
      controller.transition(AgentPhase.COMPLETE, 'Done');
      
      // Cannot transition from COMPLETE
      expect(() => controller.transition(AgentPhase.PLANNING, 'Try again')).toThrow();
    });

    it('should emit transition event on valid transition', () => {
      const handler = vi.fn();
      controller.on('transition', handler);
      
      controller.transition(AgentPhase.PLANNING, 'Starting');
      
      expect(handler).toHaveBeenCalledWith(AgentPhase.IDLE, AgentPhase.PLANNING, 'Starting');
    });

    it('should emit error event on invalid transition', () => {
      const handler = vi.fn();
      controller.on('error', handler);
      
      expect(() => controller.transition(AgentPhase.ACTING, 'Invalid')).toThrow();
      expect(handler).toHaveBeenCalled();
    });

    it('should increment step number', () => {
      controller.transition(AgentPhase.PLANNING, 'Plan');
      expect(controller.getStepNumber()).toBe(1);
      
      controller.transition(AgentPhase.ACTING, 'Act');
      expect(controller.getStepNumber()).toBe(2);
    });
  });

  describe('canTransition()', () => {
    it('should return true for valid transitions', () => {
      expect(controller.canTransition(AgentPhase.PLANNING)).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(controller.canTransition(AgentPhase.ACTING)).toBe(false);
      expect(controller.canTransition(AgentPhase.COMPLETE)).toBe(false);
    });
  });

  describe('fail()', () => {
    it('should transition to FAILED from any running state', () => {
      controller.transition(AgentPhase.PLANNING, 'Plan');
      controller.fail('test error');
      
      expect(controller.getCurrentPhase()).toBe(AgentPhase.FAILED);
      expect(controller.isTerminal()).toBe(true);
    });

    it('should do nothing from terminal states', () => {
      controller.transition(AgentPhase.PLANNING, 'Plan');
      controller.transition(AgentPhase.ACTING, 'Act');
      controller.transition(AgentPhase.OBSERVING, 'Observe');
      controller.transition(AgentPhase.REFLECTING, 'Reflect');
      controller.transition(AgentPhase.COMPLETE, 'Done');
      
      controller.fail('test error');
      expect(controller.getCurrentPhase()).toBe(AgentPhase.COMPLETE);
    });

    it('should emit transition event when failing', () => {
      const handler = vi.fn();
      controller.transition(AgentPhase.PLANNING, 'Plan');
      
      controller.on('transition', handler);
      controller.fail('test error');
      
      expect(handler).toHaveBeenCalledWith(AgentPhase.PLANNING, AgentPhase.FAILED, 'test error');
    });
  });

  describe('isTerminal()', () => {
    it('should be false for non-terminal states', () => {
      expect(controller.isTerminal()).toBe(false);
      
      controller.transition(AgentPhase.PLANNING, 'Plan');
      expect(controller.isTerminal()).toBe(false);
    });

    it('should be true for COMPLETE', () => {
      controller.transition(AgentPhase.PLANNING, 'Plan');
      controller.transition(AgentPhase.ACTING, 'Act');
      controller.transition(AgentPhase.OBSERVING, 'Observe');
      controller.transition(AgentPhase.REFLECTING, 'Reflect');
      controller.transition(AgentPhase.COMPLETE, 'Done');
      
      expect(controller.isTerminal()).toBe(true);
    });

    it('should be true for FAILED', () => {
      controller.transition(AgentPhase.PLANNING, 'Plan');
      controller.fail('test');
      
      expect(controller.isTerminal()).toBe(true);
    });
  });

  describe('phase events', () => {
    it('should emit phase:enter event', () => {
      const handler = vi.fn();
      controller.on('phase:enter', handler);
      
      controller.transition(AgentPhase.PLANNING, 'Starting');
      
      expect(handler).toHaveBeenCalledWith(
        AgentPhase.PLANNING,
        expect.objectContaining({ reason: 'Starting' })
      );
    });

    it('should emit phase:exit event', () => {
      const handler = vi.fn();
      controller.on('phase:exit', handler);
      
      controller.transition(AgentPhase.PLANNING, 'Starting');
      
      // Exit from IDLE was emitted
      expect(handler).toHaveBeenCalledWith(
        AgentPhase.IDLE,
        expect.any(Object)
      );
    });
  });
});
