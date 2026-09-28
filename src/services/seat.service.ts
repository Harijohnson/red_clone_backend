import { Types } from 'mongoose';
import Trip from '../models/Trip.model';
import Booking from '../models/Booking.model';
import type { IBusDocument, ISeatLayout } from '../types/bus.types';
import type { ISeatInventoryEntry } from '../types/trip.types';
import type {
  ISeatAvailabilityEntry,
  ITripSeatsResponse,
  ILockSeatsRequest,
  ILockSeatsResponse,
  IConfirmBookingResponse,
  SeatAvailabilityStatus,
} from '../types/seat-reservation.types';
import { getLockTtlSeconds } from '../types/seat-reservation.types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeAppError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

/** Release any reserved seats whose lock has expired (lazy, in-place). */
function releaseExpiredInMemory(trip: { seatInventory: ISeatInventoryEntry[]; availableCount: number }): boolean {
  const now = new Date();
  let changed = false;
  for (const entry of trip.seatInventory) {
    if (
      entry.status === 'reserved' &&
      entry.reservationExpiresAt != null &&
      entry.reservationExpiresAt <= now
    ) {
      entry.status = 'available';
      entry.reservedBy = undefined;
      entry.reservedAt = undefined;
      entry.reservationExpiresAt = undefined;
      entry.bookingId = undefined;
      changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// GET /trips/:tripId/seats
// ---------------------------------------------------------------------------

export async function getSeats(
  tripId: string,
  requestingUserId?: string,
): Promise<ITripSeatsResponse> {
  if (!Types.ObjectId.isValid(tripId)) {
    throw makeAppError('Invalid trip ID', 400);
  }

  const trip = await Trip.findById(tripId)
    .populate<{ bus: IBusDocument }>('bus')
    .exec();

  if (!trip) throw makeAppError('Trip not found', 404);
  if (trip.status === 'cancelled') throw makeAppError('Trip is cancelled', 410);

  // Lazy expiry: clear stale locks in-memory and persist if anything changed
  const didExpire = releaseExpiredInMemory(trip);
  if (didExpire) {
    // Recalculate availableCount and persist
    const availableCount = trip.seatInventory.filter((s) => s.status === 'available').length;
    trip.availableCount = availableCount;
    await trip.save();
  }

  const bus = trip.bus as IBusDocument;
  const layoutMap = new Map<string, ISeatLayout>(
    bus.seatLayout.map((s) => [s.seatNumber, s]),
  );

  const seats: ISeatAvailabilityEntry[] = trip.seatInventory.map((inv) => {
    const layout = layoutMap.get(inv.seatNumber);
    if (!layout) {
      throw makeAppError(
        `Seat ${inv.seatNumber} found in inventory but not in bus layout`,
        500,
      );
    }

    // Map internal 'reserved' → public 'locked'
    const status: SeatAvailabilityStatus =
      inv.status === 'reserved' ? 'locked' : inv.status;

    return {
      number: inv.seatNumber,
      type: bus.seatType,
      status,
      deck: layout.deck,
      row: layout.row,
      column: layout.column,
      position: layout.type,
      price: trip.pricePerSeat,
      isLockedByMe:
        inv.status === 'reserved' &&
        requestingUserId != null &&
        inv.reservedBy?.toString() === requestingUserId,
    };
  });

  return { tripId, seats, lockTtlSeconds: getLockTtlSeconds() };
}

// ---------------------------------------------------------------------------
// POST /trips/:tripId/seats/lock
// ---------------------------------------------------------------------------

export async function lockSeats(
  tripId: string,
  userId: string,
  body: ILockSeatsRequest,
): Promise<ILockSeatsResponse> {
  const { seatNumbers } = body;

  if (!Types.ObjectId.isValid(tripId)) throw makeAppError('Invalid trip ID', 400);
  if (!seatNumbers || seatNumbers.length === 0) throw makeAppError('seatNumbers must be a non-empty array', 400);

  // Deduplicate while preserving order
  const unique = [...new Set(seatNumbers)];
  if (unique.length !== seatNumbers.length) {
    throw makeAppError('seatNumbers must not contain duplicates', 400);
  }

  const ttl = getLockTtlSeconds();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 1000);
  const userObjectId = new Types.ObjectId(userId);

  // First verify the trip and all seats exist, and seats are on the bus.
  // We do this before the atomic update so we can return precise error messages.
  const trip = await Trip.findById(tripId)
    .populate<{ bus: IBusDocument }>('bus')
    .exec();

  if (!trip) throw makeAppError('Trip not found', 404);
  if (trip.status !== 'scheduled') throw makeAppError('Trip is not available for booking', 409);

  // Verify every requested seat exists on the bus layout
  const busLayoutNumbers = new Set((trip.bus as IBusDocument).seatLayout.map((s) => s.seatNumber));
  for (const sn of unique) {
    if (!busLayoutNumbers.has(sn)) {
      throw makeAppError(`Seat ${sn} does not exist on this bus`, 400);
    }
  }

  // Verify every requested seat exists in the trip inventory
  const inventoryMap = new Map(trip.seatInventory.map((s) => [s.seatNumber, s]));
  for (const sn of unique) {
    if (!inventoryMap.has(sn)) {
      throw makeAppError(`Seat ${sn} is not in this trip's inventory`, 400);
    }
  }

  // Single atomic findOneAndUpdate:
  //   Match condition: trip is 'scheduled' AND every requested seat is 'available'
  //   Update: set status='reserved', reservedBy, reservedAt, reservationExpiresAt for each seat
  //           and decrement availableCount
  //
  // If any seat is already 'reserved' (locked by another user) or 'booked', the
  // match condition fails and the update returns null → 409.
  const seatSetFields: Record<string, unknown> = {};
  for (let i = 0; i < unique.length; i++) {
    seatSetFields[`seatInventory.$[el${i}].status`] = 'reserved';
    seatSetFields[`seatInventory.$[el${i}].reservedBy`] = userObjectId;
    seatSetFields[`seatInventory.$[el${i}].reservedAt`] = now;
    seatSetFields[`seatInventory.$[el${i}].reservationExpiresAt`] = expiresAt;
  }

  const updated = await Trip.findOneAndUpdate(
    {
      _id: tripId,
      status: 'scheduled',
      $and: unique.map((sn) => ({
        seatInventory: { $elemMatch: { seatNumber: sn, status: 'available' } },
      })),
    },
    {
      $set: seatSetFields,
      $inc: { availableCount: -unique.length },
    },
    {
      arrayFilters: unique.map((sn, i) => ({
        [`el${i}.seatNumber`]: sn,
        [`el${i}.status`]: 'available',
      })),
      returnDocument: 'after',
    },
  ).exec();

  if (!updated) {
    // Distinguish between "seat doesn't exist" (caught above) and "seat unavailable"
    throw makeAppError('One or more selected seats are no longer available', 409);
  }

  return {
    lockedSeats: unique,
    expiresAt: expiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// POST /api/bookings/:bookingId/confirm
// ---------------------------------------------------------------------------

export async function confirmBooking(
  bookingId: string,
  userId: string,
  paymentReference?: string,
): Promise<IConfirmBookingResponse> {
  if (!Types.ObjectId.isValid(bookingId)) throw makeAppError('Invalid booking ID', 400);

  const booking = await Booking.findById(bookingId).exec();
  if (!booking) throw makeAppError('Booking not found', 404);
  if (booking.user.toString() !== userId) throw makeAppError('Forbidden', 403);
  if (booking.bookingStatus === 'confirmed') {
    return { bookingId, bookingStatus: 'confirmed', paymentStatus: 'paid' };
  }
  if (booking.bookingStatus === 'cancelled') throw makeAppError('Booking has been cancelled', 410);

  const now = new Date();
  if (booking.expiresAt && booking.expiresAt < now) {
    throw makeAppError('Booking lock has expired. Please select seats again.', 410);
  }

  const { seatNumbers, trip: tripId } = booking;

  // Mark seats as booked on the Trip
  const seatFieldUpdates: Record<string, unknown> = {};
  for (let i = 0; i < seatNumbers.length; i++) {
    seatFieldUpdates[`seatInventory.$[el${i}].status`] = 'booked';
    seatFieldUpdates[`seatInventory.$[el${i}].reservationExpiresAt`] = null;
  }

  await Trip.updateOne(
    { _id: tripId },
    { $set: seatFieldUpdates },
    {
      arrayFilters: seatNumbers.map((sn, i) => ({ [`el${i}.seatNumber`]: sn })),
    },
  ).exec();

  // Confirm the booking
  booking.bookingStatus = 'confirmed';
  booking.paymentStatus = 'paid';
  booking.expiresAt = undefined;
  if (paymentReference) {
    // Store as a note — no dedicated field yet, but we can log it
    console.info(`Payment reference for booking ${bookingId}: ${paymentReference}`);
  }
  await booking.save();

  return { bookingId, bookingStatus: 'confirmed', paymentStatus: 'paid' };
}

// ---------------------------------------------------------------------------
// DELETE /trips/:tripId/seats/lock
// ---------------------------------------------------------------------------

export async function releaseLock(
  tripId: string,
  userId: string,
): Promise<{ releasedSeats: string[] }> {
  if (!Types.ObjectId.isValid(tripId)) throw makeAppError('Invalid trip ID', 400);

  const userObjectId = new Types.ObjectId(userId);

  // Load the trip to find which seats this user currently holds
  const trip = await Trip.findById(tripId).exec();
  if (!trip) throw makeAppError('Trip not found', 404);

  const heldSeats = trip.seatInventory
    .filter(
      (s) =>
        s.status === 'reserved' &&
        s.reservedBy != null &&
        s.reservedBy.toString() === userId,
    )
    .map((s) => s.seatNumber);

  if (heldSeats.length === 0) {
    return { releasedSeats: [] };
  }

  // Atomically release only seats that are still reserved by this user.
  // arrayFilters pins each positional identifier to the exact seat+owner combo,
  // so a concurrent re-lock by another user on the same seat cannot be released.
  const releaseFields: Record<string, unknown> = {};
  for (let i = 0; i < heldSeats.length; i++) {
    releaseFields[`seatInventory.$[el${i}].status`] = 'available';
    releaseFields[`seatInventory.$[el${i}].reservedBy`] = null;
    releaseFields[`seatInventory.$[el${i}].reservedAt`] = null;
    releaseFields[`seatInventory.$[el${i}].reservationExpiresAt`] = null;
    releaseFields[`seatInventory.$[el${i}].bookingId`] = null;
  }

  await Trip.updateOne(
    { _id: tripId },
    {
      $set: releaseFields,
      $inc: { availableCount: heldSeats.length },
    },
    {
      arrayFilters: heldSeats.map((sn, i) => ({
        [`el${i}.seatNumber`]: sn,
        [`el${i}.reservedBy`]: userObjectId,
        [`el${i}.status`]: 'reserved',
      })),
    },
  ).exec();

  return { releasedSeats: heldSeats };
}

// ---------------------------------------------------------------------------
// Background sweeper — call on an interval (e.g. every 2 minutes)
// ---------------------------------------------------------------------------

export async function sweepExpiredLocks(): Promise<void> {
  const now = new Date();

  // Find all trips that have at least one stale reserved seat
  const trips = await Trip.find({
    'seatInventory': {
      $elemMatch: {
        status: 'reserved',
        reservationExpiresAt: { $lte: now },
      },
    },
  }).exec();

  for (const trip of trips) {
    const staleSeatNumbers: string[] = trip.seatInventory
      .filter(
        (s) =>
          s.status === 'reserved' &&
          s.reservationExpiresAt != null &&
          s.reservationExpiresAt <= now,
      )
      .map((s) => s.seatNumber);

    if (staleSeatNumbers.length === 0) continue;

    const seatFieldUpdates: Record<string, unknown> = {};
    for (let i = 0; i < staleSeatNumbers.length; i++) {
      seatFieldUpdates[`seatInventory.$[el${i}].status`] = 'available';
      seatFieldUpdates[`seatInventory.$[el${i}].reservedBy`] = null;
      seatFieldUpdates[`seatInventory.$[el${i}].reservedAt`] = null;
      seatFieldUpdates[`seatInventory.$[el${i}].reservationExpiresAt`] = null;
      seatFieldUpdates[`seatInventory.$[el${i}].bookingId`] = null;
    }

    await Trip.updateOne(
      { _id: trip._id },
      {
        $set: seatFieldUpdates,
        $inc: { availableCount: staleSeatNumbers.length },
      },
      {
        arrayFilters: staleSeatNumbers.map((sn, i) => ({
          [`el${i}.seatNumber`]: sn,
          [`el${i}.status`]: 'reserved',
          [`el${i}.reservationExpiresAt`]: { $lte: now },
        })),
      },
    ).exec();
  }
}
