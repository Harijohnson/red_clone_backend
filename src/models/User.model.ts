import { Schema, model, Model } from 'mongoose';
import type { IUserDocument } from '../types/user.types';

const userSchema = new Schema<IUserDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['customer', 'operator', 'admin'] as const,
      default: 'customer',
      required: true,
    },
    phone: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Compound index for auth lookups
userSchema.index({ email: 1 });

const User: Model<IUserDocument> = model<IUserDocument>('User', userSchema);

export default User;
