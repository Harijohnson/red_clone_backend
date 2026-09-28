import { Schema, model, Model } from 'mongoose';
import type { IBookingDocument } from '../types/booking.types';

const passengerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 0 },
    seatNumber: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const bookingSchema = new Schema<IBookingDocument>(
  {
    trip: {
      type: Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    bookingReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    passengers: {
      type: [passengerSchema],
      required: true,
      validate: {
        validator: (v: unknown[]) => v.length > 0,
        message: 'At least one passenger is required',
      },
    },
    seatNumbers: {
      type: [String],
      required: true,
      validate: {
        validator: (v: unknown[]) => v.length > 0,
        message: 'At least one seat number is required',
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    bookingStatus: {
      type: String,
      enum: ['confirmed', 'cancelled', 'pending'] as const,
      default: 'pending',
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['paid', 'unpaid', 'refunded'] as const,
      default: 'unpaid',
      required: true,
    },
    bookedAt: {
      type: Date,
      default: () => new Date(),
      required: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Fetch all bookings for a user
bookingSchema.index({ user: 1, createdAt: -1 });
// Fetch all bookings for a trip (e.g. manifest)
bookingSchema.index({ trip: 1 });
// Seat-conflict audit: which booking holds a given seat on a trip
bookingSchema.index({ trip: 1, seatNumbers: 1 });
// Expiry job: find pending bookings that have timed out
bookingSchema.index({ bookingStatus: 1, expiresAt: 1 });

const Booking: Model<IBookingDocument> = model<IBookingDocument>('Booking', bookingSchema);

export default Booking;
