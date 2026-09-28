import Trip from '../models/Trip.model';
import Route from '../models/Route.model';
import '../models/Bus.model';
import '../models/User.model';
import type { TripSearchQuery, TripSearchResult } from '../types/trip-search.types';
import type { IBusDocument } from '../types/bus.types';
import type { IUserDocument } from '../types/user.types';
import type { IRouteDocument } from '../types/route.types';

export async function searchTrips(query: TripSearchQuery): Promise<TripSearchResult[]> {
  const { from, to, date } = query;

  // Build a [startOfDay, endOfDay] window for the travel date
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setUTCHours(23, 59, 59, 999);

  // Find the route first — source/destination index makes this a fast lookup
  const route = await Route.findOne({
    source: { $regex: new RegExp(`^${from}$`, 'i') },
    destination: { $regex: new RegExp(`^${to}$`, 'i') },
  }).lean<IRouteDocument>();

  if (!route) {
    return [];
  }

  const trips = await Trip.find({
    route: route._id,
    departureTime: { $gte: dayStart, $lte: dayEnd },
    status: 'scheduled',
  })
    .populate<{ bus: IBusDocument & { operatedBy: IUserDocument } }>({
      path: 'bus',
      populate: { path: 'operatedBy', select: 'name' },
    })
    .lean();

  return trips.map((trip) => {
    const bus = trip.bus as IBusDocument & { operatedBy: IUserDocument };
    return {
      tripId: trip._id.toString(),
      operator: bus.operatedBy.name,
      busName: bus.name,
      busType: bus.seatType,
      amenities: bus.amenities,
      departure: trip.departureTime.toISOString(),
      arrival: trip.arrivalTime.toISOString(),
      pricePerSeat: trip.pricePerSeat,
      totalSeats: trip.totalSeats,
      availableSeats: trip.availableCount,
    };
  });
}
