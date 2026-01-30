/**
 * @fileoverview Unified Multi-Provider Server
 * 
 * A single server that exposes tools to ALL supported LLM providers:
 * - Claude (via MCP over stdio)
 * - OpenAI (via HTTP REST API)
 * - Gemini (via HTTP REST API)
 * 
 * This allows the same Antigravity instance to serve multiple LLMs
 * simultaneously, with consistent tool behavior across all.
 */

import * as http from 'http';
import * as readline from 'readline';
import { EventEmitter } from 'events';

import {
  LLMProvider,
  ClaudeProvider,
  OpenAIProvider,
  GeminiProvider,
  type ToolCallResponse,
} from '../providers/index.js';

import { ToolRegistry } from '../mcp/tool-registry.js';
import { filesystemTools } from '../tools/filesystem.js';
import {
  ToolPermission,
  createUniqueId,
  createTimestamp,
  type MCPContext,
  type ToolResult,
  type ToolDefinition,
} from '../types/index.js';

import { v4 as uuidv4 } from 'uuid';

/**
 * Server configuration.
 */
export interface UnifiedServerConfig {
  /** Workspace root path */
  workspaceRoot: string;
  
  /** Enable MCP (stdio) for Claude - default: true */
  enableMCP?: boolean;
  
  /** Enable HTTP server for OpenAI/Gemini - default: true */
  enableHTTP?: boolean;
  
  /** HTTP port - default: 3000 */
  httpPort?: number;
  
  /** API key for HTTP authentication (optional) */
  apiKey?: string | undefined;
  
  /** Granted permissions */
  permissions?: ToolPermission[];
  
  /** Custom tools to register */
  customTools?: ToolDefinition[];
  
  /** Log level */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Unified server events.
 */
export interface UnifiedServerEvents {
  'ready': (providers: LLMProvider[]) => void;
  'tool:call': (provider: LLMProvider, toolName: string, args: unknown) => void;
  'tool:result': (provider: LLMProvider, toolName: string, success: boolean) => void;
  'error': (error: Error, provider?: LLMProvider) => void;
}

/**
 * Unified Multi-Provider Server.
 * 
 * Example usage:
 * ```typescript
 * const server = new UnifiedServer({
 *   workspaceRoot: '/path/to/project',
 *   enableMCP: true,    // For Claude Desktop
 *   enableHTTP: true,   // For OpenAI/Gemini
 *   httpPort: 3000,
 * });
 * 
 * await server.start();
 * ```
 */
export class UnifiedServer extends EventEmitter {
  private readonly config: Required<UnifiedServerConfig>;
  private readonly registry: ToolRegistry;
  private context: MCPContext;
  
  private readonly claudeProvider: ClaudeProvider;
  private readonly openaiProvider: OpenAIProvider;
  private readonly geminiProvider: GeminiProvider;
  
  private httpServer?: http.Server;
  private mcpReadline?: readline.Interface;
  
  constructor(config: UnifiedServerConfig) {
    super();
    
    this.config = {
      workspaceRoot: config.workspaceRoot,
      enableMCP: config.enableMCP ?? true,
      enableHTTP: config.enableHTTP ?? true,
      httpPort: config.httpPort ?? 3000,
      apiKey: config.apiKey ?? '',
      permissions: config.permissions ?? [
        ToolPermission.FILE_READ,
        ToolPermission.FILE_WRITE,
      ],
      customTools: config.customTools ?? [],
      logLevel: config.logLevel ?? 'info',
    };
    
    // Initialize providers
    this.claudeProvider = new ClaudeProvider();
    this.openaiProvider = new OpenAIProvider();
    this.geminiProvider = new GeminiProvider();
    
    // Initialize tool registry
    this.registry = new ToolRegistry({
      grantedPermissions: this.config.permissions,
      allowedCategories: [],
      defaultTimeoutMs: 30000,
      strictValidation: true,
    });
    
    // Register built-in tools
    for (const tool of filesystemTools) {
      this.registry.register(tool as ToolDefinition<Record<string, unknown>, unknown>);
    }
    
    // Register custom tools
    for (const tool of this.config.customTools) {
      this.registry.register(tool);
    }
    
    // Initialize context
    this.context = this.createContext();
    
    this.log('info', 'UnifiedServer initialized', {
      workspace: this.config.workspaceRoot,
      tools: this.registry.list().length,
    });
  }
  
  /**
   * Start the server.
   */
  async start(): Promise<void> {
    const activeProviders: LLMProvider[] = [];
    
    if (this.config.enableMCP) {
      this.startMCPServer();
      activeProviders.push(LLMProvider.CLAUDE);
    }
    
    if (this.config.enableHTTP) {
      await this.startHTTPServer();
      activeProviders.push(LLMProvider.OPENAI, LLMProvider.GEMINI);
    }
    
    this.emit('ready', activeProviders);
  }
  
  /**
   * Stop the server.
   */
  async stop(): Promise<void> {
    if (this.mcpReadline) {
      this.mcpReadline.close();
    }
    
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
    }
    
    this.log('info', 'Server stopped');
  }
  
  /**
   * Start MCP server (stdio) for Claude.
   */
  private startMCPServer(): void {
    this.mcpReadline = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
    
    this.mcpReadline.on('line', (line) => {
      if (!line.trim()) return;
      
      void (async (): Promise<void> => {
        try {
          const request = JSON.parse(line) as MCPRequest;
          const response = await this.handleMCPRequest(request);
          process.stdout.write(JSON.stringify(response) + '\n');
        } catch (error) {
          const errorResponse = this.claudeProvider.createErrorResponse(
            0,
            -32700,
            'Parse error'
          );
          process.stdout.write(JSON.stringify(errorResponse) + '\n');
        }
      })();
    });
    
    this.log('info', 'MCP server started (stdio)');
  }
  
  /**
   * Handle MCP request from Claude.
   */
  private async handleMCPRequest(request: MCPRequest): Promise<unknown> {
    const id = request.id ?? 0;
    
    switch (request.method) {
      case 'initialize':
        return this.claudeProvider.createResponse(id, {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'antigravity', version: '0.2.0' },
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
          },
        });
      
      case 'tools/list': {
        const tools = this.registry.list();
        const mcpTools = tools.map(t => this.claudeProvider.formatTool(t));
        return this.claudeProvider.createResponse(id, { tools: mcpTools });
      }
      
      case 'tools/call': {
        const params = request.params as { name: string; arguments?: Record<string, unknown> };
        const result = await this.executeTool(
          LLMProvider.CLAUDE,
          params.name,
          params.arguments ?? {}
        );
        return this.claudeProvider.createResponse(id, 
          this.claudeProvider.formatToolResult(result)
        );
      }
      
      default:
        return this.claudeProvider.createErrorResponse(id, -32601, 'Method not found');
    }
  }
  
  /**
   * Start HTTP server for OpenAI/Gemini.
   */
  private startHTTPServer(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer = http.createServer((req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }
        
        // API key check
        if (this.config.apiKey !== '') {
          const auth = req.headers.authorization;
          if (auth === undefined || auth !== `Bearer ${this.config.apiKey}`) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }
        }
        
        void this.handleHTTPRequest(req, res).catch((error: unknown) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(error) }));
        });
      });
      
      this.httpServer.listen(this.config.httpPort, () => {
        this.log('info', `HTTP server started on port ${this.config.httpPort}`);
        resolve();
      });
    });
  }
  
  /**
   * Handle HTTP request for OpenAI/Gemini.
   */
  private async handleHTTPRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const url = new URL(req.url ?? '/', `http://localhost:${this.config.httpPort}`);
    
    // Route requests
    switch (url.pathname) {
      case '/':
      case '/health':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          version: '0.2.0',
          providers: ['claude', 'openai', 'gemini'],
        }));
        break;
      
      case '/tools':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.getToolsForHTTP()));
        break;
      
      case '/openai/tools':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.openaiProvider.formatTools(this.registry.list())));
        break;
      
      case '/gemini/tools':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.geminiProvider.formatTools(this.registry.list())));
        break;
      
      case '/execute': {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        
        const body = await this.readBody(req);
        const { provider, tool, arguments: args } = body as {
          provider: 'openai' | 'gemini' | 'generic';
          tool: string;
          arguments: Record<string, unknown>;
        };
        
        const providerType = provider === 'openai' 
          ? LLMProvider.OPENAI 
          : provider === 'gemini'
            ? LLMProvider.GEMINI
            : LLMProvider.GENERIC;
        
        const result = await this.executeTool(providerType, tool, args);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        break;
      }
      
      case '/openai/execute': {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        
        const openaiBody = await this.readBody(req);
        const openaiCall = this.openaiProvider.parseToolCall(openaiBody);
        const openaiResult = await this.executeTool(
          LLMProvider.OPENAI,
          openaiCall.toolName,
          openaiCall.arguments
        );
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          this.openaiProvider.formatToolResult(openaiResult, openaiCall.callId)
        ));
        break;
      }
      
      case '/gemini/execute': {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        
        const geminiBody = await this.readBody(req);
        const geminiCall = this.geminiProvider.parseToolCall(geminiBody);
        const geminiResult = await this.executeTool(
          LLMProvider.GEMINI,
          geminiCall.toolName,
          geminiCall.arguments
        );
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          this.geminiProvider.formatToolResult(geminiResult, geminiCall.toolName)
        ));
        break;
      }
      
      default:
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  }
  
  /**
   * Execute a tool.
   */
  private async executeTool(
    provider: LLMProvider,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResponse> {
    const startTime = Date.now();
    
    this.emit('tool:call', provider, toolName, args);
    this.log('debug', `Tool call from ${provider}`, { tool: toolName, args });
    
    try {
      const result = await this.registry.invoke({
        toolId: toolName,
        input: args,
        context: this.context,
      });
      
      this.updateContext(result);
      
      const response: ToolCallResponse = {
        success: result.success,
        result: result.data,
        error: result.error?.message,
        durationMs: result.durationMs,
      };
      
      this.emit('tool:result', provider, toolName, result.success);
      return response;
      
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const response: ToolCallResponse = {
        success: false,
        result: null,
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      };
      
      this.emit('tool:result', provider, toolName, false);
      return response;
    }
  }
  
  /**
   * Get tools in generic HTTP format.
   */
  private getToolsForHTTP(): HTTPToolList {
    return {
      tools: this.registry.list().map(tool => ({
        name: tool.id,
        description: tool.description,
        category: tool.category,
      })),
    };
  }
  
  /**
   * Read request body.
   */
  private readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }
  
  /**
   * Create initial context.
   */
  private createContext(): MCPContext {
    return {
      id: createUniqueId(uuidv4()),
      sessionId: createUniqueId(uuidv4()),
      version: 1,
      createdAt: createTimestamp(),
      updatedAt: createTimestamp(),
      intent: {
        rawInput: 'Multi-provider session',
        action: 'execute',
        target: 'workspace',
        constraints: [],
        confidence: 1.0,
        capturedAt: createTimestamp(),
      },
      workspace: {
        rootPath: this.config.workspaceRoot,
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
   * Update context with result.
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
   * Log message.
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>
  ): void {
    const levels = ['debug', 'info', 'warn', 'error'];
    if (levels.indexOf(level) < levels.indexOf(this.config.logLevel)) {
      return;
    }
    
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    };
    
    process.stderr.write(JSON.stringify(entry) + '\n');
  }
}

/**
 * MCP Request type.
 */
interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: unknown;
}

/**
 * HTTP Tool List response.
 */
interface HTTPToolList {
  tools: Array<{
    name: string;
    description: string;
    category: string;
  }>;
}

/**
 * Create and start unified server.
 */
export async function startUnifiedServer(
  config: UnifiedServerConfig
): Promise<UnifiedServer> {
  const server = new UnifiedServer(config);
  await server.start();
  return server;
}
