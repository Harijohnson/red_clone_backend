import { Router } from 'express';
import {
  createBookingHandler,
  getMyBookingsHandler,
  getBookingByIdHandler,
} from '../controllers/booking.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/', authenticate, createBookingHandler);
router.get('/', authenticate, getMyBookingsHandler);
router.get('/:bookingId', authenticate, getBookingByIdHandler);

export default router;
