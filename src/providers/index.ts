/**
 * @fileoverview Provider exports
 */

export * from './base.js';
export * from './claude.js';
export * from './openai.js';
export * from './gemini.js';

// Re-export provider factory
export { LLMProvider } from './base.js';

import { LLMProvider, type ProviderConfig, type BaseProvider } from './base.js';
import { ClaudeProvider } from './claude.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';

/**
 * Create a provider instance based on type.
 */
export function createProvider(config: ProviderConfig): BaseProvider {
  switch (config.provider) {
    case LLMProvider.CLAUDE:
      return new ClaudeProvider(config);
    
    case LLMProvider.OPENAI:
      return new OpenAIProvider(config);
    
    case LLMProvider.GEMINI:
      return new GeminiProvider(config);
    
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/**
 * Get all supported providers.
 */
export function getSupportedProviders(): LLMProvider[] {
  return [
    LLMProvider.CLAUDE,
    LLMProvider.OPENAI,
    LLMProvider.GEMINI,
  ];
}
