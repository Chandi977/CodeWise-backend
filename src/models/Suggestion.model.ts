import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * Embedded feedback structure for AI suggestions.
 */
export interface IFeedback {
  rating: number;
  comment: string;
  user: Types.ObjectId;
  createdAt?: Date;
}

/**
 * Main Suggestion interface
 */
export interface ISuggestion extends Document {
  analysis: Types.ObjectId;
  project: Types.ObjectId;
  type:
    | 'general'
    | 'performance'
    | 'security'
    | 'logic'
    | 'style'
    | 'fix'
    | 'refactoring'
    | 'optimization';
  title: string;
  createdBy: Types.ObjectId;

  description: string;
  suggestedCode?: string;
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
  relatedIssues: string[];
  confidence: number;
  status: 'pending' | 'applied' | 'rejected';
  appliedBy?: Types.ObjectId;
  appliedAt?: Date;
  feedback?: IFeedback;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Feedback sub-schema with timestamp
 */
const feedbackSchema = new Schema<IFeedback>(
  {
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * Suggestion schema definition
 */
const suggestionSchema = new Schema<ISuggestion>(
  {
    analysis: { type: Schema.Types.ObjectId, ref: 'Analysis', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },

    // ✅ Expanded enum — now supports Gemini suggestion types + legacy ones
    type: {
      type: String,
      enum: [
        'general',
        'performance',
        'security',
        'logic',
        'style',
        'fix',
        'refactoring',
        'optimization',
      ],
      default: 'general',
      required: true,
    },

    title: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true },
    suggestedCode: String,
    reasoning: { type: String, required: true },

    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },

    relatedIssues: [String],
    confidence: { type: Number, min: 0, max: 1, required: true },

    status: {
      type: String,
      enum: ['pending', 'applied', 'rejected'],
      default: 'pending',
    },

    appliedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    appliedAt: Date,
    feedback: feedbackSchema,
  },
  { timestamps: true },
);

// Helpful indexes for analytics and filtering
suggestionSchema.index({ analysis: 1, type: 1 });
suggestionSchema.index({ project: 1, status: 1 });
suggestionSchema.index({ priority: 1, confidence: -1 });

export const Suggestion = mongoose.model<ISuggestion>('Suggestion', suggestionSchema);
