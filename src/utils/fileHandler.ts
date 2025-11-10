import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger';

export class FileHandler {
  static async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  static async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      logger.warn(`Failed to delete file: ${filePath}`);
    }
  }

  static async deleteDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      logger.warn(`Failed to delete directory: ${dirPath}`);
    }
  }

  static async readFileContent(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
  }

  static async writeFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await this.ensureDir(dir);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  static getFileExtension(filename: string): string {
    return path.extname(filename).toLowerCase();
  }

  static isCodeFile(filename: string): boolean {
    const codeExtensions = [
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '.py',
      '.java',
      '.go',
      '.rb',
      '.php',
      '.cs',
      '.cpp',
      '.c',
      '.h',
    ];
    return codeExtensions.includes(this.getFileExtension(filename));
  }
}
