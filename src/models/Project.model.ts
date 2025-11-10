import mongoose, { Document, Schema } from 'mongoose';

export interface IProject extends Document {
  name: string;
  description: string;
  owner: mongoose.Types.ObjectId;
  members: Array<{
    user: mongoose.Types.ObjectId;
    role: 'owner' | 'maintainer' | 'viewer';
  }>;
  repository: {
    type: 'upload' | 'github' | 'gitlab';
    url?: string;
    branch?: string;
    accessToken?: string;
  };
  settings: {
    autoAnalysis: boolean;
    analysisSchedule?: string;
    qualityGates: {
      minCoverage: number;
      maxComplexity: number;
      maxIssues: number;
    };
    aiEnabled: boolean;
    aiProvider: string;
  };
  metrics: {
    totalFiles: number;
    linesOfCode: number;
    complexity: number;
    maintainabilityIndex: number;
    lastAnalysis?: Date;
  };
  status: 'active' | 'archived';
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        role: {
          type: String,
          enum: ['owner', 'maintainer', 'viewer'],
          default: 'viewer',
        },
      },
    ],
    repository: {
      type: {
        type: String,
        enum: ['upload', 'github', 'gitlab'],
        required: true,
      },
      url: String,
      branch: {
        type: String,
        default: 'main',
      },
      accessToken: {
        type: String,
        select: false,
      },
    },
    settings: {
      autoAnalysis: {
        type: Boolean,
        default: false,
      },
      analysisSchedule: String,
      qualityGates: {
        minCoverage: {
          type: Number,
          default: 80,
          min: 0,
          max: 100,
        },
        maxComplexity: {
          type: Number,
          default: 10,
        },
        maxIssues: {
          type: Number,
          default: 50,
        },
      },
      aiEnabled: {
        type: Boolean,
        default: true,
      },
      aiProvider: {
        type: String,
        default: 'openai',
      },
    },
    metrics: {
      totalFiles: {
        type: Number,
        default: 0,
      },
      linesOfCode: {
        type: Number,
        default: 0,
      },
      complexity: {
        type: Number,
        default: 0,
      },
      maintainabilityIndex: {
        type: Number,
        default: 0,
      },
      lastAnalysis: Date,
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
    },
    tags: [String],
  },
  {
    timestamps: true,
  },
);

// Indexes
projectSchema.index({ owner: 1, status: 1 });
projectSchema.index({ 'members.user': 1 });
projectSchema.index({ name: 'text', description: 'text' });

export const Project = mongoose.model<IProject>('Project', projectSchema);
