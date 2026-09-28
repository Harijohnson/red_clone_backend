import { Types } from 'mongoose';
import Route from '../../models/Route.model';
import Trip from '../../models/Trip.model';
import type {
  IAdminRouteItem,
  IAdminRouteListResponse,
  ICreateRouteRequest,
} from '../../types/admin.types';

function makeError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export async function listRoutes(): Promise<IAdminRouteListResponse> {
  const routes = await Route.find().sort({ source: 1, destination: 1 }).exec();
  const items: IAdminRouteItem[] = routes.map((r) => ({
    routeId: r._id.toString(),
    source: r.source,
    destination: r.destination,
    distanceKm: r.distanceKm,
    estimatedDurationMinutes: r.estimatedDurationMinutes,
    createdAt: r.createdAt.toISOString(),
  }));
  return { routes: items, count: items.length };
}

export async function createRoute(body: ICreateRouteRequest): Promise<IAdminRouteItem> {
  const { source, destination, distanceKm, estimatedDurationMinutes } = body;

  if (!source?.trim()) throw makeError('source is required', 400);
  if (!destination?.trim()) throw makeError('destination is required', 400);
  if (source.trim().toLowerCase() === destination.trim().toLowerCase())
    throw makeError('source and destination must differ', 400);
  if (typeof distanceKm !== 'number' || distanceKm < 0)
    throw makeError('distanceKm must be a non-negative number', 400);
  if (typeof estimatedDurationMinutes !== 'number' || estimatedDurationMinutes < 0)
    throw makeError('estimatedDurationMinutes must be a non-negative number', 400);

  const existing = await Route.findOne({
    source: new RegExp(`^${source.trim()}$`, 'i'),
    destination: new RegExp(`^${destination.trim()}$`, 'i'),
  }).exec();
  if (existing) throw makeError('Route already exists', 409);

  const route = await Route.create({
    source: source.trim(),
    destination: destination.trim(),
    distanceKm,
    estimatedDurationMinutes,
  });

  return {
    routeId: route._id.toString(),
    source: route.source,
    destination: route.destination,
    distanceKm: route.distanceKm,
    estimatedDurationMinutes: route.estimatedDurationMinutes,
    createdAt: route.createdAt.toISOString(),
  };
}

export async function deleteRoute(routeId: string): Promise<void> {
  if (!Types.ObjectId.isValid(routeId)) throw makeError('Invalid route ID', 400);

  const hasTrips = await Trip.exists({ route: new Types.ObjectId(routeId) });
  if (hasTrips) throw makeError('Cannot delete a route that has trips assigned to it', 409);

  const route = await Route.findByIdAndDelete(routeId).exec();
  if (!route) throw makeError('Route not found', 404);
}
