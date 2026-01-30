/**
 * @fileoverview Unit tests for ContextManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager, type CreateContextOptions } from './context-manager.js';
import { createUniqueId, createTimestamp, FactCategory } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import type { UserIntent, WorkspaceMetadata } from '../types/index.js';

describe('ContextManager', () => {
  let manager: ContextManager;
  let sessionId: ReturnType<typeof createUniqueId>;
  let intent: UserIntent;
  let workspace: WorkspaceMetadata;
  let createOptions: CreateContextOptions;

  beforeEach(() => {
    manager = new ContextManager({ maxRecentResults: 10 });
    sessionId = createUniqueId(uuidv4());
    
    intent = {
      rawInput: 'test action',
      action: 'read',
      target: 'file.ts',
      constraints: [],
      confidence: 0.95,
      capturedAt: createTimestamp(),
    };

    workspace = {
      rootPath: '/test/workspace',
      projectType: 'typescript',
      frameworks: ['node'],
      activeFile: 'src/index.ts',
      selection: null,
      gitBranch: 'main',
      hasUncommittedChanges: false,
      scannedAt: createTimestamp(),
    };

    createOptions = { sessionId, intent, workspace };
  });

  describe('create()', () => {
    it('should create a new context with provided intent and workspace', () => {
      const context = manager.create(createOptions);

      expect(context.intent).toEqual(intent);
      expect(context.workspace).toEqual(workspace);
      expect(context.sessionId).toBeTruthy();
      expect(context.activePlan).toBeNull();
      expect(context.facts).toHaveLength(0);
      expect(context.recentResults).toHaveLength(0);
      expect(context.memoryRefs).toHaveLength(0);
    });

    it('should generate unique context IDs', () => {
      const context1 = manager.create(createOptions);
      const context2 = manager.create({ ...createOptions, sessionId: createUniqueId(uuidv4()) });

      expect(context1.id).not.toEqual(context2.id);
    });
  });

  describe('update()', () => {
    it('should return a new context with updated fields', () => {
      const original = manager.create(createOptions);
      const updated = manager.update(original, {
        plan: {
          id: createUniqueId(uuidv4()),
          description: 'test plan',
          actions: [],
          currentIndex: 0,
          confidence: 0.8,
          createdAt: createTimestamp(),
          revision: 1,
        },
      });

      expect(updated).not.toBe(original);
      expect(updated.activePlan).not.toBeNull();
      expect(updated.activePlan?.description).toBe('test plan');
      expect(original.activePlan).toBeNull();
    });

    it('should preserve unchanged fields', () => {
      const original = manager.create(createOptions);
      const updated = manager.update(original, {
        addFacts: [{
          id: createUniqueId(uuidv4()),
          category: FactCategory.DISCOVERY,
          statement: 'test statement',
          confidence: 1.0,
          source: 'test',
          discoveredAt: createTimestamp(),
        }],
      });

      expect(updated.sessionId).toEqual(original.sessionId);
      expect(updated.intent).toEqual(original.intent);
      expect(updated.workspace).toEqual(original.workspace);
    });

    it('should track history of context updates', () => {
      const ctx1 = manager.create(createOptions);
      const ctx2 = manager.update(ctx1, {});
      const ctx3 = manager.update(ctx2, {});

      const history = manager.getHistory(sessionId);
      expect(history).toHaveLength(3);
    });
  });

  describe('getHistory()', () => {
    it('should return empty array for unknown session', () => {
      const history = manager.getHistory(createUniqueId('unknown-id'));
      expect(history).toHaveLength(0);
    });
  });

  describe('getVersion()', () => {
    it('should return null for unknown session', () => {
      const ctx = manager.getVersion(createUniqueId('unknown-id'), 1);
      expect(ctx).toBeNull();
    });

    it('should return the context at specific version', () => {
      const ctx1 = manager.create(createOptions);
      manager.update(ctx1, {
        addFacts: [{
          id: createUniqueId(uuidv4()),
          category: FactCategory.DISCOVERY,
          statement: 'latest',
          confidence: 1.0,
          source: 'test',
          discoveredAt: createTimestamp(),
        }],
      });

      const v1 = manager.getVersion(sessionId, 1);
      const v2 = manager.getVersion(sessionId, 2);
      
      expect(v1).not.toBeNull();
      expect(v1?.version).toBe(1);
      expect(v2).not.toBeNull();
      expect(v2?.version).toBe(2);
      expect(v2?.facts).toHaveLength(1);
    });
  });

  describe('queryFacts()', () => {
    it('should filter facts by category', () => {
      const ctx = manager.create(createOptions);
      const withFacts = manager.update(ctx, {
        addFacts: [
          {
            id: createUniqueId(uuidv4()),
            category: FactCategory.DISCOVERY,
            statement: 'file1 content1',
            confidence: 1.0,
            source: 'test',
            discoveredAt: createTimestamp(),
          },
          {
            id: createUniqueId(uuidv4()),
            category: FactCategory.VALIDATION,
            statement: 'check1 passed',
            confidence: 1.0,
            source: 'test',
            discoveredAt: createTimestamp(),
          },
          {
            id: createUniqueId(uuidv4()),
            category: FactCategory.DISCOVERY,
            statement: 'file2 content2',
            confidence: 1.0,
            source: 'test',
            discoveredAt: createTimestamp(),
          },
        ],
      });

      const discoveryFacts = manager.queryFacts(withFacts, FactCategory.DISCOVERY);
      expect(discoveryFacts).toHaveLength(2);
      expect(discoveryFacts.every(f => f.category === FactCategory.DISCOVERY)).toBe(true);
    });

    it('should return empty array if no facts match', () => {
      const ctx = manager.create(createOptions);
      const facts = manager.queryFacts(ctx, FactCategory.DISCOVERY);
      expect(facts).toHaveLength(0);
    });
  });

  describe('update with results', () => {
    it('should add a tool result to the context', () => {
      const ctx = manager.create(createOptions);
      const updated = manager.update(ctx, {
        addResults: [{
          id: createUniqueId(uuidv4()),
          toolId: 'filesystem.read_file',
          success: true,
          data: { content: 'file contents' },
          error: null,
          durationMs: 50,
          completedAt: createTimestamp(),
        }],
      });

      expect(updated.recentResults).toHaveLength(1);
      expect(updated.recentResults[0].toolId).toBe('filesystem.read_file');
      expect(updated.recentResults[0].success).toBe(true);
    });
  });

  describe('update with facts', () => {
    it('should add a new fact to the context', () => {
      const ctx = manager.create(createOptions);
      const updated = manager.update(ctx, {
        addFacts: [{
          id: createUniqueId(uuidv4()),
          category: FactCategory.DISCOVERY,
          statement: 'key value',
          confidence: 0.9,
          source: 'test',
          discoveredAt: createTimestamp(),
        }],
      });

      expect(updated.facts).toHaveLength(1);
      expect(updated.facts[0].category).toBe(FactCategory.DISCOVERY);
      expect(updated.facts[0].confidence).toBe(0.9);
    });
  });
});
