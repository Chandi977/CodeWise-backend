import mongoose, { Document, Schema } from 'mongoose';

export interface IPlugin extends Document {
  name: string;
  version: string;
  description: string;
  author: mongoose.Types.ObjectId;
  type: 'rule' | 'analyzer' | 'reporter';
  config: any;
  code: string;
  isPublic: boolean;
  isActive: boolean;
  downloads: number;
  rating: number;
  reviews: Array<{
    user: mongoose.Types.ObjectId;
    rating: number;
    comment: string;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const pluginSchema = new Schema<IPlugin>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    version: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['rule', 'analyzer', 'reporter'],
      required: true,
    },
    config: Schema.Types.Mixed,
    code: {
      type: String,
      required: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    downloads: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviews: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        rating: {
          type: Number,
          min: 1,
          max: 5,
        },
        comment: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Indexes
pluginSchema.index({ name: 1, version: 1 });
pluginSchema.index({ author: 1 });
pluginSchema.index({ type: 1, isPublic: 1 });

export const Plugin = mongoose.model<IPlugin>('Plugin', pluginSchema);
