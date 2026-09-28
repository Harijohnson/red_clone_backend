import crypto from 'crypto';
import { Types } from 'mongoose';
import Trip from '../models/Trip.model';
import Booking from '../models/Booking.model';
import type { IBusDocument } from '../types/bus.types';
import type { IRouteDocument } from '../types/route.types';
import type { ITripDocument } from '../types/trip.types';
import type {
  ICreateBookingRequest,
  ICreateBookingResponse,
  IPassengerInput,
  IBookingDetailResponse,
  IBookingListResponse,
  IBookingListItem,
} from '../types/seat-reservation.types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeAppError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

function generateBookingReference(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `BK-${datePart}-${randomPart}`;
}

// ---------------------------------------------------------------------------
// POST /api/bookings — create a confirmed booking from active seat locks
// ---------------------------------------------------------------------------

export async function createBooking(
  userId: string,
  body: ICreateBookingRequest,
): Promise<ICreateBookingResponse> {
  const { tripId, passengers } = body;

  // ── Input validation ──────────────────────────────────────────────────────

  if (!tripId || !Types.ObjectId.isValid(tripId)) {
    throw makeAppError('Invalid trip ID', 400);
  }

  if (!Array.isArray(passengers) || passengers.length === 0) {
    throw makeAppError('passengers must be a non-empty array', 400);
  }

  for (const p of passengers) {
    if (typeof p.name !== 'string' || p.name.trim().length < 1) {
      throw makeAppError('Each passenger must have a non-empty name', 400);
    }
    if (typeof p.age !== 'number' || !Number.isInteger(p.age) || p.age < 0) {
      throw makeAppError('Each passenger must have a valid age (non-negative integer)', 400);
    }
    if (typeof p.seatNumber !== 'string' || p.seatNumber.trim().length < 1) {
      throw makeAppError('Each passenger must have a non-empty seatNumber', 400);
    }
  }

  // Ensure passenger seatNumbers are unique
  const passengerSeats = passengers.map((p) => p.seatNumber.trim());
  const uniquePassengerSeats = new Set(passengerSeats);
  if (uniquePassengerSeats.size !== passengerSeats.length) {
    throw makeAppError('Duplicate seatNumbers in passengers', 400);
  }

  const requestedSeatNumbers = [...uniquePassengerSeats];
  const userObjectId = new Types.ObjectId(userId);

  // ── Load trip with route and bus ─────────────────────────────────────────

  const trip = await Trip.findById(tripId)
    .populate<{ bus: IBusDocument }>('bus')
    .populate<{ route: IRouteDocument }>('route')
    .exec();

  if (!trip) throw makeAppError('Trip not found', 404);
  if (trip.status !== 'scheduled') {
    throw makeAppError('Trip is not available for booking', 409);
  }

  // ── Verify seats exist on the bus ────────────────────────────────────────

  const busLayoutNumbers = new Set(
    (trip.bus as IBusDocument).seatLayout.map((s) => s.seatNumber),
  );
  for (const sn of requestedSeatNumbers) {
    if (!busLayoutNumbers.has(sn)) {
      throw makeAppError(`Seat ${sn} does not exist on this bus`, 400);
    }
  }

  // ── Verify each seat has an active lock owned by this user ───────────────

  const now = new Date();
  const inventoryMap = new Map(trip.seatInventory.map((s) => [s.seatNumber, s]));

  for (const sn of requestedSeatNumbers) {
    const entry = inventoryMap.get(sn);
    if (!entry) {
      throw makeAppError(`Seat ${sn} is not in this trip's inventory`, 400);
    }
    if (entry.status === 'booked') {
      throw makeAppError(`Seat ${sn} is already booked`, 409);
    }
    if (entry.status !== 'reserved') {
      throw makeAppError(`Seat ${sn} is not locked. Please lock seats before booking.`, 409);
    }
    if (entry.reservedBy?.toString() !== userId) {
      throw makeAppError(`Seat ${sn} is not locked by you`, 403);
    }
    if (entry.reservationExpiresAt == null || entry.reservationExpiresAt <= now) {
      throw makeAppError(`Lock on seat ${sn} has expired. Please lock seats again.`, 410);
    }
  }

  // ── Calculate authoritative total (never trust the client) ───────────────

  const pricePerSeat: number = trip.pricePerSeat;
  const totalAmount = pricePerSeat * requestedSeatNumbers.length;

  // ── Atomically transition reserved → booked ──────────────────────────────
  //
  // The match condition requires every seat to still be 'reserved' by this user
  // and not expired. If any seat was stolen or expired between our read above
  // and this write, the update returns null → 409.
  //
  // This single atomic update is the concurrency gate. No booking document is
  // created unless it succeeds, so a failed update leaves no orphaned booking.

  const seatFieldUpdates: Record<string, unknown> = {};
  for (let i = 0; i < requestedSeatNumbers.length; i++) {
    seatFieldUpdates[`seatInventory.$[el${i}].status`] = 'booked';
    seatFieldUpdates[`seatInventory.$[el${i}].reservedBy`] = null;
    seatFieldUpdates[`seatInventory.$[el${i}].reservedAt`] = null;
    seatFieldUpdates[`seatInventory.$[el${i}].reservationExpiresAt`] = null;
  }

  const confirmedTrip = await Trip.findOneAndUpdate(
    {
      _id: tripId,
      status: 'scheduled',
      // Every seat must still be reserved by this user and not expired
      $and: requestedSeatNumbers.map((sn) => ({
        seatInventory: {
          $elemMatch: {
            seatNumber: sn,
            status: 'reserved',
            reservedBy: userObjectId,
            reservationExpiresAt: { $gt: now },
          },
        },
      })),
    },
    { $set: seatFieldUpdates },
    {
      arrayFilters: requestedSeatNumbers.map((sn, i) => ({
        [`el${i}.seatNumber`]: sn,
        [`el${i}.status`]: 'reserved',
        [`el${i}.reservedBy`]: userObjectId,
        [`el${i}.reservationExpiresAt`]: { $gt: now },
      })),
      returnDocument: 'after',
    },
  ).exec();

  if (!confirmedTrip) {
    // Re-read to give a precise error message
    const freshTrip = await Trip.findById(tripId).exec();
    if (!freshTrip) throw makeAppError('Trip not found', 404);

    const freshMap = new Map(freshTrip.seatInventory.map((s) => [s.seatNumber, s]));
    for (const sn of requestedSeatNumbers) {
      const entry = freshMap.get(sn);
      if (!entry) continue;
      if (entry.status === 'booked') {
        throw makeAppError(`Seat ${sn} was already booked by a concurrent request`, 409);
      }
      if (entry.status === 'available') {
        throw makeAppError(`Lock on seat ${sn} has expired. Please lock seats again.`, 410);
      }
      if (entry.reservedBy?.toString() !== userId) {
        throw makeAppError(`Seat ${sn} is no longer locked by you`, 409);
      }
    }
    throw makeAppError('Booking failed due to a seat conflict. Please try again.', 409);
  }

  // ── Create the booking document ───────────────────────────────────────────

  const bookingReference = generateBookingReference();

  const cleanPassengers: IPassengerInput[] = passengers.map((p) => ({
    name: p.name.trim(),
    age: p.age,
    seatNumber: p.seatNumber.trim(),
  }));

  const booking = await Booking.create({
    trip: trip._id,
    user: userObjectId,
    bookingReference,
    passengers: cleanPassengers,
    seatNumbers: requestedSeatNumbers,
    totalAmount,
    bookingStatus: 'confirmed',
    paymentStatus: 'unpaid',
    bookedAt: now,
  });

  // Store reference in bookingId field on seatInventory entries
  await Trip.updateOne(
    { _id: tripId },
    {
      $set: Object.fromEntries(
        requestedSeatNumbers.flatMap((sn, i) => [
          [`seatInventory.$[el${i}].bookingId`, booking._id],
        ]),
      ),
    },
    {
      arrayFilters: requestedSeatNumbers.map((sn, i) => ({
        [`el${i}.seatNumber`]: sn,
      })),
    },
  ).exec();

  // ── Build response ────────────────────────────────────────────────────────

  const route = trip.route as IRouteDocument;
  const bus = trip.bus as IBusDocument;

  return {
    bookingId: booking._id.toString(),
    bookingReference,
    trip: {
      tripId: trip._id.toString(),
      departureTime: trip.departureTime.toISOString(),
      arrivalTime: trip.arrivalTime.toISOString(),
      source: route.source,
      destination: route.destination,
      busName: bus.name,
    },
    passengers: cleanPassengers,
    seats: requestedSeatNumbers,
    totalAmount,
    bookingStatus: 'confirmed',
  };
}

// ---------------------------------------------------------------------------
// GET /api/bookings/:bookingId — retrieve one booking owned by the user
// ---------------------------------------------------------------------------

export async function getBookingById(
  userId: string,
  bookingId: string,
): Promise<IBookingDetailResponse> {
  if (!Types.ObjectId.isValid(bookingId)) {
    throw makeAppError('Invalid booking ID', 400);
  }

  const booking = await Booking.findById(bookingId)
    .populate<{ trip: { bus: IBusDocument; route: IRouteDocument } & ITripDocument }>({
      path: 'trip',
      populate: [{ path: 'bus' }, { path: 'route' }],
    })
    .exec();

  if (!booking) {
    throw makeAppError('Booking not found', 404);
  }

  // Ownership check — never allow a user to see another user's booking
  if (booking.user.toString() !== userId) {
    throw makeAppError('Booking not found', 404);
  }

  const trip = booking.trip as unknown as ITripDocument & { bus: IBusDocument; route: IRouteDocument };
  const bus = trip.bus as IBusDocument;
  const route = trip.route as IRouteDocument;

  return {
    bookingId: booking._id.toString(),
    bookingReference: booking.bookingReference,
    bookingStatus: booking.bookingStatus,
    paymentStatus: booking.paymentStatus,
    bookedAt: booking.bookedAt.toISOString(),
    totalAmount: booking.totalAmount,
    trip: {
      tripId: trip._id.toString(),
      departureTime: trip.departureTime.toISOString(),
      arrivalTime: trip.arrivalTime.toISOString(),
      source: route.source,
      destination: route.destination,
      busName: bus.name,
    },
    passengers: booking.passengers.map((p) => ({
      name: p.name,
      age: p.age,
      seatNumber: p.seatNumber,
    })),
    seats: booking.seatNumbers,
  };
}

// ---------------------------------------------------------------------------
// GET /api/bookings — list all bookings for the authenticated user
// ---------------------------------------------------------------------------

export async function getMyBookings(userId: string): Promise<IBookingListResponse> {
  const bookings = await Booking.find({ user: new Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .populate<{ trip: ITripDocument & { bus: IBusDocument; route: IRouteDocument } }>({
      path: 'trip',
      populate: [{ path: 'bus' }, { path: 'route' }],
    })
    .exec();

  const items: IBookingListItem[] = bookings.map((b) => {
    const trip = b.trip as unknown as ITripDocument & { bus: IBusDocument; route: IRouteDocument };
    const bus = trip.bus as IBusDocument;
    const route = trip.route as IRouteDocument;

    return {
      bookingId: b._id.toString(),
      bookingReference: b.bookingReference,
      bookingStatus: b.bookingStatus,
      paymentStatus: b.paymentStatus,
      bookedAt: b.bookedAt.toISOString(),
      totalAmount: b.totalAmount,
      seats: b.seatNumbers,
      trip: {
        tripId: trip._id.toString(),
        departureTime: trip.departureTime.toISOString(),
        arrivalTime: trip.arrivalTime.toISOString(),
        source: route.source,
        destination: route.destination,
        busName: bus.name,
      },
    };
  });

  return { bookings: items, count: items.length };
}
