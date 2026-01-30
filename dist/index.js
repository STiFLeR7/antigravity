"use strict";
/**
 * @fileoverview Main entry point for Antigravity.
 *
 * Antigravity is an MCP-backed agent runtime designed for OrchidsAI IDE.
 * It provides a disciplined, auditable system for autonomous interaction
 * with development environments.
 *
 * @module @orchidsai/antigravity
 * @version 0.1.0
 *
 * @example
 * ```typescript
 * import {
 *   DecisionLoop,
 *   ToolRegistry,
 *   ContextManager,
 *   filesystemTools,
 *   createLogger,
 * } from '@orchidsai/antigravity';
 *
 * // Setup
 * const registry = new ToolRegistry({
 *   grantedPermissions: ['FILE_READ', 'FILE_WRITE'],
 * });
 * filesystemTools.forEach(tool => registry.register(tool));
 *
 * // Create and run agent
 * const loop = new DecisionLoop(config, registry);
 * const result = await loop.run(intent, workspace);
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVertexAIProvider = exports.createGeminiProvider = exports.GeminiProvider = exports.createAzureOpenAIProvider = exports.createOpenAIProvider = exports.OpenAIProvider = exports.createClaudeProvider = exports.ClaudeProvider = exports.zodToJsonSchema = exports.BaseProvider = exports.LLMProvider = exports.filesystemTools = exports.writeFileTool = exports.readFileTool = exports.listDirectoryTool = exports.SpanStatus = exports.SpanType = exports.traced = exports.TraceRecorder = exports.defaultLogger = exports.createLogger = exports.MemoryTransport = exports.ConsoleTransport = exports.Logger = exports.createSimpleReflector = exports.createSimplePlanner = exports.DecisionLoop = exports.createLifecycle = exports.LifecycleController = exports.DEFAULT_REGISTRY_CONFIG = exports.ToolRegistry = exports.createMinimalWorkspace = exports.createMinimalIntent = exports.ContextManager = exports.validationFailure = exports.validationSuccess = exports.ToolPermission = exports.ToolCategory = exports.MCPMessageType = exports.PlannedActionStatus = exports.ConstraintType = exports.FactCategory = exports.MemoryType = exports.DEFAULT_AGENT_CONFIG = exports.Severity = exports.Priority = exports.ActionOutcome = exports.AgentPhase = exports.createTimestamp = exports.createUniqueId = void 0;
exports.MCP_SCHEMA_VERSION = exports.VERSION = exports.startUnifiedServer = exports.UnifiedServer = exports.getSupportedProviders = exports.createProvider = void 0;
// ============ Core Types ============
var index_js_1 = require("./types/index.js");
Object.defineProperty(exports, "createUniqueId", { enumerable: true, get: function () { return index_js_1.createUniqueId; } });
Object.defineProperty(exports, "createTimestamp", { enumerable: true, get: function () { return index_js_1.createTimestamp; } });
// Enums
Object.defineProperty(exports, "AgentPhase", { enumerable: true, get: function () { return index_js_1.AgentPhase; } });
Object.defineProperty(exports, "ActionOutcome", { enumerable: true, get: function () { return index_js_1.ActionOutcome; } });
Object.defineProperty(exports, "Priority", { enumerable: true, get: function () { return index_js_1.Priority; } });
Object.defineProperty(exports, "Severity", { enumerable: true, get: function () { return index_js_1.Severity; } });
Object.defineProperty(exports, "DEFAULT_AGENT_CONFIG", { enumerable: true, get: function () { return index_js_1.DEFAULT_AGENT_CONFIG; } });
// ============ MCP Types ============
var index_js_2 = require("./types/index.js");
Object.defineProperty(exports, "MemoryType", { enumerable: true, get: function () { return index_js_2.MemoryType; } });
Object.defineProperty(exports, "FactCategory", { enumerable: true, get: function () { return index_js_2.FactCategory; } });
Object.defineProperty(exports, "ConstraintType", { enumerable: true, get: function () { return index_js_2.ConstraintType; } });
Object.defineProperty(exports, "PlannedActionStatus", { enumerable: true, get: function () { return index_js_2.PlannedActionStatus; } });
Object.defineProperty(exports, "MCPMessageType", { enumerable: true, get: function () { return index_js_2.MCPMessageType; } });
// ============ Tool Types ============
var index_js_3 = require("./types/index.js");
Object.defineProperty(exports, "ToolCategory", { enumerable: true, get: function () { return index_js_3.ToolCategory; } });
Object.defineProperty(exports, "ToolPermission", { enumerable: true, get: function () { return index_js_3.ToolPermission; } });
Object.defineProperty(exports, "validationSuccess", { enumerable: true, get: function () { return index_js_3.validationSuccess; } });
Object.defineProperty(exports, "validationFailure", { enumerable: true, get: function () { return index_js_3.validationFailure; } });
// ============ MCP Runtime ============
var index_js_4 = require("./mcp/index.js");
Object.defineProperty(exports, "ContextManager", { enumerable: true, get: function () { return index_js_4.ContextManager; } });
Object.defineProperty(exports, "createMinimalIntent", { enumerable: true, get: function () { return index_js_4.createMinimalIntent; } });
Object.defineProperty(exports, "createMinimalWorkspace", { enumerable: true, get: function () { return index_js_4.createMinimalWorkspace; } });
var index_js_5 = require("./mcp/index.js");
Object.defineProperty(exports, "ToolRegistry", { enumerable: true, get: function () { return index_js_5.ToolRegistry; } });
Object.defineProperty(exports, "DEFAULT_REGISTRY_CONFIG", { enumerable: true, get: function () { return index_js_5.DEFAULT_REGISTRY_CONFIG; } });
// ============ Agent Runtime ============
var index_js_6 = require("./agent/index.js");
Object.defineProperty(exports, "LifecycleController", { enumerable: true, get: function () { return index_js_6.LifecycleController; } });
Object.defineProperty(exports, "createLifecycle", { enumerable: true, get: function () { return index_js_6.createLifecycle; } });
var index_js_7 = require("./agent/index.js");
Object.defineProperty(exports, "DecisionLoop", { enumerable: true, get: function () { return index_js_7.DecisionLoop; } });
Object.defineProperty(exports, "createSimplePlanner", { enumerable: true, get: function () { return index_js_7.createSimplePlanner; } });
Object.defineProperty(exports, "createSimpleReflector", { enumerable: true, get: function () { return index_js_7.createSimpleReflector; } });
// ============ Observability ============
var index_js_8 = require("./observability/index.js");
Object.defineProperty(exports, "Logger", { enumerable: true, get: function () { return index_js_8.Logger; } });
Object.defineProperty(exports, "ConsoleTransport", { enumerable: true, get: function () { return index_js_8.ConsoleTransport; } });
Object.defineProperty(exports, "MemoryTransport", { enumerable: true, get: function () { return index_js_8.MemoryTransport; } });
Object.defineProperty(exports, "createLogger", { enumerable: true, get: function () { return index_js_8.createLogger; } });
Object.defineProperty(exports, "defaultLogger", { enumerable: true, get: function () { return index_js_8.defaultLogger; } });
var index_js_9 = require("./observability/index.js");
Object.defineProperty(exports, "TraceRecorder", { enumerable: true, get: function () { return index_js_9.TraceRecorder; } });
Object.defineProperty(exports, "traced", { enumerable: true, get: function () { return index_js_9.traced; } });
Object.defineProperty(exports, "SpanType", { enumerable: true, get: function () { return index_js_9.SpanType; } });
Object.defineProperty(exports, "SpanStatus", { enumerable: true, get: function () { return index_js_9.SpanStatus; } });
// ============ Built-in Tools ============
var index_js_10 = require("./tools/index.js");
Object.defineProperty(exports, "listDirectoryTool", { enumerable: true, get: function () { return index_js_10.listDirectoryTool; } });
Object.defineProperty(exports, "readFileTool", { enumerable: true, get: function () { return index_js_10.readFileTool; } });
Object.defineProperty(exports, "writeFileTool", { enumerable: true, get: function () { return index_js_10.writeFileTool; } });
Object.defineProperty(exports, "filesystemTools", { enumerable: true, get: function () { return index_js_10.filesystemTools; } });
// ============ Providers (Multi-LLM Support) ============
var index_js_11 = require("./providers/index.js");
// Base
Object.defineProperty(exports, "LLMProvider", { enumerable: true, get: function () { return index_js_11.LLMProvider; } });
Object.defineProperty(exports, "BaseProvider", { enumerable: true, get: function () { return index_js_11.BaseProvider; } });
Object.defineProperty(exports, "zodToJsonSchema", { enumerable: true, get: function () { return index_js_11.zodToJsonSchema; } });
// Claude
Object.defineProperty(exports, "ClaudeProvider", { enumerable: true, get: function () { return index_js_11.ClaudeProvider; } });
Object.defineProperty(exports, "createClaudeProvider", { enumerable: true, get: function () { return index_js_11.createClaudeProvider; } });
// OpenAI
Object.defineProperty(exports, "OpenAIProvider", { enumerable: true, get: function () { return index_js_11.OpenAIProvider; } });
Object.defineProperty(exports, "createOpenAIProvider", { enumerable: true, get: function () { return index_js_11.createOpenAIProvider; } });
Object.defineProperty(exports, "createAzureOpenAIProvider", { enumerable: true, get: function () { return index_js_11.createAzureOpenAIProvider; } });
// Gemini
Object.defineProperty(exports, "GeminiProvider", { enumerable: true, get: function () { return index_js_11.GeminiProvider; } });
Object.defineProperty(exports, "createGeminiProvider", { enumerable: true, get: function () { return index_js_11.createGeminiProvider; } });
Object.defineProperty(exports, "createVertexAIProvider", { enumerable: true, get: function () { return index_js_11.createVertexAIProvider; } });
// Factory
Object.defineProperty(exports, "createProvider", { enumerable: true, get: function () { return index_js_11.createProvider; } });
Object.defineProperty(exports, "getSupportedProviders", { enumerable: true, get: function () { return index_js_11.getSupportedProviders; } });
// ============ Server ============
var index_js_12 = require("./server/index.js");
Object.defineProperty(exports, "UnifiedServer", { enumerable: true, get: function () { return index_js_12.UnifiedServer; } });
Object.defineProperty(exports, "startUnifiedServer", { enumerable: true, get: function () { return index_js_12.startUnifiedServer; } });
// ============ Version Info ============
exports.VERSION = '0.2.0';
exports.MCP_SCHEMA_VERSION = '1.0';
//# sourceMappingURL=index.js.map