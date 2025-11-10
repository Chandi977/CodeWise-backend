import Anthropic from '@anthropic-ai/sdk';
import { AIAdapter, CompletionOptions, ModelInfo } from './AIAdapter';
import { logger } from '../../utils/logger';

export class ClaudeAdapter implements AIAdapter {
  private client: Anthropic;
  private model: string;

  constructor(apiKey?: string, model: string = 'claude-3-5-sonnet-20241022') {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.model = model;
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
        system: 'You are an expert software engineer and code reviewer.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      return content.type === 'text' ? content.text : '';
    } catch (error: any) {
      logger.error('Claude API error:', error);
      throw new Error(`Claude completion failed: ${error.message}`);
    }
  }

  async streamComplete(prompt: string, onChunk: (chunk: string) => void): Promise<void> {
    try {
      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        temperature: 0.7,
        system: 'You are an expert software engineer and code reviewer.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          onChunk(event.delta.text);
        }
      }
    } catch (error: any) {
      logger.error('Claude streaming error:', error);
      throw new Error(`Claude streaming failed: ${error.message}`);
    }
  }

  getModelInfo(): ModelInfo {
    return {
      provider: 'Anthropic',
      model: this.model,
      contextWindow: 200000,
      supportsStreaming: true,
    };
  }
}
