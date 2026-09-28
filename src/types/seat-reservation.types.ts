import type { DeckType, SeatPositionType, SeatType } from './bus.types';

/** Reads SEAT_LOCK_DURATION_SECONDS from env; falls back to 300 (5 min). */
export function getLockTtlSeconds(): number {
  const raw = process.env.SEAT_LOCK_DURATION_SECONDS;
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return 300;
}

/** @deprecated use getLockTtlSeconds() */
export const LOCK_TTL_SECONDS = 600;

/** Status exposed in the public API response. DB-internal 'reserved' surfaces as 'locked'. */
export type SeatAvailabilityStatus = 'available' | 'booked' | 'locked';

export interface ISeatAvailabilityEntry {
  number: string;
  type: SeatType;
  status: SeatAvailabilityStatus;
  deck: DeckType;
  row: number;
  column: number;
  position: SeatPositionType;
  price: number;
  isLockedByMe: boolean;
  isFemaleSeat: boolean;
}

export interface ITripSeatsResponse {
  tripId: string;
  seats: ISeatAvailabilityEntry[];
  lockTtlSeconds: number;
}

export interface ILockSeatsRequest {
  seatNumbers: string[];
}

export interface ILockSeatsResponse {
  lockedSeats: string[];
  expiresAt: string;
}

/** No body needed — DELETE identifies the user via JWT and releases all their active locks on the trip. */
export type IReleaseLockRequest = Record<string, never>;

export interface IConfirmBookingRequest {
  paymentReference?: string;
}

export interface IConfirmBookingResponse {
  bookingId: string;
  bookingStatus: 'confirmed';
  paymentStatus: 'paid';
}

// ---------------------------------------------------------------------------
// POST /api/bookings — create a confirmed booking from active seat locks
// ---------------------------------------------------------------------------

export interface IPassengerInput {
  name: string;
  age: number;
  seatNumber: string;
}

export interface ICreateBookingRequest {
  tripId: string;
  passengers: IPassengerInput[];
}

export interface IBookingTripInfo {
  tripId: string;
  departureTime: string;
  arrivalTime: string;
  source: string;
  destination: string;
  busName: string;
}

export interface IBookingPassenger {
  name: string;
  age: number;
  seatNumber: string;
}

export interface ICreateBookingResponse {
  bookingId: string;
  bookingReference: string;
  trip: IBookingTripInfo;
  passengers: IBookingPassenger[];
  seats: string[];
  totalAmount: number;
  bookingStatus: 'confirmed';
}

/** @deprecated use ISeatAvailabilityEntry */
export type ISeatAvailabilityResponse = ISeatAvailabilityEntry;

// Legacy aliases — shape has changed; kept for reference only
export type IReserveSeatsRequest = ILockSeatsRequest;
export type IReservationResult = ILockSeatsResponse;

// ---------------------------------------------------------------------------
// GET /api/bookings/:bookingId — single booking detail
// ---------------------------------------------------------------------------

export interface IBookingDetailResponse {
  bookingId: string;
  bookingReference: string;
  bookingStatus: string;
  paymentStatus: string;
  bookedAt: string;
  totalAmount: number;
  trip: IBookingTripInfo;
  passengers: IBookingPassenger[];
  seats: string[];
}

// ---------------------------------------------------------------------------
// GET /api/bookings — booking list item (less detail than full booking)
// ---------------------------------------------------------------------------

export interface IBookingListItem {
  bookingId: string;
  bookingReference: string;
  bookingStatus: string;
  paymentStatus: string;
  bookedAt: string;
  totalAmount: number;
  seats: string[];
  trip: {
    tripId: string;
    departureTime: string;
    arrivalTime: string;
    source: string;
    destination: string;
    busName: string;
  };
}

export interface IBookingListResponse {
  bookings: IBookingListItem[];
  count: number;
}
