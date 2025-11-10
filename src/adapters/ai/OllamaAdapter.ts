import axios from 'axios';
import { AIAdapter, CompletionOptions, ModelInfo } from './AIAdapter';
import { logger } from '../../utils/logger';

export class OllamaAdapter implements AIAdapter {
  private baseURL: string;
  private model: string;

  constructor(baseURL?: string, model: string = 'codellama') {
    this.baseURL = baseURL || process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = model;
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    try {
      const response = await axios.post(`${this.baseURL}/api/generate`, {
        model: this.model,
        prompt,
        temperature: options?.temperature || 0.7,
        stream: false,
      });

      return response.data.response;
    } catch (error: any) {
      logger.error('Ollama API error:', error);
      throw new Error(`Ollama completion failed: ${error.message}`);
    }
  }

  async streamComplete(prompt: string, onChunk: (chunk: string) => void): Promise<void> {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/generate`,
        {
          model: this.model,
          prompt,
          temperature: 0.7,
          stream: true,
        },
        {
          responseType: 'stream',
        },
      );

      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        lines.forEach((line) => {
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              onChunk(parsed.response);
            }
          } catch (e) {
            // Ignore parse errors
          }
        });
      });

      return new Promise((resolve, reject) => {
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });
    } catch (error: any) {
      logger.error('Ollama streaming error:', error);
      throw new Error(`Ollama streaming failed: ${error.message}`);
    }
  }

  getModelInfo(): ModelInfo {
    return {
      provider: 'Ollama',
      model: this.model,
      contextWindow: 4096,
      supportsStreaming: true,
    };
  }
}
