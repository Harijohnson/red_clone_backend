import { Request, Response, NextFunction } from 'express';
import { getSeats, lockSeats, releaseLock } from '../services/seat.service';
import type { ILockSeatsRequest } from '../types/seat-reservation.types';
import { AppError } from '../middleware/errorHandler';
import type { AuthenticatedRequest } from '../middleware/authenticate';

function makeError(message: string, statusCode: number): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  return err;
}

type TripParams = { tripId: string };

// ---------------------------------------------------------------------------
// GET /api/trips/:tripId/seats  (public — no auth required)
// ---------------------------------------------------------------------------

export async function getSeatsHandler(
  req: Request<TripParams>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tripId } = req.params;
    // Optionally identify the caller so `isLockedByMe` can be set correctly
    const authed = req as unknown as AuthenticatedRequest;
    const userId = authed.user?.id;
    const result = await getSeats(tripId, userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/trips/:tripId/seats/lock  (requires JWT auth — see seat.routes.ts)
// ---------------------------------------------------------------------------

export async function lockSeatsHandler(
  req: Request<TripParams>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tripId } = req.params;
    // authenticate middleware runs before this handler; user is always present here
    const userId = (req as unknown as AuthenticatedRequest).user.id;

    const body = req.body as ILockSeatsRequest;

    if (!Array.isArray(body.seatNumbers) || body.seatNumbers.length === 0) {
      return next(makeError('seatNumbers must be a non-empty array', 400));
    }

    const result = await lockSeats(tripId, userId, body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/trips/:tripId/seats/lock  (requires JWT auth — see seat.routes.ts)
// ---------------------------------------------------------------------------

export async function releaseLockHandler(
  req: Request<TripParams>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tripId } = req.params;
    const userId = (req as unknown as AuthenticatedRequest).user.id;

    const result = await releaseLock(tripId, userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
