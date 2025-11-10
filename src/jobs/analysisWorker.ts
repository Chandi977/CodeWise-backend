/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-misused-promises */

import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Worker, Job } from 'bullmq';
import { logger } from '../utils/logger';
import { connectDatabase } from '../config/database';
import { queueConfig, queueConnection } from '../config/queue';
import { Analysis } from '../models/Analysis.model';
import { Issue } from '../models/Issue.model';
import { Suggestion } from '../models/Suggestion.model';
import { Project } from '../models/Project.model';
import { AnalysisEngine } from '../analysis/AnalysisEngine';
import { CodeRefactorEngine } from '../analysis/CodeRefactorEngine';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/* ----------------------------------------------
   ✅ Initialize MongoDB Connection
---------------------------------------------- */
(async () => {
  try {
    await connectDatabase();
    logger.info('✅ MongoDB connected for Analysis Worker');
  } catch (error) {
    logger.error('❌ Failed to connect MongoDB for worker:', error);
    process.exit(1);
  }
})();

/* ----------------------------------------------
   🔮 Gemini Suggestion Engine (Primary)
---------------------------------------------- */
class GeminiSuggestionEngine {
  private readonly apiKey: string;
  private readonly model = 'models/gemini-2.5-flash';
  private readonly endpoint = 'https://generativelanguage.googleapis.com/v1beta';

  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY || '';
    if (!this.apiKey) logger.warn('⚠️ GOOGLE_API_KEY missing — skipping Gemini suggestions.');
    else logger.info('✅ Gemini Suggestion Engine initialized.');
  }

  private async callGeminiAPI(prompt: string, attempt = 1): Promise<any[]> {
    const MAX_ATTEMPTS = 2;
    try {
      const response = await fetch(`${this.endpoint}/${this.model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3 },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 503 && attempt < MAX_ATTEMPTS) {
          const delay = 2000 * attempt;
          logger.warn(`⚠️ Gemini overloaded — retrying in ${delay}ms (attempt ${attempt})`);
          await new Promise((res) => setTimeout(res, delay));
          return this.callGeminiAPI(prompt, attempt + 1);
        }
        throw new Error(`Gemini API error: ${response.status} ${errText}`);
      }

      const raw = await response.json();
      const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const match = text.match(/\[[\s\S]*\]/);
      return match ? JSON.parse(match[0]) : [];
    } catch (error: any) {
      logger.error(`💥 Gemini API error: ${error.message}`);
      return [];
    }
  }

  async generateSuggestions(issues: any[], context: string, projectPath: string): Promise<any[]> {
    if (!this.apiKey) return [];

    const summarizedIssues = issues
      .slice(0, 10)
      .map((i, idx) => {
        const file = i.filePath ? `File: ${i.filePath}` : '';
        const snippet = i.code ? `\nCode:\n${i.code.slice(0, 400)}` : '';
        return `${idx + 1}. ${i.message || i.description}\n${file}${snippet}`;
      })
      .join('\n\n');

    const prompt = `
You are a senior code auditor. Analyze issues and provide step-by-step fixes.

Context:
${context}

Issues:
${summarizedIssues}

Return only JSON:
[
  {
    "type": "general" | "performance" | "security" | "logic" | "style",
    "title": "Brief title",
    "description": "Root cause and fix explanation",
    "file": "File path if known",
    "code_before": "Problematic code snippet",
    "code_after": "Fixed or improved code snippet",
    "priority": "low" | "medium" | "high",
    "confidence": 0.9
  }
]`;

    return this.callGeminiAPI(prompt);
  }
}

/* ----------------------------------------------
   🧩 Local Mock AI Engine (Free Fallback)
---------------------------------------------- */
class LocalMockAIEngine {
  async generateSuggestions(issues: any[]): Promise<any[]> {
    return issues.slice(0, 5).map((issue, i) => ({
      type: 'logic',
      title: `Suggestion for Issue #${i + 1}`,
      description: `Refactor code in ${issue.filePath || 'unknown file'} for clarity.`,
      file: issue.filePath || 'unknown',
      code_before: issue.code?.slice(0, 80) || '',
      code_after: '// TODO: refactor code here.',
      priority: 'low',
      confidence: 0.7,
    }));
  }
}

/* ----------------------------------------------
   🔀 Smart Suggestion Manager (Fallback Safe)
---------------------------------------------- */
class SuggestionEngineManager {
  private readonly gemini = new GeminiSuggestionEngine();
  private readonly local = new LocalMockAIEngine();

  async generateSuggestions(issues: any[], context: string, projectPath: string) {
    logger.info('🧠 Generating AI suggestions via Gemini...');
    const geminiSuggestions = await this.gemini.generateSuggestions(issues, context, projectPath);
    if (geminiSuggestions.length > 0) {
      logger.info(`✅ Gemini generated ${geminiSuggestions.length} suggestions`);
      return geminiSuggestions;
    }
    logger.warn('⚠️ Gemini unavailable — using Local Mock AI fallback');
    return this.local.generateSuggestions(issues);
  }
}

/* ----------------------------------------------
   🔁 Transaction Helper (Retry Safe)
---------------------------------------------- */
async function runWithRetry(jobId: string, fn: (session: mongoose.ClientSession) => Promise<void>) {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await fn(session);
      await session.commitTransaction();
      logger.info(`[Job ${jobId}] ✅ Transaction committed (attempt ${attempt})`);
      return;
    } catch (error: any) {
      const isConflict = error?.message?.includes('Write conflict');
      await session.abortTransaction();
      session.endSession();
      if (isConflict && attempt < MAX_RETRIES) {
        const delay = 500 * attempt;
        logger.warn(`[Job ${jobId}] ⚠️ Write conflict — retrying in ${delay}ms`);
        await new Promise((res) => setTimeout(res, delay));
      } else throw error;
    }
  }
}

/* ----------------------------------------------
   🧠 Main Code Analysis Worker
---------------------------------------------- */
export const analysisWorker = new Worker(
  'analysis',
  async (job: Job) => {
    const { analysisId, projectId, userId } = job.data;
    if (!analysisId || !projectId || !userId)
      throw new Error('Missing analysisId, projectId, or userId in job data');

    const projectPath = path.resolve('uploads', 'projects', projectId);
    const analysisEngine = new AnalysisEngine();
    const suggestionEngine = new SuggestionEngineManager();
    const refactorEngine = new CodeRefactorEngine();
    const startTime = Date.now();

    logger.info(`[Job ${job.id}] 🚀 Starting analysis for project ${projectId}`);

    try {
      // Step 1️⃣: Mark analysis start
      await Analysis.findByIdAndUpdate(analysisId, {
        $set: { status: 'processing', progress: 10, startedAt: new Date() },
      });

      // Step 2️⃣: Perform static analysis
      const analysisResult = await analysisEngine.analyzeCodebase(projectPath, async (progress) => {
        const percent = Math.min(80, 10 + Math.floor(progress * 0.7));
        await job.updateProgress(percent);
        await Analysis.findByIdAndUpdate(analysisId, { progress: percent });
      });

      // ✅ Normalize analysis output
      const issues = analysisResult?.issues || [];
      const totalFiles = analysisResult?.totalFiles || 0;
      const metrics = analysisResult?.metrics || {
        totalLinesOfCode: 0,
        averageComplexity: 0,
        maintainabilityIndex: 0,
        issueBreakdown: { error: 0, warning: 0, info: 0 },
      };

      const rawAnalyzed = analysisResult?.analyzedFiles;
      const analyzedFiles = Array.isArray(rawAnalyzed)
        ? rawAnalyzed
        : Array.isArray(rawAnalyzed?.files)
          ? rawAnalyzed.files
          : [];

      logger.info(`[Job ${job.id}] 🧮 Static analysis complete — ${totalFiles} files analyzed`);

      // Step 3️⃣: Auto-refactor critical files
      const refactorDir = path.resolve('uploads', 'refactored', projectId);
      const refactoredResults: { file: string; originalCode: string; refactoredCode: string }[] =
        [];

      if (Array.isArray(analyzedFiles) && analyzedFiles.length > 0) {
        const filesToRefactor = analyzedFiles.filter((f: string) =>
          issues.some((issue: any) => issue.filePath === f),
        );

        for (const filePath of filesToRefactor.slice(0, 5)) {
          const fullPath = path.resolve(projectPath, filePath);
          const result = await refactorEngine.refactorFile(fullPath, refactorDir);
          refactoredResults.push({
            file: filePath,
            originalCode: result.original,
            refactoredCode: result.refactored,
          });
        }

        logger.info(
          `[Job ${job.id}] 🔧 Refactoring complete — ${refactoredResults.length} files updated`,
        );
      } else {
        logger.warn(`[Job ${job.id}] ⚠️ No analyzed files found, skipping refactor step.`);
      }

      // Step 4️⃣: Save issues, suggestions, and metrics
      await runWithRetry(job.id, async (session) => {
        const issueDocs = await Issue.insertMany(
          issues.map((issue) => ({ ...issue, project: projectId, analysis: analysisId })),
          { session, ordered: false },
        );

        const aiSuggestions = await suggestionEngine.generateSuggestions(
          issues,
          `Project path: ${projectPath}`,
          projectPath,
        );

        const suggestionDocs = aiSuggestions.length
          ? await Suggestion.insertMany(
              aiSuggestions.map((s) => ({
                project: projectId,
                analysis: analysisId,
                type: s.type || 'general',
                title: s.title || 'Untitled Suggestion',
                description: s.description || 'No explanation provided.',
                suggestedCode: s.code_after || '',
                reasoning: s.root_cause || s.description || '',
                priority: s.priority || 'medium',
                confidence: s.confidence ?? 0.9,
                createdBy: userId,
                status: 'pending',
              })),
              { session, ordered: false },
            )
          : [];

        await Analysis.findByIdAndUpdate(
          analysisId,
          {
            $set: {
              status: 'completed',
              progress: 100,
              duration: Date.now() - startTime,
              completedAt: new Date(),
              results: {
                totalFiles,
                analyzedFiles,
                issues: issueDocs.map((i) => i._id),
                suggestions: suggestionDocs.map((s) => s._id),
                metrics,
                refactored: refactoredResults.map((r) => ({
                  file: r.file,
                  snippet: r.refactoredCode.slice(0, 200),
                })),
              },
            },
          },
          { session },
        );

        await Project.findByIdAndUpdate(
          projectId,
          {
            $set: {
              metrics: {
                totalFiles,
                linesOfCode: metrics.totalLinesOfCode,
                complexity: metrics.averageComplexity,
                maintainabilityIndex: metrics.maintainabilityIndex,
                lastAnalyzed: new Date(),
              },
            },
          },
          { session },
        );
      });

      logger.info(`[Job ${job.id}] ✅ Analysis completed successfully`);
    } catch (error: any) {
      logger.error(`[Job ${job.id}] 💀 Analysis failed: ${error.message}`);
      await Analysis.findByIdAndUpdate(analysisId, {
        $set: { status: 'failed', error: error.message },
      });
      throw error;
    }
  },
  {
    connection: queueConnection,
    prefix: queueConfig.prefix,
    concurrency: 2,
    lockDuration: 30 * 60 * 1000,
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86400, count: 50 },
  },
);

/* ----------------------------------------------
   🎯 Worker Lifecycle Events
---------------------------------------------- */
logger.info('🎯 Analysis Worker ready and waiting for jobs...');

analysisWorker.on('completed', (job) => logger.info(`[Job ${job.id}] 🎯 Completed successfully`));
analysisWorker.on('failed', (job, err) =>
  logger.error(`[Job ${job?.id ?? 'unknown'}] 💀 Failed: ${err.message}`),
);
analysisWorker.on('stalled', (jobId) => logger.warn(`[Job ${jobId}] 🚧 Stalled — retrying...`));
analysisWorker.on('error', (err) => logger.error(`⚠️ Worker runtime error: ${err.message}`));

/* ----------------------------------------------
   🔚 Graceful Shutdown
---------------------------------------------- */
const shutdownWorker = async (signal: string) => {
  logger.info(`🧹 Received ${signal} — shutting down worker...`);
  await analysisWorker.close();
  logger.info('✅ Worker closed gracefully');
  process.exit(0);
};

process.on('SIGINT', () => void shutdownWorker('SIGINT'));
process.on('SIGTERM', () => void shutdownWorker('SIGTERM'));

// /* eslint-disable @typescript-eslint/no-explicit-any */
// /* eslint-disable @typescript-eslint/no-misused-promises */

// import path from 'path';
// import dotenv from 'dotenv';
// dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// import { Worker, Job } from 'bullmq';
// import mongoose from 'mongoose';
// import { logger } from '../utils/logger';
// import { connectDatabase } from '../config/database';
// import { queueConfig, queueConnection } from '../config/queue';
// import { Analysis } from '../models/Analysis.model';
// import { Issue } from '../models/Issue.model';
// import { Suggestion } from '../models/Suggestion.model';
// import { Project } from '../models/Project.model';
// import { AnalysisEngine } from '../analysis/AnalysisEngine';
// import { AIAdapterFactory } from '../adapters/AIAdapterFactory';

// // ✅ Connect to MongoDB before starting worker
// (async () => {
//   try {
//     await connectDatabase();
//     logger.info('✅ MongoDB connected for Analysis Worker');
//   } catch (err) {
//     logger.error('❌ Failed to connect MongoDB for worker:', err);
//     process.exit(1);
//   }
// })();

// /**
//  * 🧠 Unified Suggestion Generator (Multi-Provider AI)
//  */
// class MultiAISuggestionEngine {
//   private adapters: string[];

//   constructor() {
//     // Define which providers to use (in priority order)
//     this.adapters = ['gemini', 'openai', 'claude']; // can include 'ollama'

//     logger.info(`✅ Initialized MultiAI Suggestion Engine using: ${this.adapters.join(', ')}`);
//   }

//   async generateSuggestions(issues: any[], context: string, projectPath: string) {
//     const summarizedIssues = issues
//       .slice(0, 10)
//       .map((i: any, idx: number) => `${idx + 1}. ${i.message || i.description}`)
//       .join('\n');

//     const prompt = `
// You are a senior software engineer and code reviewer.
// Analyze the following issues and suggest improvements.

// Context: ${context}

// Issues:
// ${summarizedIssues}

// Respond strictly in JSON format:
// [
//   {
//     "type": "general" | "performance" | "security" | "logic" | "style",
//     "title": "Brief title",
//     "description": "Explanation of issue and fix",
//     "codeExample": "Improved code snippet",
//     "priority": "low" | "medium" | "high",
//     "confidence": 0.9
//   }
// ]
// `;

//     const aggregatedSuggestions: any[] = [];

//     // 🔁 Loop through all enabled AI adapters
//     for (const provider of this.adapters) {
//       try {
//         const apiKey =
//           provider === 'gemini'
//             ? process.env.GOOGLE_API_KEY
//             : provider === 'openai'
//             ? process.env.OPENAI_API_KEY
//             : provider === 'claude'
//             ? process.env.CLAUDE_API_KEY
//             : undefined;

//         const model =
//           provider === 'gemini'
//             ? 'models/gemini-2.5-flash'
//             : provider === 'openai'
//             ? 'gpt-4o-mini'
//             : provider === 'claude'
//             ? 'claude-3-5-sonnet'
//             : 'llama3';

//         const adapter = AIAdapterFactory.create(provider, { apiKey, model });

//         logger.info(`🧩 Generating suggestions using ${provider.toUpperCase()}...`);
//         const suggestions = await adapter.generateSuggestions(prompt);

//         if (suggestions && Array.isArray(suggestions)) {
//           logger.info(`🤖 ${provider.toUpperCase()} generated ${suggestions.length} suggestions`);
//           aggregatedSuggestions.push(
//             ...suggestions.map((s) => ({ ...s, source: provider }))
//           );
//         } else {
//           logger.warn(`⚠️ ${provider} returned no valid suggestions`);
//         }
//       } catch (err: any) {
//         logger.error(`💥 ${provider.toUpperCase()} adapter failed: ${err.message}`);
//       }
//     }

//     // ✅ Deduplicate by title
//     const unique = aggregatedSuggestions.filter(
//       (s, index, self) => index === self.findIndex((t) => t.title === s.title)
//     );

//     logger.info(`🧠 Aggregated ${unique.length} unique suggestions from all AI providers`);
//     return unique;
//   }
// }

// /**
//  * 🧩 Worker for handling project code analysis jobs.
//  */
// export const analysisWorker = new Worker(
//   'analysis',
//   async (job: Job) => {
//     const { analysisId, projectId, userId } = job.data;

//     if (!analysisId || !projectId || !userId) {
//       throw new Error('Missing analysisId, projectId, or userId in job data');
//     }

//     const projectPath = path.resolve('uploads', 'projects', projectId);
//     const analysisEngine = new AnalysisEngine();
//     const suggestionEngine = new MultiAISuggestionEngine();
//     const startTime = Date.now();

//     logger.info(`[Job ${job.id}] 🚀 Starting analysis for project ${projectId}`);

//     try {
//       // 1️⃣ Mark analysis start
//       await Analysis.findByIdAndUpdate(analysisId, {
//         $set: { status: 'processing', progress: 10, startedAt: new Date() },
//       });

//       // 2️⃣ Static analysis phase
//       const analysisResult = await analysisEngine.analyzeCodebase(
//         projectPath,
//         async (progress: number) => {
//           const percent = Math.min(80, 10 + Math.floor(progress * 0.7));
//           await job.updateProgress(percent);
//           await Analysis.findByIdAndUpdate(analysisId, { progress: percent });
//         }
//       );

//       const {
//         issues,
//         totalFiles = 0,
//         analyzedFiles = [],
//         metrics = {
//           totalLinesOfCode: 0,
//           averageComplexity: 0,
//           maintainabilityIndex: 0,
//           issueBreakdown: { error: 0, warning: 0, info: 0 },
//         },
//       } = analysisResult as any;

//       logger.info(
//         `[Job ${job.id}] 🧮 Static analysis complete — ${totalFiles} files analyzed`
//       );

//       // 3️⃣ Transactional save (atomic)
//       const session = await mongoose.startSession();
//       session.startTransaction();

//       try {
//         const issueDocs = await Issue.insertMany(
//           issues.map((issue: any) => ({
//             ...issue,
//             project: projectId,
//             analysis: analysisId,
//           })),
//           { session }
//         );

//         // 4️⃣ Generate multi-provider AI suggestions
//         const aiSuggestions = await suggestionEngine.generateSuggestions(
//           issues,
//           `Project path: ${projectPath}`,
//           projectPath
//         );

//         const suggestionDocs = aiSuggestions.length
//           ? await Suggestion.insertMany(
//               aiSuggestions.map((s: any) => ({
//                 project: projectId,
//                 analysis: analysisId,
//                 type: s.type || 'general',
//                 title: s.title,
//                 description: s.description,
//                 suggestedCode: s.codeExample,
//                 reasoning: s.description,
//                 priority: s.priority || 'medium',
//                 relatedIssues: [],
//                 confidence: s.confidence ?? 0.9,
//                 status: 'pending',
//                 createdBy: userId,
//                 source: s.source || 'unknown',
//               })),
//               { session }
//             )
//           : [];

//         // 5️⃣ Update analysis and project metrics
//         await Analysis.findByIdAndUpdate(
//           analysisId,
//           {
//             $set: {
//               status: 'completed',
//               progress: 100,
//               duration: Date.now() - startTime,
//               completedAt: new Date(),
//               results: {
//                 totalFiles,
//                 analyzedFiles,
//                 issues: issueDocs.map((i) => i._id),
//                 suggestions: suggestionDocs.map((s) => s._id),
//                 metrics,
//               },
//             },
//           },
//           { session }
//         );

//         await Project.findByIdAndUpdate(
//           projectId,
//           {
//             $set: {
//               metrics: {
//                 totalFiles,
//                 linesOfCode: metrics.totalLinesOfCode,
//                 complexity: metrics.averageComplexity,
//                 maintainabilityIndex: metrics.maintainabilityIndex,
//                 lastAnalyzed: new Date(),
//               },
//             },
//           },
//           { session }
//         );

//         await session.commitTransaction();
//         logger.info(`[Job ${job.id}] ✅ Analysis + Multi-AI suggestions completed.`);
//       } catch (dbErr) {
//         await session.abortTransaction();
//         logger.error(`[Job ${job.id}] 💥 Transaction aborted: ${dbErr.message}`);
//         throw dbErr;
//       } finally {
//         session.endSession();
//       }
//     } catch (error: any) {
//       logger.error(`[Job ${job.id}] 💀 Analysis failed: ${error.message}`);
//       await Analysis.findByIdAndUpdate(analysisId, {
//         $set: { status: 'failed', error: error.message },
//       });
//       throw error;
//     }
//   },
//   {
//     connection: queueConnection,
//     prefix: queueConfig.prefix,
//     concurrency: 2,
//     lockDuration: 30 * 60 * 1000,
//     removeOnComplete: { age: 3600, count: 100 },
//     removeOnFail: { age: 86400, count: 50 },
//   }
// );

// /** 🎯 Worker lifecycle logs */
// logger.info('🎯 Multi-AI Analysis Worker started and waiting for jobs...');

// analysisWorker.on('completed', (job) =>
//   logger.info(`[Job ${job.id}] 🎯 Completed successfully`)
// );
// analysisWorker.on('failed', (job, err) =>
//   logger.error(`[Job ${job?.id ?? 'unknown'}] 💀 Failed: ${err.message}`)
// );
// analysisWorker.on('stalled', (jobId) =>
//   logger.warn(`[Job ${jobId}] 🚧 Stalled — retrying...`)
// );
// analysisWorker.on('error', (err) =>
//   logger.error(`⚠️ Worker runtime error: ${err.message}`)
// );

// const shutdownWorker = async (signal: string) => {
//   logger.info(`🧹 Received ${signal} — closing analysis worker...`);
//   await analysisWorker.close();
//   logger.info('✅ Worker closed gracefully');
//   process.exit(0);
// };
// process.on('SIGINT', () => void shutdownWorker('SIGINT'));
// process.on('SIGTERM', () => void shutdownWorker('SIGTERM'));
