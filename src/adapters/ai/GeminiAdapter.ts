import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIAdapter, CompletionOptions, ModelInfo } from './AIAdapter';
import { logger } from '../../utils/logger';

export class GeminiAdapter implements AIAdapter {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey?: string, model: string = 'gemini-pro') {
    this.client = new GoogleGenerativeAI(apiKey || process.env.GOOGLE_API_KEY || '');
    this.model = model;
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: options?.temperature || 0.7,
          maxOutputTokens: options?.maxTokens || 2048,
          topP: options?.topP || 0.95,
        },
      });

      return result.response.text();
    } catch (error: any) {
      logger.error('Gemini API error:', error);
      throw new Error(`Gemini completion failed: ${error.message}`);
    }
  }

  async streamComplete(prompt: string, onChunk: (chunk: string) => void): Promise<void> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });

      const result = await model.generateContentStream({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      });

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          onChunk(text);
        }
      }
    } catch (error: any) {
      logger.error('Gemini streaming error:', error);
      throw new Error(`Gemini streaming failed: ${error.message}`);
    }
  }

  getModelInfo(): ModelInfo {
    return {
      provider: 'Google',
      model: this.model,
      contextWindow: 30720,
      supportsStreaming: true,
    };
  }
}
