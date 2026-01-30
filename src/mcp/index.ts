/**
 * @fileoverview MCP module public exports.
 * 
 * @module @orchidsai/antigravity/mcp
 * @version 0.1.0
 */

export {
  ContextManager,
  createMinimalIntent,
  createMinimalWorkspace,
  type CreateContextOptions,
  type UpdateContextOptions,
} from './context-manager.js';

export {
  ToolRegistry,
  DEFAULT_REGISTRY_CONFIG,
  type ToolRegistryConfig,
  type ToolRegistryEvents,
} from './tool-registry.js';
