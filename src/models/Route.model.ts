import { Schema, model, Model } from 'mongoose';
import type { IRouteDocument } from '../types/route.types';

const routeSchema = new Schema<IRouteDocument>(
  {
    source: {
      type: String,
      required: true,
      trim: true,
    },
    destination: {
      type: String,
      required: true,
      trim: true,
    },
    distanceKm: {
      type: Number,
      required: true,
      min: 0,
    },
    estimatedDurationMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

// Searching routes by source/destination is the primary lookup pattern
routeSchema.index({ source: 1, destination: 1 }, { unique: true });

const Route: Model<IRouteDocument> = model<IRouteDocument>('Route', routeSchema);

export default Route;
