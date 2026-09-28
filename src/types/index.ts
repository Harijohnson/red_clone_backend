export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface ApiError {
  message: string;
  status: number;
}

export type { BusStatus, SeatType, DeckType, SeatPositionType, ISeatLayout, IBus, IBusDocument } from './bus.types';
export type { TripStatus, SeatInventoryStatus, ISeatInventoryEntry, ITrip, ITripDocument } from './trip.types';
export type { BookingStatus, PaymentStatus, IPassenger, IBooking, IBookingDocument } from './booking.types';
export type {
  IReserveSeatsRequest,
  IConfirmBookingRequest,
  ISeatAvailabilityResponse,
  IReservationResult,
} from './seat-reservation.types';
export type { IRegisterInput, ILoginInput, IAuthUser, IAuthResponse, IJwtPayload } from './auth.types';
