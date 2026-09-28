import { Request, Response, NextFunction } from 'express';
import { createBooking, getBookingById, getMyBookings } from '../services/booking.service';
import type { ICreateBookingRequest } from '../types/seat-reservation.types';
import type { AppError } from '../middleware/errorHandler';
import type { AuthenticatedRequest } from '../middleware/authenticate';

function makeError(message: string, statusCode: number): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  return err;
}

// ---------------------------------------------------------------------------
// POST /api/bookings
// ---------------------------------------------------------------------------

export async function createBookingHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    if (!userId) {
      return next(makeError('Authentication required', 401));
    }

    const body = req.body as ICreateBookingRequest;
    const result = await createBooking(userId, body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/bookings
// ---------------------------------------------------------------------------

export async function getMyBookingsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    if (!userId) {
      return next(makeError('Authentication required', 401));
    }

    const result = await getMyBookings(userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/bookings/:bookingId
// ---------------------------------------------------------------------------

export async function getBookingByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    if (!userId) {
      return next(makeError('Authentication required', 401));
    }

    const bookingId = req.params['bookingId'] as string;
    const result = await getBookingById(userId, bookingId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
