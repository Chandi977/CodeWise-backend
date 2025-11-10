import { Schema, model } from 'mongoose';
import { IFile } from '../types';

const FileSchema = new Schema<IFile>({
  name: { type: String, required: true },
  content: { type: String, required: true },
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
});

export default model<IFile>('File', FileSchema);
