import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  listAllBookingsHandler,
  cancelBookingHandler,
} from '../../controllers/admin/booking.admin.controller';

const router = Router();

router.use(authenticate, authorize('admin', 'operator'));

router.get('/', listAllBookingsHandler);
router.patch('/:bookingId/cancel', cancelBookingHandler);

export default router;
