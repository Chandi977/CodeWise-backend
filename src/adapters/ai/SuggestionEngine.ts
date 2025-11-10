/* eslint-disable @typescript-eslint/no-explicit-any */
import OpenAI from 'openai';
import { logger } from '../../utils/logger';

/**
 * Represents an AI-generated code improvement suggestion.
 */
export interface AISuggestion {
  reasoning?: string;
  priority?: 'low' | 'medium' | 'high';
  type: 'performance' | 'security' | 'readability' | 'logic' | 'best-practice' | 'general';
  title: string;
  description: string;
  codeExample?: string;
  confidence: number;
}

/**
 * Represents a static analysis issue detected in code.
 */
export interface AnalysisIssue {
  type: string;
  message: string;
  filePath?: string;
  line?: number;
  severity?: string;
}

/**
 * 💡 SuggestionEngine — safely queries OpenAI to generate structured code improvement suggestions.
 */
export class SuggestionEngine {
  private provider: string;
  private openai?: OpenAI;
  private maxRetries = 3;

  constructor(provider: string = 'openai') {
    this.provider = provider.toLowerCase();

    if (this.provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('Missing OPENAI_API_KEY in environment variables');
      }
      this.openai = new OpenAI({ apiKey });
      logger.info('✅ OpenAI SuggestionEngine initialized');
    } else {
      logger.warn(`⚠️ Unsupported provider: ${provider}. Defaulting to OpenAI.`);
    }
  }

  /**
   * Generate AI-based improvement suggestions.
   */
  public async generateSuggestions(
    issues: AnalysisIssue[],
    context: string = '',
    _projectPath?: string,
  ): Promise<AISuggestion[]> {
    if (!issues || issues.length === 0) {
      logger.info('ℹ️ No issues provided — skipping AI suggestion generation.');
      return [];
    }

    const prompt = this.buildPrompt(issues, context);

    try {
      switch (this.provider) {
        case 'openai':
          return await this.retry(async () => this.getOpenAISuggestions(prompt));
        default:
          throw new Error(`Unknown or unsupported AI provider: ${this.provider}`);
      }
    } catch (error: any) {
      logger.error('❌ SuggestionEngine failed to generate suggestions:', error);
      return [
        {
          type: 'general',
          title: 'AI Generation Failed',
          description: error.message || 'Unknown AI error',
          reasoning: 'The suggestion engine encountered an error while querying the AI model.',
          priority: 'medium',
          confidence: 0.4,
        },
      ];
    }
  }

  /**
   * 🧱 Build prompt string for the AI model.
   */
  private buildPrompt(issues: AnalysisIssue[], context: string): string {
    const summarizedIssues = issues
      .slice(0, 10)
      .map(
        (issue, i) =>
          `${i + 1}. [${(issue.type || 'unknown').toUpperCase()}] ${issue.message}${
            issue.filePath ? ` (File: ${issue.filePath})` : ''
          }`,
      )
      .join('\n');

    return `
You are an expert software code reviewer.

Context: ${context || 'General project'}

Detected Issues:
${summarizedIssues}

Provide 3-7 concrete, prioritized suggestions to improve the codebase.

Respond strictly as a JSON array of objects with this schema:
[
  {
    "type": "performance" | "security" | "readability" | "logic" | "best-practice",
    "title": "Short summary",
    "description": "Detailed explanation and how to fix",
    "reasoning": "Why this fix matters",
    "priority": "low" | "medium" | "high",
    "codeExample": "Optional example",
    "confidence": 0.0 - 1.0
  }
]
`.trim();
  }

  /**
   * 🧠 Query OpenAI for structured code improvement suggestions.
   */
  private async getOpenAISuggestions(prompt: string): Promise<AISuggestion[]> {
    if (!this.openai) throw new Error('OpenAI provider not configured');

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const temperature = parseFloat(process.env.OPENAI_TEMPERATURE || '0.4');
    const timeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '40000', 10);

    logger.info(`🔍 Querying OpenAI model "${model}" with temperature ${temperature}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.openai.chat.completions.create(
        {
          model,
          temperature,
          max_tokens: 1500,
          messages: [
            {
              role: 'system',
              content: 'You are an expert code reviewer. Output valid JSON only.',
            },
            { role: 'user', content: prompt },
          ],
        },
        { signal: controller.signal },
      );

      clearTimeout(timeout);

      const content = response.choices?.[0]?.message?.content?.trim();
      if (!content) {
        logger.warn('⚠️ Empty OpenAI response received.');
        return [];
      }

      return this.parseAISuggestions(content);
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        logger.error('⏱️ OpenAI request timed out.');
      } else {
        logger.error('💥 OpenAI API error:', err.message);
      }
      throw err;
    }
  }

  /**
   * 🧩 Robust JSON parsing with cleanup & fallback.
   */
  private parseAISuggestions(raw: string): AISuggestion[] {
    try {
      // Sometimes the model includes extra markdown or text before JSON.
      const cleaned = raw
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const start = cleaned.indexOf('[');
      const end = cleaned.lastIndexOf(']');
      if (start === -1 || end === -1) throw new Error('No valid JSON array found in response.');

      const jsonSegment = cleaned.slice(start, end + 1);
      const parsed = JSON.parse(jsonSegment);

      if (!Array.isArray(parsed)) {
        throw new Error('Expected array but received object.');
      }

      return parsed.map((item: any) => ({
        type: item.type || 'general',
        title: item.title || 'Untitled Suggestion',
        description: item.description || 'No description provided.',
        reasoning: item.reasoning || '',
        priority: item.priority || 'medium',
        codeExample: item.codeExample,
        confidence: item.confidence || 0.8,
      }));
    } catch (err) {
      logger.warn('⚠️ Failed to parse AI JSON response. Returning raw fallback.');
      logger.warn('⚠️ Raw output:', raw.slice(0, 200));

      return [
        {
          type: 'general',
          title: 'Manual Review Required',
          description: raw,
          reasoning: 'AI output was unstructured or incomplete.',
          priority: 'medium',
          confidence: 0.5,
        },
      ];
    }
  }

  /**
   * ♻️ Simple exponential retry for transient errors or rate limits.
   */
  private async retry<T>(fn: () => Promise<T>, delay = 1500): Promise<T> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const isRetryable =
          err.message?.includes('rate_limit') || err.status === 429 || err.status >= 500;

        if (!isRetryable || attempt === this.maxRetries) {
          throw err;
        }

        const backoff = delay * Math.pow(2, attempt - 1);
        logger.warn(`⏳ Retry ${attempt}/${this.maxRetries} after ${backoff}ms...`);
        await new Promise((res) => setTimeout(res, backoff));
      }
    }
    throw new Error('Retries exhausted');
  }
}
