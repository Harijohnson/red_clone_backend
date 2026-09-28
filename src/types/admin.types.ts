// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export interface IAdminPaginatedQuery {
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export interface IAdminRouteItem {
  routeId: string;
  source: string;
  destination: string;
  distanceKm: number;
  estimatedDurationMinutes: number;
  createdAt: string;
}

export interface IAdminRouteListResponse {
  routes: IAdminRouteItem[];
  count: number;
}

export interface ICreateRouteRequest {
  source: string;
  destination: string;
  distanceKm: number;
  estimatedDurationMinutes: number;
}

// ---------------------------------------------------------------------------
// Buses
// ---------------------------------------------------------------------------

export interface IAdminSeatLayoutInput {
  seatNumber: string;
  deck: 'lower' | 'upper' | 'single';
  row: number;
  column: number;
  type: 'window' | 'aisle' | 'middle';
}

export interface IAdminBusItem {
  busId: string;
  registrationNumber: string;
  name: string;
  totalSeats: number;
  seatType: 'seater' | 'sleeper' | 'semi-sleeper';
  amenities: string[];
  status: 'active' | 'maintenance' | 'retired';
  operatedBy: string;
  operatorName: string;
}

export interface IAdminBusListResponse {
  buses: IAdminBusItem[];
  count: number;
}

export interface ICreateBusRequest {
  registrationNumber: string;
  name: string;
  totalSeats: number;
  seatType: 'seater' | 'sleeper' | 'semi-sleeper';
  seatLayout: IAdminSeatLayoutInput[];
  amenities?: string[];
  operatedBy: string;
}

export interface IUpdateBusRequest {
  name?: string;
  amenities?: string[];
  status?: 'active' | 'maintenance' | 'retired';
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

export interface IAdminTripItem {
  tripId: string;
  busId: string;
  busName: string;
  routeId: string;
  source: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  pricePerSeat: number;
  totalSeats: number;
  availableCount: number;
  status: string;
}

export interface IAdminTripListResponse {
  trips: IAdminTripItem[];
  count: number;
  page: number;
  totalPages: number;
}

export interface ICreateTripRequest {
  busId: string;
  routeId: string;
  departureTime: string;
  arrivalTime: string;
  pricePerSeat: number;
}

export interface IUpdateTripRequest {
  departureTime?: string;
  arrivalTime?: string;
  pricePerSeat?: number;
  status?: 'scheduled' | 'cancelled' | 'completed' | 'in-progress';
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export interface IAdminBookingItem {
  bookingId: string;
  bookingReference: string;
  bookingStatus: string;
  paymentStatus: string;
  bookedAt: string;
  totalAmount: number;
  seats: string[];
  passengerCount: number;
  user: {
    userId: string;
    name: string;
    email: string;
  };
  trip: {
    tripId: string;
    source: string;
    destination: string;
    departureTime: string;
    busName: string;
  };
}

export interface IAdminBookingListResponse {
  bookings: IAdminBookingItem[];
  count: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface IAdminDashboardResponse {
  totalTrips: number;
  totalBuses: number;
  totalRoutes: number;
  totalBookings: number;
  confirmedBookings: number;
}
