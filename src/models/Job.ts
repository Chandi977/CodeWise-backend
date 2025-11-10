import { Schema, model } from 'mongoose';
import { IJob } from '../types';

const JobSchema = new Schema<IJob>({
  type: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  data: { type: Schema.Types.Mixed },
});

export default model<IJob>('Job', JobSchema);
