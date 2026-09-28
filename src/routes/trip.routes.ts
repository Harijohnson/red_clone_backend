import { Router } from 'express';
import { searchTripsHandler } from '../controllers/trip.controller';

const router = Router();

router.get('/search', searchTripsHandler);

export default router;
