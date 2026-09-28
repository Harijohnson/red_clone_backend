import type { SeatType } from './bus.types';

export interface TripSearchQuery {
  from: string;
  to: string;
  date: string; // ISO date string: YYYY-MM-DD
}

export interface TripSearchResult {
  tripId: string;
  operator: string;
  busName: string;
  busType: SeatType;
  amenities: string[];
  departure: string; // ISO datetime
  arrival: string;   // ISO datetime
  pricePerSeat: number;
  totalSeats: number;
  availableSeats: number;
}

export interface TripSearchResponse {
  trips: TripSearchResult[];
  count: number;
}
