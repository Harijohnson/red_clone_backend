import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  listTripsHandler,
  createTripHandler,
  updateTripHandler,
  deleteTripHandler,
} from '../../controllers/admin/trip.admin.controller';

const router = Router();

router.use(authenticate, authorize('admin', 'operator'));

router.get('/', listTripsHandler);
router.post('/', createTripHandler);
router.patch('/:tripId', updateTripHandler);
router.delete('/:tripId', deleteTripHandler);

export default router;
