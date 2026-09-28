import { Schema, model, Model } from 'mongoose';
import type { ITripDocument } from '../types/trip.types';

const seatInventorySchema = new Schema(
  {
    seatNumber: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['available', 'reserved', 'booked'] as const,
      required: true,
      default: 'available',
    },
    reservedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reservedAt: { type: Date, default: null },
    reservationExpiresAt: { type: Date, default: null },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', default: null },
  },
  { _id: false }
);

const tripSchema = new Schema<ITripDocument>(
  {
    bus: {
      type: Schema.Types.ObjectId,
      ref: 'Bus',
      required: true,
    },
    route: {
      type: Schema.Types.ObjectId,
      ref: 'Route',
      required: true,
    },
    departureTime: {
      type: Date,
      required: true,
    },
    arrivalTime: {
      type: Date,
      required: true,
    },
    pricePerSeat: {
      type: Number,
      required: true,
      min: 0,
    },
    totalSeats: {
      type: Number,
      required: true,
      min: 1,
    },
    seatInventory: {
      type: [seatInventorySchema],
      required: true,
      default: [],
    },
    availableCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: ['scheduled', 'cancelled', 'completed', 'in-progress'] as const,
      default: 'scheduled',
      required: true,
    },
  },
  { timestamps: true }
);

// Core search: find trips on a route departing on a given date
tripSchema.index({ route: 1, departureTime: 1 });
// Filter trips by bus (e.g. operator dashboard)
tripSchema.index({ bus: 1, departureTime: 1 });
// Quick availability filter (replaces availableSeats index)
tripSchema.index({ status: 1, availableCount: 1 });
// Expiry job: find trips with reserved+stale seats
tripSchema.index({ 'seatInventory.status': 1 });
tripSchema.index({ 'seatInventory.reservedAt': 1 });
tripSchema.index({ 'seatInventory.reservationExpiresAt': 1 });

const Trip: Model<ITripDocument> = model<ITripDocument>('Trip', tripSchema);

export default Trip;
