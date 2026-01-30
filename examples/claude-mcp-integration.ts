/**
 * @fileoverview Claude MCP Integration Example
 * 
 * This demonstrates how Antigravity works as an MCP server that Claude
 * (or any MCP client) can connect to and use for agent execution.
 * 
 * ┌─────────────────┐     MCP Protocol      ┌──────────────────────┐
 * │    Claude       │ ◄───────────────────► │    Antigravity       │
 * │  (MCP Client)   │                       │    (MCP Server)      │
 * │                 │   1. List tools       │                      │
 * │  "Read README   │   2. Call tools       │  ┌────────────────┐  │
 * │   and summarize"│   3. Get results      │  │  Tool Registry │  │
 * │                 │                       │  └────────────────┘  │
 * │                 │                       │  ┌────────────────┐  │
 * │                 │                       │  │ Context Manager│  │
 * │                 │                       │  └────────────────┘  │
 * └─────────────────┘                       └──────────────────────┘
 *                                                     │
 *                                                     ▼
 *                                           ┌──────────────────┐
 *                                           │  Actual Tools    │
 *                                           │  - filesystem    │
 *                                           │  - shell         │
 *                                           │  - code analysis │
 *                                           └──────────────────┘
 * 
 * How the flow works:
 * 
 * 1. USER asks Claude: "Read the README and list source files"
 * 
 * 2. CLAUDE (via MCP) calls Antigravity:
 *    - tools/list → gets available tools
 *    - tools/call → filesystem.read_file({ path: "README.md" })
 *    - tools/call → filesystem.list_directory({ path: "src" })
 * 
 * 3. ANTIGRAVITY executes tools and returns results
 * 
 * 4. CLAUDE synthesizes results and responds to user
 */

import {
  ToolRegistry,
  filesystemTools,
  ToolPermission,
  createUniqueId,
  createTimestamp,
  type ToolResult,
  type MCPContext,
  type ToolDefinition,
} from '../src/index.js';

import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

// ============ MCP Server Types ============

/**
 * MCP Tool representation (what Claude sees)
 */
interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * MCP Request from Claude
 */
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP Response to Claude
 */
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

// ============ MCP Server Implementation ============

/**
 * Antigravity MCP Server
 * 
 * This is what Claude connects to. It exposes Antigravity's tools
 * through the Model Context Protocol.
 */
class AntigravityMCPServer {
  private registry: ToolRegistry;
  private context: MCPContext;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    
    // Initialize tool registry with permissions
    this.registry = new ToolRegistry({
      grantedPermissions: [
        ToolPermission.FILE_READ,
        ToolPermission.FILE_WRITE,
        ToolPermission.FILE_DELETE,
        ToolPermission.SHELL_EXECUTE,
      ],
      allowedCategories: [],
      defaultTimeoutMs: 30000,
      strictValidation: true,
    });
    
    // Register all filesystem tools
    for (const tool of filesystemTools) {
      this.registry.register(tool as ToolDefinition<Record<string, unknown>, unknown>);
    }
    
    // Initialize MCP context
    this.context = this.createInitialContext();
    
    console.log(`[MCP Server] Initialized with ${this.registry.list().length} tools`);
  }

  /**
   * Handle incoming MCP request from Claude
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    console.log(`[MCP Server] Received: ${request.method}`);
    
    try {
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);
        
        case 'tools/list':
          return this.handleToolsList(request);
        
        case 'tools/call':
          return await this.handleToolsCall(request);
        
        case 'resources/list':
          return this.handleResourcesList(request);
        
        default:
          return this.errorResponse(request.id, -32601, `Method not found: ${request.method}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.errorResponse(request.id, -32603, message);
    }
  }

  /**
   * MCP initialize - returns server capabilities
   */
  private handleInitialize(request: MCPRequest): MCPResponse {
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
          tools: { listChanged: true },
          resources: { subscribe: false, listChanged: false },
        },
      },
    };
  }

  /**
   * MCP tools/list - returns all available tools
   * 
   * Claude calls this to discover what tools are available.
   */
  private handleToolsList(request: MCPRequest): MCPResponse {
    const tools: MCPTool[] = this.registry.list().map(def => this.toMCPTool(def));
    
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { tools },
    };
  }

  /**
   * MCP tools/call - execute a tool
   * 
   * Claude calls this to invoke a specific tool with arguments.
   */
  private async handleToolsCall(request: MCPRequest): Promise<MCPResponse> {
    const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined;
    
    if (!params?.name) {
      return this.errorResponse(request.id, -32602, 'Missing tool name');
    }

    const toolId = params.name;
    const input = params.arguments ?? {};

    console.log(`[MCP Server] Calling tool: ${toolId}`, input);

    // Invoke through Antigravity's tool registry
    const result = await this.registry.invoke({
      toolId,
      input,
      context: this.context,
    });

    // Update context with result
    this.updateContextWithResult(result);

    if (result.success) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.data, null, 2),
            },
          ],
          isError: false,
        },
      };
    } else {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: `Error: ${result.error?.message ?? 'Unknown error'}`,
            },
          ],
          isError: true,
        },
      };
    }
  }

  /**
   * MCP resources/list - list available resources
   */
  private handleResourcesList(request: MCPRequest): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        resources: [
          {
            uri: `file://${this.workspaceRoot}`,
            name: 'Workspace',
            description: 'The current workspace root',
            mimeType: 'inode/directory',
          },
        ],
      },
    };
  }

  /**
   * Convert Antigravity tool to MCP format
   */
  private toMCPTool(def: ToolDefinition): MCPTool {
    // Extract schema properties from Zod (simplified)
    const schema = def.inputSchema;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    // In real implementation, parse Zod schema properly
    // This is simplified for demonstration
    if ('shape' in schema) {
      const shape = (schema as { shape: Record<string, unknown> }).shape;
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = { type: 'string', description: `Parameter: ${key}` };
        // Check if required (simplified)
        if (value && typeof value === 'object' && !('isOptional' in value)) {
          required.push(key);
        }
      }
    }

    return {
      name: def.id,
      description: def.description,
      inputSchema: {
        type: 'object',
        properties,
        required,
      },
    };
  }

  /**
   * Create initial MCP context
   */
  private createInitialContext(): MCPContext {
    return {
      id: createUniqueId(uuidv4()),
      sessionId: createUniqueId(uuidv4()),
      version: 1,
      createdAt: createTimestamp(),
      updatedAt: createTimestamp(),
      intent: {
        rawInput: 'MCP Session',
        action: 'explore',
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
   * Update context with tool result
   */
  private updateContextWithResult(result: ToolResult): void {
    this.context = {
      ...this.context,
      version: this.context.version + 1,
      updatedAt: createTimestamp(),
      recentResults: [...this.context.recentResults.slice(-9), result],
    };
  }

  /**
   * Create error response
   */
  private errorResponse(id: string | number, code: number, message: string): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };
  }
}

// ============ Simulation: Claude's Perspective ============

/**
 * Simulates what Claude does when connected to Antigravity MCP server.
 * 
 * In reality, Claude handles this internally - we're just showing
 * the flow for educational purposes.
 */
async function simulateClaudeInteraction(server: AntigravityMCPServer): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('SIMULATING CLAUDE MCP INTERACTION');
  console.log('='.repeat(60));

  // Step 1: Claude initializes connection
  console.log('\n[Claude] Initializing MCP connection...');
  const initResponse = await server.handleRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'claude', version: '3.5' },
    },
  });
  console.log('[Claude] Server capabilities:', JSON.stringify(initResponse.result, null, 2));

  // Step 2: Claude lists available tools
  console.log('\n[Claude] Discovering available tools...');
  const toolsResponse = await server.handleRequest({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  });
  const tools = (toolsResponse.result as { tools: MCPTool[] }).tools;
  console.log(`[Claude] Found ${tools.length} tools:`);
  for (const tool of tools) {
    console.log(`  - ${tool.name}: ${tool.description.slice(0, 60)}...`);
  }

  // Step 3: User asks "Read README and list source files"
  console.log('\n[User] "Read the README and list source files"');
  console.log('[Claude] Planning: I\'ll use filesystem tools to help with this.');

  // Step 4: Claude calls read_file tool
  console.log('\n[Claude] Calling filesystem.read_file...');
  const readResponse = await server.handleRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'filesystem.read_file',
      arguments: {
        path: 'README.md',
        startLine: 1,
        endLine: 30,
      },
    },
  });
  
  const readResult = readResponse.result as { content: Array<{ text: string }> };
  const content = readResult.content[0]?.text ?? '';
  console.log('[Claude] File content received:');
  console.log(content.slice(0, 500) + '...');

  // Step 5: Claude calls list_directory tool
  console.log('\n[Claude] Calling filesystem.list_directory...');
  const listResponse = await server.handleRequest({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'filesystem.list_directory',
      arguments: {
        path: 'src',
      },
    },
  });
  
  const listResult = listResponse.result as { content: Array<{ text: string }> };
  const listing = listResult.content[0]?.text ?? '';
  console.log('[Claude] Directory listing received:');
  console.log(listing);

  // Step 6: Claude synthesizes response
  console.log('\n[Claude] Synthesizing response...');
  console.log('─'.repeat(60));
  console.log(`
Based on the README and source structure, this is Antigravity - 
an MCP-backed agent runtime for OrchidsAI IDE.

The src/ directory contains:
- agent/     - Agent lifecycle and decision loop
- mcp/       - MCP context management and tool registry  
- observability/ - Logging and tracing
- tools/     - Built-in tool implementations
- types/     - TypeScript type definitions

Key features:
- Event-driven architecture
- Immutable context management
- Comprehensive observability
- Plugin-based tool system
`);
  console.log('─'.repeat(60));
}

// ============ Main ============

async function main(): Promise<void> {
  const workspaceRoot = path.resolve(__dirname, '..');
  
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     Antigravity MCP Integration Demo                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nWorkspace: ${workspaceRoot}`);
  
  // Create MCP server
  const server = new AntigravityMCPServer(workspaceRoot);
  
  // Simulate Claude interaction
  await simulateClaudeInteraction(server);
  
  console.log('\n✅ Demo complete!');
  console.log('\nTo use Antigravity with real Claude MCP:');
  console.log('1. Build: npm run build');
  console.log('2. Add to Claude Desktop config (claude_desktop_config.json):');
  console.log(`
{
  "mcpServers": {
    "antigravity": {
      "command": "node",
      "args": ["${workspaceRoot.replace(/\\/g, '/')}/dist/mcp-server.js"],
      "cwd": "${workspaceRoot.replace(/\\/g, '/')}"
    }
  }
}
`);
}

main().catch(console.error);
