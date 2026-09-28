import { Types } from 'mongoose';

export type BookingStatus = 'confirmed' | 'cancelled' | 'pending';

export type PaymentStatus = 'paid' | 'unpaid' | 'refunded';

export interface IPassenger {
  name: string;
  age: number;
  seatNumber: string;
}

export interface IBooking {
  trip: Types.ObjectId;
  user: Types.ObjectId;
  bookingReference: string;
  passengers: IPassenger[];
  seatNumbers: string[];
  totalAmount: number;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  bookedAt: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBookingDocument extends IBooking {
  _id: Types.ObjectId;
}
