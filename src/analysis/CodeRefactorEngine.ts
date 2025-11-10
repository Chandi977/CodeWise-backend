/* eslint-disable prettier/prettier */
/* ----------------------------------------------
   🧠 CodeRefactorEngine.ts
---------------------------------------------- */
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';

export class CodeRefactorEngine {
  private apiKey: string;
  private model = 'models/gemini-2.5-flash';
  private readonly endpointBase = 'https://generativelanguage.googleapis.com/v1beta';

  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('⚠️ GOOGLE_API_KEY not set — code refactoring will use mock AI.');
    }
  }

  /** 🧠 Gemini-powered refactor (with fallback) */
  private async generateRefactor(content: string, filePath: string): Promise<string> {
    if (!this.apiKey) return this.mockRefactor(content);

    const prompt = `
You are an expert software engineer.
Refactor the following code to improve readability, performance, and maintainability.
Do not change core logic or output behavior.

Return only the refactored code.

File: ${filePath}
---
${content}
---
`;

    try {
      const endpoint = `${this.endpointBase}/${this.model}:generateContent`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.warn(`⚠️ Gemini failed (${response.status}): ${errText}`);
        return this.mockRefactor(content);
      }

      const raw = await response.json();
      const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return text.trim().length ? text : this.mockRefactor(content);
    } catch (err: any) {
      logger.error(`💥 Refactor generation failed: ${err.message}`);
      return this.mockRefactor(content);
    }
  }

  /** 🧩 Mock refactor (free fallback for dev mode) */
  private mockRefactor(code: string): string {
    const cleaned = code
      .replace(/\t/g, '  ')
      .replace(/var\s/g, 'let ')
      .replace(/console\.log\(.+?\);?/g, '// TODO: remove debug log');
    return `// 🧩 Auto-refactored (mock engine)\n${cleaned}`;
  }

  /** 📦 Refactor a file and store result */
  async refactorFile(
    filePath: string,
    outputDir: string,
  ): Promise<{ original: string; refactored: string }> {
    try {
      const code = await fs.readFile(filePath, 'utf8');
      const refactoredCode = await this.generateRefactor(code, filePath);

      const relative = path.basename(filePath);
      const outputFile = path.join(outputDir, relative);
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(outputFile, refactoredCode, 'utf8');

      logger.info(`✅ Refactored code written: ${outputFile}`);
      return { original: code, refactored: refactoredCode };
    } catch (err: any) {
      logger.error(`💥 Refactor failed for ${filePath}: ${err.message}`);
      throw err;
    }
  }
}
