import { Router } from 'express';
import {
  getSeatsHandler,
  lockSeatsHandler,
  releaseLockHandler,
} from '../controllers/seat.controller';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate';

// Mounted at /api/trips/:tripId
const router = Router({ mergeParams: true });

router.get('/seats', optionalAuthenticate, getSeatsHandler);
router.post('/seats/lock', authenticate, lockSeatsHandler);
router.delete('/seats/lock', authenticate, releaseLockHandler);

export default router;
