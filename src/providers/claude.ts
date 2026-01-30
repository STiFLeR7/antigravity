/**
 * @fileoverview Claude MCP Provider
 * 
 * Implements the Model Context Protocol (MCP) for Anthropic Claude.
 * MCP uses JSON-RPC 2.0 over stdio for communication.
 * 
 * @see https://modelcontextprotocol.io/
 */

import {
  BaseProvider,
  LLMProvider,
  zodToJsonSchema,
  type ProviderConfig,
  type ToolCallRequest,
  type ToolCallResponse,
} from './base.js';
import type { ToolDefinition } from '../types/tools.types.js';

/**
 * MCP Tool format as expected by Claude.
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * MCP Tool Call from Claude.
 */
export interface MCPToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * MCP Content block.
 */
export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * MCP Tool Result.
 */
export interface MCPToolResult {
  content: MCPContent[];
  isError?: boolean;
}

/**
 * Claude MCP Provider.
 * 
 * Handles conversion between Antigravity's universal format
 * and Claude's MCP protocol.
 */
export class ClaudeProvider extends BaseProvider {
  constructor(config?: Partial<ProviderConfig>) {
    super({
      provider: LLMProvider.CLAUDE,
      ...config,
    });
  }
  
  getName(): string {
    return 'Claude (MCP)';
  }
  
  /**
   * Convert Antigravity tool to MCP format.
   */
  formatTool(tool: ToolDefinition): MCPTool {
    const schema = zodToJsonSchema(tool.inputSchema);
    
    return {
      name: tool.id,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: schema.properties,
        required: schema.required,
      },
    };
  }
  
  /**
   * Convert multiple tools to MCP format.
   */
  formatTools(tools: ToolDefinition[]): { tools: MCPTool[] } {
    return {
      tools: tools.map(tool => this.formatTool(tool)),
    };
  }
  
  /**
   * Parse MCP tool call.
   */
  parseToolCall(request: unknown): ToolCallRequest {
    const mcpCall = request as MCPToolCall;
    
    if (!mcpCall.name) {
      throw new Error('Invalid MCP tool call: missing name');
    }
    
    return {
      provider: LLMProvider.CLAUDE,
      toolName: mcpCall.name,
      arguments: mcpCall.arguments ?? {},
    };
  }
  
  /**
   * Format result for MCP protocol.
   */
  formatToolResult(response: ToolCallResponse, _callId?: string): MCPToolResult {
    if (response.success) {
      return {
        content: [
          {
            type: 'text',
            text: typeof response.result === 'string' 
              ? response.result 
              : JSON.stringify(response.result, null, 2),
          },
        ],
        isError: false,
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${response.error ?? 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
  
  /**
   * Validate provider configuration.
   */
  validate(): boolean {
    // MCP doesn't require API key validation - it's handled by Claude Desktop
    return true;
  }
  
  /**
   * Create MCP JSON-RPC response.
   */
  createResponse(id: string | number, result: unknown): MCPJsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }
  
  /**
   * Create MCP JSON-RPC error response.
   */
  createErrorResponse(id: string | number, code: number, message: string): MCPJsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };
  }
}

/**
 * MCP JSON-RPC Response.
 */
export interface MCPJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Create Claude provider instance.
 */
export function createClaudeProvider(config?: Partial<ProviderConfig>): ClaudeProvider {
  return new ClaudeProvider(config);
}
