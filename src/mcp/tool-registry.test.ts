/**
 * @fileoverview Unit tests for ToolRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry, type ToolRegistryConfig } from './tool-registry.js';
import {
  ToolCategory,
  ToolPermission,
  createUniqueId,
  createTimestamp,
  type ToolDefinition,
  type ToolResult,
} from '../types/index.js';
import type { MCPContext, ExecutionPlan } from '../types/mcp.types.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let config: ToolRegistryConfig;
  
  // Sample tool for testing
  const echoTool: ToolDefinition<{ message: string }, { echo: string }> = {
    id: 'test.echo',
    name: 'Echo Tool',
    description: 'Echoes back the input message',
    category: ToolCategory.UTILITY,
    permissions: [],
    inputSchema: {
      id: 'echo-input',
      version: '1.0.0',
      description: 'Input for echo tool',
      schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
      examples: [{ message: 'hello' }],
    },
    outputSchema: {
      id: 'echo-output',
      version: '1.0.0',
      description: 'Output for echo tool',
      schema: { type: 'object', properties: { echo: { type: 'string' } }, required: ['echo'] },
      examples: [{ echo: 'hello' }],
    },
    hasSideEffects: false,
    idempotent: true,
    estimatedDurationMs: 10,
    version: '1.0.0',
    execute: async (input) => ({
      id: createUniqueId(uuidv4()),
      toolId: 'test.echo',
      success: true,
      data: { echo: input.message },
      error: null,
      durationMs: 1,
      completedAt: createTimestamp(),
    }),
  };
  
  // Tool that requires permissions
  const writeFileTool: ToolDefinition<{ path: string; content: string }, { written: boolean }> = {
    id: 'test.write_file',
    name: 'Write File',
    description: 'Writes content to a file',
    category: ToolCategory.FILESYSTEM,
    permissions: [ToolPermission.FILE_WRITE],
    inputSchema: {
      id: 'write-file-input',
      version: '1.0.0',
      description: 'Input for write file tool',
      schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
      examples: [{ path: '/test.txt', content: 'hello' }],
    },
    outputSchema: {
      id: 'write-file-output',
      version: '1.0.0',
      description: 'Output for write file tool',
      schema: { type: 'object', properties: { written: { type: 'boolean' } }, required: ['written'] },
      examples: [{ written: true }],
    },
    hasSideEffects: true,
    idempotent: false,
    estimatedDurationMs: 100,
    version: '1.0.0',
    execute: async () => ({
      id: createUniqueId(uuidv4()),
      toolId: 'test.write_file',
      success: true,
      data: { written: true },
      error: null,
      durationMs: 1,
      completedAt: createTimestamp(),
    }),
  };

  // Create a mock MCPContext
  function createMockContext(): MCPContext {
    return {
      id: createUniqueId(uuidv4()),
      sessionId: createUniqueId(uuidv4()),
      version: 1,
      intent: {
        rawInput: 'test',
        action: 'test',
        target: 'target',
        constraints: [],
        confidence: 1.0,
        capturedAt: createTimestamp(),
      },
      workspace: {
        rootPath: '/test',
        projectType: 'typescript',
        frameworks: [],
        activeFile: null,
        selection: null,
        gitBranch: 'main',
        hasUncommittedChanges: false,
        scannedAt: createTimestamp(),
      },
      activePlan: null,
      facts: [],
      recentResults: [],
      memoryRefs: [],
      constraints: [],
      createdAt: createTimestamp(),
      updatedAt: createTimestamp(),
    };
  }

  beforeEach(() => {
    config = {
      grantedPermissions: [ToolPermission.FILE_READ, ToolPermission.FILE_WRITE],
      allowedCategories: [],
      defaultTimeoutMs: 5000,
      strictValidation: true,
    };
    registry = new ToolRegistry(config);
  });

  describe('register()', () => {
    it('should register a tool successfully', () => {
      expect(() => registry.register(echoTool)).not.toThrow();
      expect(registry.has(echoTool.id)).toBe(true);
    });

    it('should throw on duplicate registration', () => {
      registry.register(echoTool);
      expect(() => registry.register(echoTool)).toThrow();
    });

    it('should emit tool:registered event', () => {
      const handler = vi.fn();
      registry.on('tool:registered', handler);
      
      registry.register(echoTool);
      
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('unregister()', () => {
    it('should unregister a registered tool', () => {
      registry.register(echoTool);
      const result = registry.unregister(echoTool.id);
      
      expect(result).toBe(true);
      expect(registry.has(echoTool.id)).toBe(false);
    });

    it('should return false for non-existent tool', () => {
      const result = registry.unregister('non.existent');
      expect(result).toBe(false);
    });

    it('should emit tool:unregistered event', () => {
      registry.register(echoTool);
      const handler = vi.fn();
      registry.on('tool:unregistered', handler);
      
      registry.unregister(echoTool.id);
      
      expect(handler).toHaveBeenCalledWith(echoTool.id);
    });
  });

  describe('get()', () => {
    it('should return registered tool', () => {
      registry.register(echoTool);
      const tool = registry.get(echoTool.id);
      
      expect(tool).toEqual(echoTool);
    });

    it('should return null for non-existent tool', () => {
      const tool = registry.get('non.existent');
      expect(tool).toBeNull();
    });
  });

  describe('list()', () => {
    it('should return empty array when no tools registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should return all registered tools', () => {
      registry.register(echoTool);
      registry.register(writeFileTool);
      
      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list.map(t => t.id)).toContain('test.echo');
      expect(list.map(t => t.id)).toContain('test.write_file');
    });

    it('should filter by category', () => {
      registry.register(echoTool);
      registry.register(writeFileTool);
      
      const filesystemTools = registry.list(ToolCategory.FILESYSTEM);
      expect(filesystemTools).toHaveLength(1);
      expect(filesystemTools[0].id).toBe('test.write_file');
    });
  });

  describe('has()', () => {
    it('should return true for registered tool', () => {
      registry.register(echoTool);
      expect(registry.has(echoTool.id)).toBe(true);
    });

    it('should return false for non-existent tool', () => {
      expect(registry.has('non.existent')).toBe(false);
    });
  });

  describe('invoke()', () => {
    it('should invoke tool successfully', async () => {
      registry.register(echoTool);
      const context = createMockContext();
      
      const result = await registry.invoke({
        toolId: echoTool.id,
        input: { message: 'hello world' },
        context,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ echo: 'hello world' });
    });

    it('should fail for non-existent tool', async () => {
      const context = createMockContext();
      
      const result = await registry.invoke({
        toolId: 'non.existent',
        input: {},
        context,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOOL_NOT_FOUND');
    });

    it('should fail for missing permissions', async () => {
      const restrictedRegistry = new ToolRegistry({
        grantedPermissions: [], // No permissions granted
        allowedCategories: [],
        defaultTimeoutMs: 5000,
        strictValidation: true,
      });
      restrictedRegistry.register(writeFileTool);

      const result = await restrictedRegistry.invoke({
        toolId: writeFileTool.id,
        input: { path: '/test.txt', content: 'hello' },
        context: createMockContext(),
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');
    });

    it('should emit tool:invoked event', async () => {
      registry.register(echoTool);
      const handler = vi.fn();
      registry.on('tool:invoked', handler);

      await registry.invoke({
        toolId: echoTool.id,
        input: { message: 'test' },
        context: createMockContext(),
      });

      expect(handler).toHaveBeenCalled();
    });

    it('should emit tool:completed event', async () => {
      registry.register(echoTool);
      const handler = vi.fn();
      registry.on('tool:completed', handler);

      await registry.invoke({
        toolId: echoTool.id,
        input: { message: 'test' },
        context: createMockContext(),
      });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getMetrics()', () => {
    it('should return null for non-existent tool', () => {
      const metrics = registry.getMetrics('non.existent');
      expect(metrics).toBeNull();
    });

    it('should return entry for registered tool', () => {
      registry.register(echoTool);
      const metrics = registry.getMetrics(echoTool.id);
      
      expect(metrics).not.toBeNull();
      expect(metrics?.invocationCount).toBe(0);
    });
  });

  describe('setEnabled()', () => {
    it('should disable a tool', async () => {
      registry.register(echoTool);
      registry.setEnabled(echoTool.id, false);
      
      expect(registry.has(echoTool.id)).toBe(false);
      
      const result = await registry.invoke({
        toolId: echoTool.id,
        input: { message: 'test' },
        context: createMockContext(),
      });
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOOL_DISABLED');
    });

    it('should re-enable a disabled tool', () => {
      registry.register(echoTool);
      registry.setEnabled(echoTool.id, false);
      registry.setEnabled(echoTool.id, true);
      
      expect(registry.has(echoTool.id)).toBe(true);
    });
  });
});
