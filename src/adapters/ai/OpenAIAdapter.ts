import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import OpenAI from 'openai';

import { AIAdapter, CompletionOptions, ModelInfo } from './AIAdapter';
import { logger } from '../../utils/logger';

export class OpenAIAdapter implements AIAdapter {
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string, model: string = 'gpt-4-turbo-preview') {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
    // console.log(apiKey);
    this.model = model;
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert software engineer and code reviewer.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 2000,
        top_p: options?.topP || 1,
        stop: options?.stopSequences,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error: any) {
      logger.error('OpenAI API error:', error);
      throw new Error(`OpenAI completion failed: ${error.message}`);
    }
  }

  async streamComplete(prompt: string, onChunk: (chunk: string) => void): Promise<void> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert software engineer and code reviewer.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 2000,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          onChunk(content);
        }
      }
    } catch (error: any) {
      logger.error('OpenAI streaming error:', error);
      throw new Error(`OpenAI streaming failed: ${error.message}`);
    }
  }

  getModelInfo(): ModelInfo {
    return {
      provider: 'OpenAI',
      model: this.model,
      contextWindow: 128000,
      supportsStreaming: true,
    };
  }
}
