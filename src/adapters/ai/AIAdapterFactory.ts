import { OpenAIAdapter } from './OpenAIAdapter';
import { ClaudeAdapter } from './ClaudeAdapter';
import { OllamaAdapter } from './OllamaAdapter';
import { GeminiAdapter } from './GeminiAdapter';
import { AIAdapter } from './AIAdapter';
import { logger } from '../../utils/logger';

export class AIAdapterFactory {
  private static adapters: Map<string, AIAdapter> = new Map();

  static create(provider: string, options?: any): AIAdapter {
    // Return cached adapter if exists
    if (this.adapters.has(provider)) {
      return this.adapters.get(provider)!;
    }

    let adapter: AIAdapter;

    switch (provider.toLowerCase()) {
      case 'openai':
        adapter = new OpenAIAdapter(options?.apiKey, options?.model);
        break;
      case 'claude':
      case 'anthropic':
        adapter = new ClaudeAdapter(options?.apiKey, options?.model);
        break;
      case 'ollama':
        adapter = new OllamaAdapter(options?.baseURL, options?.model);
        break;
      case 'gemini':
      case 'google':
        adapter = new GeminiAdapter(options?.apiKey, options?.model);
        break;
      default:
        logger.warn(`Unknown AI provider: ${provider}, defaulting to OpenAI`);
        adapter = new OpenAIAdapter();
    }

    // Cache the adapter
    this.adapters.set(provider, adapter);

    return adapter;
  }

  static getAvailableProviders(): string[] {
    return ['openai', 'claude', 'ollama', 'gemini'];
  }

  static clearCache(): void {
    this.adapters.clear();
  }
}
