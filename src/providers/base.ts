/**
 * @fileoverview Base provider interface for multi-LLM support.
 * 
 * This abstraction allows the same tools to work with:
 * - Claude (via MCP - Model Context Protocol)
 * - OpenAI/ChatGPT (via Function Calling)
 * - Google Gemini (via Function Calling)
 * - Any future LLM with tool support
 * 
 * @module @stifler7/antigravity/providers
 */

import type { ToolDefinition } from '../types/tools.types.js';

/**
 * Supported LLM providers.
 */
export enum LLMProvider {
  /** Anthropic Claude - uses MCP protocol */
  CLAUDE = 'claude',
  
  /** OpenAI GPT models - uses function calling */
  OPENAI = 'openai',
  
  /** Google Gemini - uses function calling */
  GEMINI = 'gemini',
  
  /** Generic REST API */
  GENERIC = 'generic',
}

/**
 * Provider-agnostic tool schema.
 * This is the internal format that gets converted to each provider's format.
 */
export interface UniversalToolSchema {
  /** Unique tool identifier */
  name: string;
  
  /** Human-readable description */
  description: string;
  
  /** JSON Schema for parameters */
  parameters: {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required: string[];
  };
}

/**
 * JSON Schema property definition.
 */
export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string | undefined;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  default?: unknown;
}

/**
 * Tool call request from any LLM.
 */
export interface ToolCallRequest {
  /** Provider that sent the request */
  provider: LLMProvider;
  
  /** Tool name/ID to invoke */
  toolName: string;
  
  /** Arguments from the LLM */
  arguments: Record<string, unknown>;
  
  /** Optional call ID for tracking */
  callId?: string;
}

/**
 * Tool call response in provider-agnostic format.
 */
export interface ToolCallResponse {
  /** Whether the call succeeded */
  success: boolean;
  
  /** Result data (serializable) */
  result: unknown;
  
  /** Error message if failed */
  error?: string | undefined;
  
  /** Execution time in ms */
  durationMs: number;
}

/**
 * Provider configuration.
 */
export interface ProviderConfig {
  /** Provider type */
  provider: LLMProvider;
  
  /** API key (if needed for validation) */
  apiKey?: string;
  
  /** Custom endpoint URL */
  endpoint?: string;
  
  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * Abstract base class for LLM provider adapters.
 * 
 * Each provider implements this to convert between their
 * native tool format and Antigravity's universal format.
 */
export abstract class BaseProvider {
  readonly provider: LLMProvider;
  protected config: ProviderConfig;
  
  constructor(config: ProviderConfig) {
    this.provider = config.provider;
    this.config = config;
  }
  
  /**
   * Get provider name.
   */
  abstract getName(): string;
  
  /**
   * Convert Antigravity tool to provider's native format.
   */
  abstract formatTool(tool: ToolDefinition): unknown;
  
  /**
   * Convert multiple tools to provider's format.
   */
  abstract formatTools(tools: ToolDefinition[]): unknown;
  
  /**
   * Parse incoming tool call request from provider's format.
   */
  abstract parseToolCall(request: unknown): ToolCallRequest;
  
  /**
   * Format tool result for provider's expected response format.
   */
  abstract formatToolResult(response: ToolCallResponse, callId?: string): unknown;
  
  /**
   * Validate that the provider is properly configured.
   */
  abstract validate(): boolean;
}

/**
 * Convert Zod schema to JSON Schema.
 * This is a simplified converter - production would use zod-to-json-schema.
 */
export function zodToJsonSchema(zodSchema: unknown): UniversalToolSchema['parameters'] {
  const properties: Record<string, JSONSchemaProperty> = {};
  const required: string[] = [];
  
  // Handle Zod object schema
  if (zodSchema !== null && typeof zodSchema === 'object' && '_def' in zodSchema) {
    const def = (zodSchema as { _def: { typeName?: string; shape?: () => Record<string, unknown> } })._def;
    
    if (def.typeName === 'ZodObject' && def.shape) {
      const shape = def.shape();
      
      for (const [key, value] of Object.entries(shape)) {
        const prop = extractZodProperty(value);
        properties[key] = prop.schema;
        if (!prop.optional) {
          required.push(key);
        }
      }
    }
  }
  
  return { type: 'object', properties, required };
}

/**
 * Extract JSON Schema from a Zod property.
 */
function extractZodProperty(zodProp: unknown): { schema: JSONSchemaProperty; optional: boolean } {
  let optional = false;
  let current = zodProp;
  
  // Unwrap optional/default wrappers
  while (current !== null && typeof current === 'object' && '_def' in current) {
    const def = (current as { _def: Record<string, unknown> })._def;
    
    if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') {
      optional = true;
      current = def.innerType;
      continue;
    }
    
    // Extract type
    switch (def.typeName) {
      case 'ZodString':
        return { schema: { type: 'string', description: def.description as string | undefined }, optional };
      
      case 'ZodNumber':
        return { schema: { type: 'number', description: def.description as string | undefined }, optional };
      
      case 'ZodBoolean':
        return { schema: { type: 'boolean', description: def.description as string | undefined }, optional };
      
      case 'ZodEnum':
        return { 
          schema: { 
            type: 'string', 
            enum: def.values as string[],
            description: def.description as string | undefined,
          }, 
          optional,
        };
      
      case 'ZodArray': {
        const itemSchema = extractZodProperty(def.type);
        return { 
          schema: { 
            type: 'array', 
            items: itemSchema.schema,
            description: def.description as string | undefined,
          }, 
          optional,
        };
      }
      
      default:
        return { schema: { type: 'string' }, optional };
    }
  }
  
  return { schema: { type: 'string' }, optional };
}

/**
 * Create a provider instance based on type.
 */
export function createProvider(config: ProviderConfig): BaseProvider {
  // Dynamic import to avoid circular dependencies
  // This will be implemented after we create all providers
  throw new Error(`Provider ${config.provider} not yet loaded. Use specific provider imports.`);
}
