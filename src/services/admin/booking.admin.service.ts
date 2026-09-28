import { Types } from 'mongoose';
import Booking from '../../models/Booking.model';
import Trip from '../../models/Trip.model';
import Bus from '../../models/Bus.model';
import Route from '../../models/Route.model';
import type { IBusDocument } from '../../types/bus.types';
import type { IRouteDocument } from '../../types/route.types';
import type { ITripDocument } from '../../types/trip.types';
import type { IUserDocument } from '../../types/user.types';
import type {
  IAdminBookingItem,
  IAdminBookingListResponse,
  IAdminDashboardResponse,
} from '../../types/admin.types';

function makeError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

const DEFAULT_PAGE_SIZE = 20;

export async function listAllBookings(
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
): Promise<IAdminBookingListResponse> {
  const skip = (page - 1) * limit;
  const [bookings, total] = await Promise.all([
    Booking.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate<{ user: IUserDocument }>('user', 'name email')
      .populate<{ trip: ITripDocument & { bus: IBusDocument; route: IRouteDocument } }>({
        path: 'trip',
        populate: [{ path: 'bus', select: 'name' }, { path: 'route', select: 'source destination' }],
      })
      .exec(),
    Booking.countDocuments(),
  ]);

  const items: IAdminBookingItem[] = bookings.map((b) => {
    const user = b.user as IUserDocument;
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
      passengerCount: b.passengers.length,
      user: {
        userId: user._id.toString(),
        name: user.name,
        email: user.email,
      },
      trip: {
        tripId: trip._id.toString(),
        source: route.source,
        destination: route.destination,
        departureTime: trip.departureTime.toISOString(),
        busName: bus.name,
      },
    };
  });

  return {
    bookings: items,
    count: total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function cancelBooking(bookingId: string): Promise<void> {
  if (!Types.ObjectId.isValid(bookingId)) throw makeError('Invalid booking ID', 400);

  const booking = await Booking.findById(bookingId).exec();
  if (!booking) throw makeError('Booking not found', 404);
  if (booking.bookingStatus === 'cancelled') throw makeError('Booking is already cancelled', 409);

  // Release seats on the trip atomically
  const seatNumbers = booking.seatNumbers;
  const seatFieldUpdates: Record<string, unknown> = {};
  for (let i = 0; i < seatNumbers.length; i++) {
    seatFieldUpdates[`seatInventory.$[el${i}].status`] = 'available';
    seatFieldUpdates[`seatInventory.$[el${i}].reservedBy`] = null;
    seatFieldUpdates[`seatInventory.$[el${i}].reservedAt`] = null;
    seatFieldUpdates[`seatInventory.$[el${i}].reservationExpiresAt`] = null;
    seatFieldUpdates[`seatInventory.$[el${i}].bookingId`] = null;
  }

  await Trip.findOneAndUpdate(
    { _id: booking.trip },
    {
      $set: seatFieldUpdates,
      $inc: { availableCount: seatNumbers.length },
    },
    {
      arrayFilters: seatNumbers.map((sn, i) => ({ [`el${i}.seatNumber`]: sn })),
    },
  ).exec();

  booking.bookingStatus = 'cancelled';
  await booking.save();
}

export async function getDashboardStats(): Promise<IAdminDashboardResponse> {
  const [totalTrips, totalBuses, totalRoutes, totalBookings, confirmedBookings] =
    await Promise.all([
      Trip.countDocuments(),
      Bus.countDocuments(),
      Route.countDocuments(),
      Booking.countDocuments(),
      Booking.countDocuments({ bookingStatus: 'confirmed' }),
    ]);

  return { totalTrips, totalBuses, totalRoutes, totalBookings, confirmedBookings };
}
