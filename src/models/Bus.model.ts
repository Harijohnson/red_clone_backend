import { Schema, model, Model } from 'mongoose';
import type { IBusDocument } from '../types/bus.types';

const seatLayoutSchema = new Schema(
  {
    seatNumber: { type: String, required: true, trim: true },
    deck: {
      type: String,
      enum: ['lower', 'upper', 'single'] as const,
      required: true,
    },
    row: { type: Number, required: true, min: 1 },
    column: { type: Number, required: true, min: 1 },
    type: {
      type: String,
      enum: ['window', 'aisle', 'middle'] as const,
      required: true,
    },
  },
  { _id: false }
);

const busSchema = new Schema<IBusDocument>(
  {
    registrationNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    totalSeats: {
      type: Number,
      required: true,
      min: 1,
    },
    seatType: {
      type: String,
      enum: ['seater', 'sleeper', 'semi-sleeper'] as const,
      required: true,
    },
    seatLayout: {
      type: [seatLayoutSchema],
      required: true,
      default: [],
      validate: {
        validator: (v: unknown[]) => v.length > 0,
        message: 'Bus must have at least one seat in seatLayout',
      },
    },
    amenities: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['active', 'maintenance', 'retired'] as const,
      default: 'active',
      required: true,
    },
    operatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

busSchema.index({ operatedBy: 1, status: 1 });
busSchema.index({ 'seatLayout.seatNumber': 1 });

const Bus: Model<IBusDocument> = model<IBusDocument>('Bus', busSchema);

export default Bus;
