/**
 * @fileoverview Unit tests for TraceRecorder
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TraceRecorder, SpanType, SpanStatus, traced } from './tracer.js';
import { createUniqueId } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

describe('TraceRecorder', () => {
  let recorder: TraceRecorder;
  let sessionId: ReturnType<typeof createUniqueId>;

  beforeEach(() => {
    sessionId = createUniqueId(uuidv4());
    recorder = new TraceRecorder(sessionId);
  });

  describe('constructor', () => {
    it('should create a new trace with unique ID', () => {
      expect(recorder.getTraceId()).toBeTruthy();
    });
  });

  describe('startSpan()', () => {
    it('should create a span and return its ID', () => {
      const spanId = recorder.startSpan('Planning phase', { type: SpanType.PLANNING });
      
      expect(spanId).toBeTruthy();
      const spans = recorder.getSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe('Planning phase');
      expect(spans[0].type).toBe(SpanType.PLANNING);
      expect(spans[0].status).toBe(SpanStatus.RUNNING);
    });

    it('should support nested spans with parent', () => {
      const parentId = recorder.startSpan('Parent');
      const childId = recorder.startSpan('Child');
      
      const spans = recorder.getSpans();
      const child = spans.find(s => s.id === childId);
      expect(child?.parentId).toBe(parentId);
    });
  });

  describe('endSpan()', () => {
    it('should end an active span', () => {
      const spanId = recorder.startSpan('Action', { type: SpanType.TOOL });
      
      let span = recorder.getSpans().find(s => s.id === spanId);
      expect(span?.endedAt).toBeNull();
      
      recorder.endSpan(spanId);
      
      span = recorder.getSpans().find(s => s.id === spanId);
      expect(span?.endedAt).not.toBeNull();
      expect(span?.status).toBe(SpanStatus.OK);
    });

    it('should calculate duration on end', () => {
      const spanId = recorder.startSpan('Tool', { type: SpanType.TOOL });
      
      recorder.endSpan(spanId);
      
      const span = recorder.getSpans().find(s => s.id === spanId);
      expect(span?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should accept custom status', () => {
      const spanId = recorder.startSpan('Failing');
      
      recorder.endSpan(spanId, SpanStatus.ERROR);
      
      const span = recorder.getSpans().find(s => s.id === spanId);
      expect(span?.status).toBe(SpanStatus.ERROR);
    });
  });

  describe('finalize()', () => {
    it('should create complete trace with success=true', () => {
      recorder.startSpan('Test');
      const trace = recorder.finalize(true);
      
      expect(trace.endedAt).not.toBeNull();
      expect(trace.success).toBe(true);
      expect(trace.sessionId).toBe(sessionId);
    });

    it('should end all active spans', () => {
      recorder.startSpan('Plan', { type: SpanType.PLANNING });
      recorder.startSpan('Act', { type: SpanType.TOOL });
      
      recorder.finalize(true);
      
      const spans = recorder.getSpans();
      expect(spans.every(s => s.endedAt !== null)).toBe(true);
    });

    it('should mark as failed when success is false', () => {
      recorder.startSpan('Failing');
      
      const trace = recorder.finalize(false);
      
      expect(trace.success).toBe(false);
    });
  });

  describe('getSpans()', () => {
    it('should return all recorded spans', () => {
      recorder.startSpan('Span 1');
      recorder.startSpan('Span 2');
      
      const spans = recorder.getSpans();
      expect(spans).toHaveLength(2);
    });
  });

  describe('getActiveSpan()', () => {
    it('should return null when no spans active', () => {
      expect(recorder.getActiveSpan()).toBeNull();
    });

    it('should return the most recent active span', () => {
      recorder.startSpan('First');
      const secondId = recorder.startSpan('Second');
      
      const active = recorder.getActiveSpan();
      expect(active?.id).toBe(secondId);
    });
  });

  describe('addEvent()', () => {
    it('should add event to span', () => {
      const spanId = recorder.startSpan('Plan', { type: SpanType.PLANNING });
      
      recorder.addEvent(spanId, 'test-event', { data: 'value' });
      
      const span = recorder.getSpans().find(s => s.id === spanId);
      expect(span?.events).toHaveLength(1);
      expect(span?.events[0].name).toBe('test-event');
    });
  });

  describe('setAttributes()', () => {
    it('should set attributes on span', () => {
      const spanId = recorder.startSpan('Tool');
      
      recorder.setAttributes(spanId, { toolName: 'readFile', path: '/test' });
      
      const span = recorder.getSpans().find(s => s.id === spanId);
      expect(span?.attributes).toEqual({ toolName: 'readFile', path: '/test' });
    });
  });

  describe('setStepNumber()', () => {
    it('should update step number for new spans', () => {
      recorder.setStepNumber(5);
      const spanId = recorder.startSpan('At step 5');
      
      const span = recorder.getSpans().find(s => s.id === spanId);
      expect(span?.stepNumber).toBe(5);
    });
  });
});

describe('traced() utility', () => {
  it('should wrap sync function execution with a span', async () => {
    const sessionId = createUniqueId(uuidv4());
    const recorder = new TraceRecorder(sessionId);
    
    const result = await traced(
      recorder,
      'sync-operation',
      { type: SpanType.TOOL },
      async () => 42
    );
    
    expect(result).toBe(42);
    
    const spans = recorder.getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status).toBe(SpanStatus.OK);
  });

  it('should mark span as errored on exception', async () => {
    const sessionId = createUniqueId(uuidv4());
    const recorder = new TraceRecorder(sessionId);
    
    await expect(
      traced(
        recorder,
        'failing-operation',
        { type: SpanType.TOOL },
        async () => {
          throw new Error('test error');
        }
      )
    ).rejects.toThrow('test error');
    
    const spans = recorder.getSpans();
    expect(spans[0].status).toBe(SpanStatus.ERROR);
  });
});
