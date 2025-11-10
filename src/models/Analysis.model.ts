/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Schema, Document } from 'mongoose';

/**
 * 🔍 Interface defining the Analysis document structure
 */
export interface IAnalysis extends Document {
  project: mongoose.Types.ObjectId;
  triggeredBy: mongoose.Types.ObjectId;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  jobId?: string;
  results: {
    totalFiles: number;
    analyzedFiles: number;
    issues: mongoose.Types.ObjectId[];
    suggestions: mongoose.Types.ObjectId[];
    metrics: {
      totalLinesOfCode: number;
      averageComplexity: number;
      maintainabilityIndex: number;
      issueBreakdown: {
        error: number;
        warning: number;
        info: number;
      };
    };
  };
  aiInsights: Array<{
    type: string;
    content: string;
    confidence: number;
  }>;
  duration: number;
  error?: string | null;
  options: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * ⚙️ Subschemas for modular structure
 */
const IssueBreakdownSchema = new Schema(
  {
    error: { type: Number, default: 0, min: 0 },
    warning: { type: Number, default: 0, min: 0 },
    info: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const MetricsSchema = new Schema(
  {
    totalLinesOfCode: { type: Number, default: 0, min: 0 },
    averageComplexity: { type: Number, default: 0, min: 0 },
    maintainabilityIndex: { type: Number, default: 100, min: 0, max: 100 },
    issueBreakdown: { type: IssueBreakdownSchema, default: () => ({}) },
  },
  { _id: false },
);

const RefactoredSchema = new Schema(
  {
    file: { type: String, required: true },
    snippet: { type: String, default: '' },
  },
  { _id: false },
);

const ResultsSchema = new Schema(
  {
    totalFiles: { type: Number, default: 0, min: 0 },
    analyzedFiles: { type: [String], default: [] },
    issues: [{ type: Schema.Types.ObjectId, ref: 'Issue' }],
    suggestions: [{ type: Schema.Types.ObjectId, ref: 'Suggestion' }],
    metrics: { type: MetricsSchema, default: () => ({}) },
    refactored: { type: [RefactoredSchema], default: [] },
  },
  { _id: false },
);

/**
 * 🧩 Main Analysis Schema
 */
const AnalysisSchema = new Schema<IAnalysis>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    triggeredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    jobId: { type: String, index: true },
    duration: { type: Number, default: 0 },
    error: { type: String, default: null },
    results: { type: ResultsSchema, default: () => ({}) },
    aiInsights: {
      type: [
        {
          type: { type: String, required: true },
          content: { type: String, required: true },
          confidence: { type: Number, default: 0.9 },
        },
      ],
      default: [],
    },
    options: { type: Object, default: {} },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

/**
 * 🧠 Virtuals
 */
AnalysisSchema.virtual('isComplete').get(function (this: IAnalysis) {
  return this.status === 'completed';
});

AnalysisSchema.virtual('isFailed').get(function (this: IAnalysis) {
  return this.status === 'failed';
});

AnalysisSchema.virtual('runTimeSeconds').get(function (this: IAnalysis) {
  if (this.startedAt && this.completedAt) {
    return Math.round((+this.completedAt - +this.startedAt) / 1000);
  }
  return null;
});

/**
 * 🪝 Hooks
 */

// Automatically compute duration when completed
AnalysisSchema.pre<IAnalysis>('save', function (next) {
  if (
    this.isModified('status') &&
    this.status === 'completed' &&
    this.startedAt &&
    this.completedAt
  ) {
    this.duration = Math.round((+this.completedAt - +this.startedAt) / 1000);
  }
  next();
});

// Normalize metrics and defaults before save
AnalysisSchema.pre<IAnalysis>('save', function (next) {
  if (!this.results) this.results = {} as any;
  if (!this.results.metrics) this.results.metrics = {} as any;
  const metrics = this.results.metrics;
  metrics.totalLinesOfCode = metrics.totalLinesOfCode ?? 0;
  metrics.averageComplexity = metrics.averageComplexity ?? 0;
  metrics.maintainabilityIndex = metrics.maintainabilityIndex ?? 100;
  next();
});

/**
 * 📊 Indexes for query optimization
 */
AnalysisSchema.index({ project: 1, createdAt: -1 });
AnalysisSchema.index({ triggeredBy: 1, status: 1 });
AnalysisSchema.index({ status: 1, progress: 1 });
AnalysisSchema.index({ 'results.metrics.maintainabilityIndex': 1 });

/**
 * 🧹 Model initialization
 */
export const Analysis = mongoose.model<IAnalysis>('Analysis', AnalysisSchema);
