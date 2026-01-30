/**
 * @fileoverview Google Gemini Provider
 * 
 * Implements function calling for Google Gemini models.
 * 
 * @see https://ai.google.dev/docs/function_calling
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
 * Gemini Tool format.
 */
export interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

/**
 * Gemini Function Declaration.
 */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, GeminiProperty>;
    required: string[];
  };
}

/**
 * Gemini Property schema.
 */
export interface GeminiProperty {
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';
  description?: string;
  enum?: string[];
  items?: GeminiProperty;
  properties?: Record<string, GeminiProperty>;
}

/**
 * Gemini Function Call from API response.
 */
export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Gemini Function Response.
 */
export interface GeminiFunctionResponse {
  name: string;
  response: {
    result?: unknown;
    error?: string;
  };
}

/**
 * Google Gemini Provider.
 * 
 * Handles conversion between Antigravity's universal format
 * and Gemini's function calling format.
 * 
 * Compatible with:
 * - Gemini Pro
 * - Gemini Ultra
 * - Gemini 1.5 Pro
 * - Gemini 1.5 Flash
 */
export class GeminiProvider extends BaseProvider {
  constructor(config?: Partial<ProviderConfig>) {
    super({
      provider: LLMProvider.GEMINI,
      endpoint: 'https://generativelanguage.googleapis.com/v1beta',
      ...config,
    });
  }
  
  getName(): string {
    return 'Google Gemini (Function Calling)';
  }
  
  /**
   * Convert Antigravity tool to Gemini function declaration.
   */
  formatTool(tool: ToolDefinition): GeminiFunctionDeclaration {
    const schema = zodToJsonSchema(tool.inputSchema);
    
    return {
      name: this.sanitizeName(tool.id),
      description: tool.description,
      parameters: {
        type: 'OBJECT',
        properties: this.convertProperties(schema.properties),
        required: schema.required,
      },
    };
  }
  
  /**
   * Convert multiple tools to Gemini format.
   */
  formatTools(tools: readonly ToolDefinition[]): GeminiTool {
    return {
      functionDeclarations: tools.map(tool => this.formatTool(tool)),
    };
  }
  
  /**
   * Parse Gemini function call.
   */
  parseToolCall(request: unknown): ToolCallRequest {
    const geminiCall = request as GeminiFunctionCall;
    
    if (geminiCall.name === undefined || geminiCall.name === '') {
      throw new Error('Invalid Gemini function call: missing name');
    }
    
    const callArgs = geminiCall.args;
    
    return {
      provider: LLMProvider.GEMINI,
      toolName: this.restoreName(geminiCall.name),
      arguments: (callArgs !== null && typeof callArgs === 'object' && !Array.isArray(callArgs)) ? callArgs : {},
    };
  }
  
  /**
   * Format result for Gemini function response.
   */
  formatToolResult(response: ToolCallResponse, callId?: string): GeminiFunctionResponse {
    const toolName = callId ?? 'unknown';
    
    if (response.success) {
      return {
        name: toolName,
        response: {
          result: response.result,
        },
      };
    } else {
      return {
        name: toolName,
        response: {
          error: response.error ?? 'Unknown error',
        },
      };
    }
  }
  
  /**
   * Validate provider configuration.
   */
  validate(): boolean {
    // Gemini requires API key
    return this.config.apiKey !== undefined && this.config.apiKey !== '';
  }
  
  /**
   * Convert JSON Schema properties to Gemini format.
   */
  private convertProperties(
    properties: Record<string, unknown>
  ): Record<string, GeminiProperty> {
    const result: Record<string, GeminiProperty> = {};
    
    for (const [key, value] of Object.entries(properties)) {
      result[key] = this.convertProperty(value);
    }
    
    return result;
  }
  
  /**
   * Convert a single JSON Schema property to Gemini format.
   */
  private convertProperty(prop: unknown): GeminiProperty {
    if (prop === null || prop === undefined || typeof prop !== 'object') {
      return { type: 'STRING' };
    }
    
    const p = prop as {
      type?: string;
      description?: string;
      enum?: string[];
      items?: unknown;
    };
    
    const result: GeminiProperty = {
      type: this.convertType(p.type ?? 'string'),
    };
    
    if (p.description !== undefined && p.description !== '') {
      result.description = p.description;
    }
    
    if (p.enum !== undefined) {
      result.enum = p.enum;
    }
    
    if (p.items !== undefined) {
      result.items = this.convertProperty(p.items);
    }
    
    return result;
  }
  
  /**
   * Convert JSON Schema type to Gemini type.
   */
  private convertType(type: string): GeminiProperty['type'] {
    const typeMap: Record<string, GeminiProperty['type']> = {
      string: 'STRING',
      number: 'NUMBER',
      integer: 'NUMBER',
      boolean: 'BOOLEAN',
      array: 'ARRAY',
      object: 'OBJECT',
    };
    
    return typeMap[type.toLowerCase()] ?? 'STRING';
  }
  
  /**
   * Sanitize tool name for Gemini (alphanumeric + underscore only).
   */
  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }
  
  /**
   * Restore original tool name from sanitized version.
   */
  private restoreName(name: string): string {
    return name.replace(/_/g, '.');
  }
  
  /**
   * Create generate content request with tools.
   */
  createGenerateRequest(
    contents: Array<{ role: string; parts: Array<{ text: string }> }>,
    tools: ToolDefinition[],
    options?: {
      model?: string;
      temperature?: number;
      maxOutputTokens?: number;
    }
  ): GeminiGenerateRequest {
    return {
      contents,
      tools: [this.formatTools(tools)],
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxOutputTokens ?? 4096,
      },
    };
  }
}

/**
 * Gemini Generate Content Request.
 */
export interface GeminiGenerateRequest {
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  tools: GeminiTool[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

/**
 * Create Gemini provider instance.
 */
export function createGeminiProvider(config?: Partial<ProviderConfig>): GeminiProvider {
  return new GeminiProvider(config);
}

/**
 * Create Vertex AI Gemini provider instance.
 */
export function createVertexAIProvider(
  projectId: string,
  location: string,
  accessToken: string
): GeminiProvider {
  return new GeminiProvider({
    endpoint: `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}`,
    apiKey: accessToken,
    options: {
      projectId,
      location,
    },
  });
}
