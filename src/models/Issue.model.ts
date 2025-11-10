import mongoose, { Document, Schema } from 'mongoose';

export interface IIssue extends Document {
  analysis: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  type: 'syntax' | 'logic' | 'performance' | 'security' | 'lint';
  severity: 'error' | 'warning' | 'info';
  message: string;
  code: string;
  filePath: string;
  line: number;
  column: number;
  fix?: {
    description: string;
    code: string;
  };
  status: 'open' | 'resolved' | 'ignored';
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const issueSchema = new Schema<IIssue>(
  {
    analysis: {
      type: Schema.Types.ObjectId,
      ref: 'Analysis',
      required: true,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    type: {
      type: String,
      enum: ['syntax', 'logic', 'performance', 'security', 'lint'],
      required: true,
    },
    severity: {
      type: String,
      enum: ['error', 'warning', 'info'],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    line: {
      type: Number,
      required: true,
    },
    column: {
      type: Number,
      default: 0,
    },
    fix: {
      description: String,
      code: String,
    },
    status: {
      type: String,
      enum: ['open', 'resolved', 'ignored'],
      default: 'open',
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: Date,
  },
  {
    timestamps: true,
  },
);

// Indexes
issueSchema.index({ analysis: 1, type: 1 });
issueSchema.index({ project: 1, status: 1 });
issueSchema.index({ severity: 1, status: 1 });

export const Issue = mongoose.model<IIssue>('Issue', issueSchema);
