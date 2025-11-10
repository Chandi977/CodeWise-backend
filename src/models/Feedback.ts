import { Schema, model } from 'mongoose';
import { IFeedback } from '../types';

const FeedbackSchema = new Schema<IFeedback>({
  suggestion: { type: String, required: true },
  rating: { type: Number, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

export default model<IFeedback>('Feedback', FeedbackSchema);
