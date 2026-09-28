import { Request, Response, NextFunction } from 'express';
import {
  listAllBookings,
  cancelBooking,
  getDashboardStats,
  getAnalyticsData,
} from '../../services/admin/booking.admin.service';

// GET /api/admin/bookings
export async function listAllBookingsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string) || 20));
    const result = await listAllBookings(page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/bookings/:bookingId/cancel
export async function cancelBookingHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const bookingId = req.params['bookingId'] as string;
    await cancelBooking(bookingId);
    res.status(200).json({ message: 'Booking cancelled successfully' });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/dashboard
export async function getDashboardHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getDashboardStats();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/analytics
export async function getAnalyticsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getAnalyticsData();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
