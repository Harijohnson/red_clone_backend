import { Request, Response, NextFunction } from 'express';
import { searchTrips } from '../services/trip.service';
import type { TripSearchQuery, TripSearchResponse } from '../types/trip-search.types';
import { AppError } from '../middleware/errorHandler';

function makeError(message: string, statusCode: number): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  return err;
}

function isValidDate(value: string): boolean {
  // Require strict YYYY-MM-DD format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function sanitizeCity(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return null;
  // Only letters, spaces, hyphens — no injection vectors
  if (!/^[a-zA-Z\s\-]+$/.test(trimmed)) return null;
  return trimmed;
}

export async function searchTripsHandler(
  req: Request,
  res: Response<TripSearchResponse>,
  next: NextFunction,
): Promise<void> {
  try {
    const { from, to, date } = req.query;

    if (!from || !to || !date) {
      return next(makeError('Missing required query parameters: from, to, date', 400));
    }

    const fromCity = sanitizeCity(from);
    const toCity = sanitizeCity(to);

    if (!fromCity) {
      return next(makeError('Invalid value for "from": must be a non-empty city name', 400));
    }
    if (!toCity) {
      return next(makeError('Invalid value for "to": must be a non-empty city name', 400));
    }
    if (typeof date !== 'string' || !isValidDate(date)) {
      return next(makeError('Invalid "date": must be in YYYY-MM-DD format', 400));
    }

    const searchQuery: TripSearchQuery = { from: fromCity, to: toCity, date };
    const trips = await searchTrips(searchQuery);

    res.status(200).json({ trips, count: trips.length });
  } catch (err) {
    next(err);
  }
}
