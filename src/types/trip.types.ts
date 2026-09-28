import { Types } from 'mongoose';

export type TripStatus = 'scheduled' | 'cancelled' | 'completed' | 'in-progress';

export type SeatInventoryStatus = 'available' | 'reserved' | 'booked';

export interface ISeatInventoryEntry {
  seatNumber: string;
  status: SeatInventoryStatus;
  reservedBy?: Types.ObjectId;
  reservedAt?: Date;
  reservationExpiresAt?: Date;
  bookingId?: Types.ObjectId;
}

export interface ITrip {
  bus: Types.ObjectId;
  route: Types.ObjectId;
  departureTime: Date;
  arrivalTime: Date;
  pricePerSeat: number;
  totalSeats: number;
  seatInventory: ISeatInventoryEntry[];
  availableCount: number;
  status: TripStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITripDocument extends ITrip {
  _id: Types.ObjectId;
}
