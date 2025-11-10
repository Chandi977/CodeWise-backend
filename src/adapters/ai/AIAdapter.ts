export interface AIAdapter {
  complete(prompt: string, options?: CompletionOptions): Promise<string>;
  streamComplete(prompt: string, onChunk: (chunk: string) => void): Promise<void>;
  getModelInfo(): ModelInfo;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface ModelInfo {
  provider: string;
  model: string;
  contextWindow: number;
  supportsStreaming: boolean;
}
