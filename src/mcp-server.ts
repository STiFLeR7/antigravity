#!/usr/bin/env node
/**
 * @fileoverview Antigravity MCP Server
 * 
 * This is the entry point for Claude Desktop MCP integration.
 * It implements the Model Context Protocol over stdio.
 * 
 * Usage:
 *   node dist/mcp-server.js
 * 
 * Claude Desktop Configuration (claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "antigravity": {
 *       "command": "node",
 *       "args": ["/path/to/antigravity/dist/mcp-server.js"],
 *       "cwd": "/path/to/your/workspace"
 *     }
 *   }
 * }
 */

import {
  ToolRegistry,
  filesystemTools,
  ToolPermission,
  createUniqueId,
  createTimestamp,
  type MCPContext,
  type ToolDefinition,
  type ToolResult,
} from './index.js';

import { v4 as uuidv4 } from 'uuid';
import * as readline from 'readline';

// ============ Types ============

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// ============ MCP Server ============

class AntigravityMCPServer {
  private readonly registry: ToolRegistry;
  private context: MCPContext;
  private readonly workspaceRoot: string;
  private initialized = false;

  constructor() {
    // Use CWD as workspace root (can be configured via env)
    this.workspaceRoot = process.env['ANTIGRAVITY_WORKSPACE'] ?? process.cwd();
    
    // Initialize tool registry
    this.registry = new ToolRegistry({
      grantedPermissions: [
        ToolPermission.FILE_READ,
        ToolPermission.FILE_WRITE,
        ToolPermission.FILE_DELETE,
      ],
      allowedCategories: [],
      defaultTimeoutMs: 30000,
      strictValidation: true,
    });
    
    // Register filesystem tools
    for (const tool of filesystemTools) {
      // Cast to any to avoid strict type issues with different tool signatures
      this.registry.register(tool as ToolDefinition<Record<string, unknown>, unknown>);
    }
    
    // Initialize context
    this.context = this.createContext();
    
    this.log('Server initialized', { 
      workspace: this.workspaceRoot,
      tools: this.registry.list().length,
    });
  }

  /**
   * Handle incoming JSON-RPC request
   */
  async handleMessage(message: string): Promise<void> {
    let request: MCPRequest;
    
    try {
      request = JSON.parse(message) as MCPRequest;
    } catch {
      this.sendError(null, -32700, 'Parse error');
      return;
    }

    // Handle notifications (no response needed)
    if (!('id' in request)) {
      this.handleNotification(request as unknown as MCPNotification);
      return;
    }

    try {
      const response = await this.handleRequest(request);
      this.send(response);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Internal error';
      this.sendError(request.id, -32603, msg);
    }
  }

  /**
   * Handle MCP request
   */
  private async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    this.log('Request', { method: request.method });

    switch (request.method) {
      case 'initialize':
        return this.initialize(request);
      
      case 'tools/list':
        return this.toolsList(request);
      
      case 'tools/call':
        return await this.toolsCall(request);
      
      case 'resources/list':
        return this.resourcesList(request);
      
      case 'resources/read':
        return this.resourcesRead(request);
      
      case 'ping':
        return { jsonrpc: '2.0', id: request.id, result: {} };
      
      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: `Unknown method: ${request.method}` },
        };
    }
  }

  /**
   * Handle notification (no response)
   */
  private handleNotification(notification: MCPNotification): void {
    this.log('Notification', { method: notification.method });
    
    if (notification.method === 'notifications/initialized') {
      this.initialized = true;
      this.log('Client initialized');
    }
  }

  /**
   * MCP initialize
   */
  private initialize(request: MCPRequest): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'antigravity',
          version: '0.1.0',
        },
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
        },
      },
    };
  }

  /**
   * MCP tools/list
   */
  private toolsList(request: MCPRequest): MCPResponse {
    const tools = this.registry.list().map(def => ({
      name: def.id,
      description: def.description,
      inputSchema: this.extractSchema(def),
    }));

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { tools },
    };
  }

  /**
   * MCP tools/call
   */
  private async toolsCall(request: MCPRequest): Promise<MCPResponse> {
    const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined;
    
    if (params?.name === undefined || params.name === '') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32602, message: 'Missing tool name' },
      };
    }

    const toolId = params.name;
    const input = params.arguments ?? {};

    this.log('Tool call', { toolId, input });

    const result = await this.registry.invoke({
      toolId,
      input,
      context: this.context,
    });

    this.updateContext(result);

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: result.success 
              ? JSON.stringify(result.data, null, 2)
              : `Error: ${result.error?.message ?? 'Unknown error'}`,
          },
        ],
        isError: !result.success,
      },
    };
  }

  /**
   * MCP resources/list
   */
  private resourcesList(request: MCPRequest): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        resources: [
          {
            uri: `file://${this.workspaceRoot}`,
            name: 'Workspace Root',
            description: 'The current workspace directory',
            mimeType: 'inode/directory',
          },
        ],
      },
    };
  }

  /**
   * MCP resources/read
   */
  private resourcesRead(request: MCPRequest): MCPResponse {
    const params = request.params as { uri: string } | undefined;
    
    if (params?.uri === undefined || params.uri === '') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32602, message: 'Missing resource URI' },
      };
    }

    // For now, just return workspace info
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        contents: [
          {
            uri: params.uri,
            mimeType: 'text/plain',
            text: `Workspace: ${this.workspaceRoot}`,
          },
        ],
      },
    };
  }

  /**
   * Extract JSON Schema from Zod schema (simplified)
   */
  private extractSchema(def: ToolDefinition): Record<string, unknown> {
    // In production, use zod-to-json-schema
    // This is a simplified extraction
    const schema = def.inputSchema;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    if (schema !== undefined && '_def' in schema) {
      const zodDef = schema._def as { typeName?: string; shape?: () => Record<string, unknown> };
      if (zodDef.typeName === 'ZodObject' && zodDef.shape) {
        const shape = zodDef.shape();
        for (const key of Object.keys(shape)) {
          properties[key] = { type: 'string' };
          required.push(key);
        }
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  /**
   * Create initial context
   */
  private createContext(): MCPContext {
    return {
      id: createUniqueId(uuidv4()),
      sessionId: createUniqueId(uuidv4()),
      version: 1,
      createdAt: createTimestamp(),
      updatedAt: createTimestamp(),
      intent: {
        rawInput: 'MCP Session',
        action: 'execute',
        target: 'workspace',
        constraints: [],
        confidence: 1.0,
        capturedAt: createTimestamp(),
      },
      workspace: {
        rootPath: this.workspaceRoot,
        projectType: 'unknown',
        frameworks: [],
        activeFile: null,
        selection: null,
        gitBranch: null,
        hasUncommittedChanges: false,
        scannedAt: createTimestamp(),
      },
      memoryRefs: [],
      recentResults: [],
      activePlan: null,
      facts: [],
      constraints: [],
    };
  }

  /**
   * Update context with result
   */
  private updateContext(result: ToolResult): void {
    this.context = {
      ...this.context,
      version: this.context.version + 1,
      updatedAt: createTimestamp(),
      recentResults: [...this.context.recentResults.slice(-9), result],
    };
  }

  /**
   * Send response to stdout
   */
  private send(response: MCPResponse): void {
    const json = JSON.stringify(response);
    process.stdout.write(json + '\n');
  }

  /**
   * Send error response
   */
  private sendError(id: string | number | null, code: number, message: string): void {
    this.send({
      jsonrpc: '2.0',
      id: id ?? 0,
      error: { code, message },
    });
  }

  /**
   * Log to stderr (Claude sees stdout for protocol)
   */
  private log(message: string, data?: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      message,
      ...data,
    };
    process.stderr.write(JSON.stringify(entry) + '\n');
  }
}

// ============ Main ============

function main(): void {
  const server = new AntigravityMCPServer();
  
  // Read from stdin line by line
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', (line) => {
    if (line.trim()) {
      server.handleMessage(line).catch((error) => {
        process.stderr.write(`Error: ${error}\n`);
      });
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });

  // Handle signals
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

main();
