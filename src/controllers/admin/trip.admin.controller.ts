import { Request, Response, NextFunction } from 'express';
import { listTrips, createTrip, updateTrip, deleteTrip } from '../../services/admin/trip.admin.service';
import type { AppError } from '../../middleware/errorHandler';
import type { ICreateTripRequest, IUpdateTripRequest } from '../../types/admin.types';

function makeError(message: string, statusCode: number): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  return err;
}

// GET /api/admin/trips
export async function listTripsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string) || 20));
    const result = await listTrips(page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/trips
export async function createTripHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as ICreateTripRequest;
    if (!body.busId || !body.routeId || !body.departureTime || !body.arrivalTime) {
      return next(makeError('busId, routeId, departureTime, and arrivalTime are required', 400));
    }
    const result = await createTrip(body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/trips/:tripId
export async function updateTripHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tripId = req.params['tripId'] as string;
    const body = req.body as IUpdateTripRequest;
    const result = await updateTrip(tripId, body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/trips/:tripId
export async function deleteTripHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tripId = req.params['tripId'] as string;
    await deleteTrip(tripId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
