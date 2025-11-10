/* eslint-disable @typescript-eslint/no-explicit-any */
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { ESLint } from 'eslint';
import * as fsPromises from 'fs/promises';
import path from 'path';

// Detectors
import { SyntaxDetector } from './SyntaxDetector';
import { LogicDetector } from './LogicDetector';
import { PerformanceDetector } from './PerformanceDetector';
import { SecurityDetector } from './SecurityDetector';

// Utils
import { logger } from '../utils/logger';
import { ComplexityCalculator } from './engine/ComplexityCalculator';

// 🧾 Types
export type IssueSeverity = 'error' | 'warning' | 'info';

export interface CodeIssue {
  type: string;
  severity: IssueSeverity;
  message: string;
  line: number;
  column: number;
  filePath: string;
  code?: string;
}

export interface FileAnalysis {
  filePath: string;
  issues: CodeIssue[];
  metrics: {
    linesOfCode: number;
    complexity?: number;
    functions?: number;
    classes?: number;
    imports?: number;
  };
}

export interface MetricsData {
  totalLinesOfCode: number;
  averageComplexity: number;
  totalFunctions: number;
  totalClasses: number;
  maintainabilityIndex: number;
  issueBreakdown: Record<IssueSeverity, number>;
}

export interface AnalysisResult {
  projectPath: string;
  totalFiles: number;
  analyzedFiles: number;
  issues: CodeIssue[];
  metrics: MetricsData;
  fileAnalyses: FileAnalysis[];
  duration: number;
  timestamp: Date;
}

export class AnalysisEngine {
  private eslint: ESLint | null = null;
  private syntaxDetector = new SyntaxDetector();
  private logicDetector = new LogicDetector();
  private performanceDetector = new PerformanceDetector();
  private securityDetector = new SecurityDetector();
  private complexityCalculator = new ComplexityCalculator();

  /**
   * 🚀 Initialize ESLint dynamically for project framework.
   */
  private async initESLintForFramework(framework: string): Promise<void> {
    const baseConfig: any = {
      env: { es2021: true, node: true },
      parserOptions: { ecmaVersion: 2021, sourceType: 'module' },
      extends: [],
      plugins: [],
    };

    switch (framework) {
      case 'react':
      case 'next':
      case 'reactnative':
      case 'expo':
        baseConfig.extends = ['eslint:recommended', 'plugin:react/recommended'];
        baseConfig.plugins = ['react', 'react-hooks'];
        baseConfig.parserOptions.ecmaFeatures = { jsx: true };
        break;
      case 'vue':
      case 'nuxt':
        baseConfig.extends = ['plugin:vue/vue3-recommended'];
        baseConfig.plugins = ['vue'];
        break;
      case 'angular':
      case 'nest':
        baseConfig.extends = ['plugin:@typescript-eslint/recommended'];
        baseConfig.plugins = ['@typescript-eslint'];
        baseConfig.parserOptions.ecmaVersion = 2022;
        break;
      case 'svelte':
        baseConfig.extends = ['plugin:svelte/recommended'];
        baseConfig.plugins = ['svelte'];
        break;
      default:
        baseConfig.extends = ['eslint:recommended'];
    }

    this.eslint = new ESLint({ overrideConfig: baseConfig, useEslintrc: false } as any);
    logger.info(`🧠 ESLint initialized for ${framework.toUpperCase()} project`);
  }

  /**
   * 🔍 Detect probable framework and main source directory.
   */
  private async detectFrameworkAndSource(
    basePath: string,
  ): Promise<{ framework: string; dir: string }> {
    const indicators: Record<string, string[]> = {
      react: ['App.js', 'App.tsx', 'package.json'],
      next: ['next.config.js', 'pages'],
      nest: ['nest-cli.json', 'main.ts'],
      express: ['server.js', 'app.js'],
      vue: ['App.vue', 'main.ts'],
      angular: ['angular.json'],
      svelte: ['App.svelte', 'svelte.config.js'],
      nuxt: ['nuxt.config.js'],
      reactnative: ['react-native.config.js'],
      expo: ['app.json'],
      fullstack: ['frontend', 'backend', 'client', 'server'],
    };

    const dirsToCheck = [
      path.join(basePath, 'src'),
      path.join(basePath, 'frontend'),
      path.join(basePath, 'backend'),
      path.join(basePath, 'server'),
      basePath,
    ];

    let framework = 'node';
    let detectedDir = basePath;

    for (const dir of dirsToCheck) {
      try {
        const entries = await fsPromises.readdir(dir);
        const set = new Set(entries);
        for (const [fw, clues] of Object.entries(indicators)) {
          if (clues.some((c) => set.has(c) || set.has(c.split('/')[0]))) {
            framework = fw;
            detectedDir = dir;
            break;
          }
        }
        if (entries.some((e) => /\.(ts|js|tsx|jsx|vue|svelte)$/.test(e))) break;
      } catch {
        /* ignore missing dirs */
      }
    }

    logger.info(`✅ Detected framework: ${framework.toUpperCase()} (scanning ${detectedDir})`);
    return { framework, dir: detectedDir };
  }

  /**
   * 🧩 Main: Analyze entire codebase.
   */
  public async analyzeCodebase(
    projectPath: string,
    progressCallback?: (progress: number) => void,
  ): Promise<AnalysisResult> {
    const { framework, dir } = await this.detectFrameworkAndSource(projectPath);
    await this.initESLintForFramework(framework);

    const files = await this.getJavaScriptFiles(dir);
    const totalFiles = files.length;
    const start = Date.now();

    const allIssues: CodeIssue[] = [];
    const fileAnalyses: FileAnalysis[] = [];

    logger.info(`🧩 Beginning ${framework.toUpperCase()} analysis for ${totalFiles} files...`);

    // 🔄 Process files sequentially for stability (optional: parallel if small)
    for (let i = 0; i < totalFiles; i++) {
      const filePath = files[i];
      const analysis = await this.analyzeFile(filePath, dir);
      fileAnalyses.push(analysis);
      allIssues.push(...analysis.issues);

      if (progressCallback) {
        try {
          const pct = Math.round(((i + 1) / totalFiles) * 100);
          progressCallback(pct);
        } catch (err) {
          logger.warn(`⚠️ Progress callback failed at ${i + 1}/${totalFiles}`, err);
        }
      }
    }

    const metrics = this.calculateMetrics(fileAnalyses);
    const duration = Date.now() - start;

    logger.info(`✅ Analysis finished: ${totalFiles} files analyzed in ${duration} ms`);

    return {
      projectPath: dir,
      totalFiles,
      analyzedFiles: fileAnalyses.length,
      issues: allIssues,
      metrics,
      fileAnalyses,
      duration,
      timestamp: new Date(),
    };
  }

  /**
   * 📄 Analyze a single file (safe + resilient)
   */
  private async analyzeFile(filePath: string, root: string): Promise<FileAnalysis> {
    const rel = path.relative(root, filePath);
    let code = '';

    try {
      code = await fsPromises.readFile(filePath, 'utf8');
    } catch (err) {
      return {
        filePath: rel,
        issues: [
          {
            type: 'io',
            severity: 'error',
            message: 'Failed to read file',
            line: 0,
            column: 0,
            filePath: rel,
          },
        ],
        metrics: { linesOfCode: 0 },
      };
    }

    const issues: CodeIssue[] = [];
    let ast: any;

    // 🧩 Parse AST
    try {
      ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy', 'vue', 'svelte'] as any,
        errorRecovery: true,
      });
    } catch (err: any) {
      issues.push({
        type: 'syntax',
        severity: 'error',
        message: err.message,
        line: err?.loc?.line ?? 0,
        column: err?.loc?.column ?? 0,
        filePath: rel,
        code: 'PARSE_ERROR',
      });
      return { filePath: rel, issues, metrics: { linesOfCode: code.split('\n').length } };
    }

    // 🧹 ESLint
    try {
      const results = await this.eslint?.lintText(code, { filePath });
      results?.forEach((r) =>
        r.messages.forEach((msg) =>
          issues.push({
            type: 'lint',
            severity: this.mapLintSeverity(msg.severity),
            message: msg.message,
            line: msg.line ?? 0,
            column: msg.column ?? 0,
            filePath: rel,
            code: msg.ruleId ?? 'LINT_ERROR',
          }),
        ),
      );
    } catch (err) {
      logger.warn(`⚠️ ESLint failed for ${rel}`, err);
    }

    // 🔬 Detectors
    const detectors = [
      [this.syntaxDetector, 'Syntax'],
      [this.logicDetector, 'Logic'],
      [this.performanceDetector, 'Performance'],
      [this.securityDetector, 'Security'],
    ] as const;

    for (const [detector, name] of detectors) {
      try {
        const found = await detector.detect(ast, code, rel);
        if (found?.length) issues.push(...found);
      } catch (err) {
        logger.warn(`⚠️ ${name}Detector failed for ${rel}`, err);
      }
    }

    // 📊 Metrics
    const metrics = {
      linesOfCode: code.split('\n').length,
      complexity: this.safeComplexity(ast, rel),
      functions: this.countFunctions(ast),
      classes: this.countClasses(ast),
      imports: this.countImports(ast),
    };

    return { filePath: rel, issues, metrics };
  }

  // ---------------------------------------------------
  // 🧩 Helpers
  // ---------------------------------------------------

  private async getJavaScriptFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (['node_modules', 'dist', 'build', '.git', '.next'].includes(e.name)) continue;
        if (e.isDirectory()) files.push(...(await this.getJavaScriptFiles(full)));
        else if (/\.(mjs|cjs|js|jsx|ts|tsx|vue|svelte)$/.test(e.name)) files.push(full);
      }
    } catch (err: any) {
      logger.warn(`⚠️ Skipping directory ${dir}: ${err.message}`);
    }
    return files;
  }

  private safeComplexity(ast: any, file: string): number {
    try {
      return this.complexityCalculator.calculate(ast);
    } catch (err) {
      logger.warn(`Complexity calc failed for ${file}`, err);
      return 0;
    }
  }

  private calculateMetrics(files: FileAnalysis[]): MetricsData {
    const totals = {
      loc: 0,
      cx: 0,
      fn: 0,
      cl: 0,
      issues: { error: 0, warning: 0, info: 0 } as Record<IssueSeverity, number>,
    };

    for (const f of files) {
      totals.loc += f.metrics.linesOfCode ?? 0;
      totals.cx += f.metrics.complexity ?? 0;
      totals.fn += f.metrics.functions ?? 0;
      totals.cl += f.metrics.classes ?? 0;
      f.issues.forEach((i) => totals.issues[i.severity]++);
    }

    const avgCx = files.length ? totals.cx / files.length : 0;
    return {
      totalLinesOfCode: totals.loc,
      averageComplexity: Math.round(avgCx * 100) / 100,
      totalFunctions: totals.fn,
      totalClasses: totals.cl,
      issueBreakdown: totals.issues,
      maintainabilityIndex: this.calculateMaintainabilityIndex(avgCx, totals.loc),
    };
  }

  private calculateMaintainabilityIndex(c: number, loc: number): number {
    if (!loc) return 0;
    const raw = ((171 - 5.2 * Math.log(loc * Math.log2(loc + 1)) - 0.23 * c) * 100) / 171;
    return Math.max(0, Math.min(100, Math.round(raw * 100) / 100));
  }

  private mapLintSeverity(s: number): IssueSeverity {
    return s === 2 ? 'error' : s === 1 ? 'warning' : 'info';
  }

  private countFunctions(ast: any): number {
    let n = 0;
    traverse(ast, {
      FunctionDeclaration() {
        n++;
      },
      ArrowFunctionExpression() {
        n++;
      },
      FunctionExpression() {
        n++;
      },
    });
    return n;
  }

  private countClasses(ast: any): number {
    let n = 0;
    traverse(ast, {
      ClassDeclaration() {
        n++;
      },
    });
    return n;
  }

  private countImports(ast: any): number {
    let n = 0;
    traverse(ast, {
      ImportDeclaration() {
        n++;
      },
    });
    return n;
  }
}
