import { Types } from 'mongoose';
import Trip from '../../models/Trip.model';
import Bus from '../../models/Bus.model';
import Route from '../../models/Route.model';
import Booking from '../../models/Booking.model';
import type { IBusDocument } from '../../types/bus.types';
import type { IRouteDocument } from '../../types/route.types';
import type {
  IAdminTripItem,
  IAdminTripListResponse,
  ICreateTripRequest,
  IUpdateTripRequest,
} from '../../types/admin.types';

function makeError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

const DEFAULT_PAGE_SIZE = 20;

export async function listTrips(
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
): Promise<IAdminTripListResponse> {
  const skip = (page - 1) * limit;
  const [trips, total] = await Promise.all([
    Trip.find()
      .sort({ departureTime: -1 })
      .skip(skip)
      .limit(limit)
      .populate<{ bus: IBusDocument }>('bus')
      .populate<{ route: IRouteDocument }>('route')
      .exec(),
    Trip.countDocuments(),
  ]);

  const items: IAdminTripItem[] = trips.map((t) => {
    const bus = t.bus as IBusDocument;
    const route = t.route as IRouteDocument;
    return {
      tripId: t._id.toString(),
      busId: bus._id.toString(),
      busName: bus.name,
      routeId: route._id.toString(),
      source: route.source,
      destination: route.destination,
      departureTime: t.departureTime.toISOString(),
      arrivalTime: t.arrivalTime.toISOString(),
      pricePerSeat: t.pricePerSeat,
      totalSeats: t.totalSeats,
      availableCount: t.availableCount,
      status: t.status,
    };
  });

  return {
    trips: items,
    count: total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function createTrip(body: ICreateTripRequest): Promise<IAdminTripItem> {
  const { busId, routeId, departureTime, arrivalTime, pricePerSeat } = body;

  if (!Types.ObjectId.isValid(busId)) throw makeError('Invalid bus ID', 400);
  if (!Types.ObjectId.isValid(routeId)) throw makeError('Invalid route ID', 400);

  const dep = new Date(departureTime);
  const arr = new Date(arrivalTime);
  if (isNaN(dep.getTime())) throw makeError('Invalid departureTime', 400);
  if (isNaN(arr.getTime())) throw makeError('Invalid arrivalTime', 400);
  if (arr <= dep) throw makeError('arrivalTime must be after departureTime', 400);
  if (typeof pricePerSeat !== 'number' || pricePerSeat < 0)
    throw makeError('pricePerSeat must be a non-negative number', 400);

  const [bus, route] = await Promise.all([
    Bus.findById(busId).exec(),
    Route.findById(routeId).exec(),
  ]);
  if (!bus) throw makeError('Bus not found', 404);
  if (!route) throw makeError('Route not found', 404);
  if (bus.status !== 'active') throw makeError('Bus is not active', 409);

  const seatInventory = bus.seatLayout.map((s) => ({
    seatNumber: s.seatNumber,
    status: 'available' as const,
    reservedBy: null,
    reservedAt: null,
    reservationExpiresAt: null,
    bookingId: null,
  }));

  const trip = await Trip.create({
    bus: bus._id,
    route: route._id,
    departureTime: dep,
    arrivalTime: arr,
    pricePerSeat,
    totalSeats: bus.totalSeats,
    seatInventory,
    availableCount: bus.totalSeats,
    status: 'scheduled',
  });

  return {
    tripId: trip._id.toString(),
    busId: bus._id.toString(),
    busName: bus.name,
    routeId: route._id.toString(),
    source: route.source,
    destination: route.destination,
    departureTime: trip.departureTime.toISOString(),
    arrivalTime: trip.arrivalTime.toISOString(),
    pricePerSeat: trip.pricePerSeat,
    totalSeats: trip.totalSeats,
    availableCount: trip.availableCount,
    status: trip.status,
  };
}

export async function updateTrip(
  tripId: string,
  body: IUpdateTripRequest,
): Promise<IAdminTripItem> {
  if (!Types.ObjectId.isValid(tripId)) throw makeError('Invalid trip ID', 400);

  const updates: Record<string, unknown> = {};

  if (body.departureTime !== undefined) {
    const dep = new Date(body.departureTime);
    if (isNaN(dep.getTime())) throw makeError('Invalid departureTime', 400);
    updates['departureTime'] = dep;
  }
  if (body.arrivalTime !== undefined) {
    const arr = new Date(body.arrivalTime);
    if (isNaN(arr.getTime())) throw makeError('Invalid arrivalTime', 400);
    updates['arrivalTime'] = arr;
  }
  if (body.pricePerSeat !== undefined) {
    if (typeof body.pricePerSeat !== 'number' || body.pricePerSeat < 0)
      throw makeError('pricePerSeat must be a non-negative number', 400);
    updates['pricePerSeat'] = body.pricePerSeat;
  }
  if (body.status !== undefined) {
    updates['status'] = body.status;
  }

  if (Object.keys(updates).length === 0) throw makeError('No valid fields to update', 400);

  // Validate departure < arrival if both provided
  if (updates['departureTime'] && updates['arrivalTime']) {
    if ((updates['arrivalTime'] as Date) <= (updates['departureTime'] as Date)) {
      throw makeError('arrivalTime must be after departureTime', 400);
    }
  }

  const trip = await Trip.findByIdAndUpdate(
    tripId,
    { $set: updates },
    { new: true },
  )
    .populate<{ bus: IBusDocument }>('bus')
    .populate<{ route: IRouteDocument }>('route')
    .exec();

  if (!trip) throw makeError('Trip not found', 404);

  const bus = trip.bus as IBusDocument;
  const route = trip.route as IRouteDocument;

  return {
    tripId: trip._id.toString(),
    busId: bus._id.toString(),
    busName: bus.name,
    routeId: route._id.toString(),
    source: route.source,
    destination: route.destination,
    departureTime: trip.departureTime.toISOString(),
    arrivalTime: trip.arrivalTime.toISOString(),
    pricePerSeat: trip.pricePerSeat,
    totalSeats: trip.totalSeats,
    availableCount: trip.availableCount,
    status: trip.status,
  };
}

export async function deleteTrip(tripId: string): Promise<void> {
  if (!Types.ObjectId.isValid(tripId)) throw makeError('Invalid trip ID', 400);

  const hasBookings = await Booking.exists({
    trip: new Types.ObjectId(tripId),
    bookingStatus: 'confirmed',
  });
  if (hasBookings) {
    throw makeError('Cannot delete a trip with confirmed bookings', 409);
  }

  const trip = await Trip.findByIdAndDelete(tripId).exec();
  if (!trip) throw makeError('Trip not found', 404);
}
