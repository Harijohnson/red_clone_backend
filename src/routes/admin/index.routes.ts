import { Router } from 'express';
import tripRouter from './trip.routes';
import busRouter from './bus.routes';
import routeRouter from './route.routes';
import bookingRouter from './booking.routes';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { getDashboardHandler } from '../../controllers/admin/booking.admin.controller';

const router = Router();

router.get('/dashboard', authenticate, authorize('admin', 'operator'), getDashboardHandler);

router.use('/trips', tripRouter);
router.use('/buses', busRouter);
router.use('/routes', routeRouter);
router.use('/bookings', bookingRouter);

export default router;
