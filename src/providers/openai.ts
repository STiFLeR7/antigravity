/**
 * @fileoverview OpenAI Provider
 * 
 * Implements function calling for OpenAI GPT models (GPT-4, GPT-4o, etc.)
 * Also compatible with Azure OpenAI and OpenAI-compatible APIs.
 * 
 * @see https://platform.openai.com/docs/guides/function-calling
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
 * OpenAI Tool format.
 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

/**
 * OpenAI Tool Call from API response.
 */
export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * OpenAI Tool Result message.
 */
export interface OpenAIToolResult {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

/**
 * OpenAI Function Calling Provider.
 * 
 * Handles conversion between Antigravity's universal format
 * and OpenAI's function calling format.
 * 
 * Compatible with:
 * - OpenAI API (GPT-4, GPT-4o, GPT-3.5-turbo)
 * - Azure OpenAI
 * - OpenAI-compatible APIs (LocalAI, Ollama, etc.)
 */
export class OpenAIProvider extends BaseProvider {
  constructor(config?: Partial<ProviderConfig>) {
    super({
      provider: LLMProvider.OPENAI,
      endpoint: 'https://api.openai.com/v1',
      ...config,
    });
  }
  
  getName(): string {
    return 'OpenAI (Function Calling)';
  }
  
  /**
   * Convert Antigravity tool to OpenAI function format.
   */
  formatTool(tool: ToolDefinition): OpenAITool {
    const schema = zodToJsonSchema(tool.inputSchema);
    
    return {
      type: 'function',
      function: {
        name: this.sanitizeName(tool.id),
        description: tool.description,
        parameters: {
          type: 'object',
          properties: schema.properties,
          required: schema.required,
        },
      },
    };
  }
  
  /**
   * Convert multiple tools to OpenAI format.
   */
  formatTools(tools: readonly ToolDefinition[]): OpenAITool[] {
    return tools.map(tool => this.formatTool(tool));
  }
  
  /**
   * Parse OpenAI tool call.
   */
  parseToolCall(request: unknown): ToolCallRequest {
    const openaiCall = request as OpenAIToolCall;
    
    if (openaiCall.function?.name === undefined || openaiCall.function.name === '') {
      throw new Error('Invalid OpenAI tool call: missing function name');
    }
    
    let args: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(openaiCall.function.arguments);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      throw new Error('Invalid OpenAI tool call: malformed arguments JSON');
    }
    
    return {
      provider: LLMProvider.OPENAI,
      toolName: this.restoreName(openaiCall.function.name),
      arguments: args,
      callId: openaiCall.id,
    };
  }
  
  /**
   * Format result for OpenAI tool response.
   */
  formatToolResult(response: ToolCallResponse, callId?: string): OpenAIToolResult {
    const content = response.success
      ? typeof response.result === 'string'
        ? response.result
        : JSON.stringify(response.result, null, 2)
      : `Error: ${response.error ?? 'Unknown error'}`;
    
    return {
      role: 'tool',
      tool_call_id: callId ?? 'unknown',
      content,
    };
  }
  
  /**
   * Validate provider configuration.
   */
  validate(): boolean {
    // API key is optional for compatible APIs
    return true;
  }
  
  /**
   * Sanitize tool name for OpenAI (alphanumeric + underscore only).
   */
  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }
  
  /**
   * Restore original tool name from sanitized version.
   */
  private restoreName(name: string): string {
    // Common pattern: filesystem_read_file -> filesystem.read_file
    return name.replace(/_/g, '.');
  }
  
  /**
   * Create chat completion request with tools.
   */
  createChatRequest(
    messages: Array<{ role: string; content: string }>,
    tools: ToolDefinition[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): OpenAIChatRequest {
    return {
      model: options?.model ?? 'gpt-4o',
      messages,
      tools: this.formatTools(tools),
      tool_choice: 'auto',
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
    };
  }
}

/**
 * OpenAI Chat Completion Request.
 */
export interface OpenAIChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  tools: OpenAITool[];
  tool_choice: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
}

/**
 * Create OpenAI provider instance.
 */
export function createOpenAIProvider(config?: Partial<ProviderConfig>): OpenAIProvider {
  return new OpenAIProvider(config);
}

/**
 * Create Azure OpenAI provider instance.
 */
export function createAzureOpenAIProvider(
  endpoint: string,
  apiKey: string,
  deploymentName: string
): OpenAIProvider {
  return new OpenAIProvider({
    endpoint,
    apiKey,
    options: {
      deployment: deploymentName,
      apiVersion: '2024-02-15-preview',
    },
  });
}
