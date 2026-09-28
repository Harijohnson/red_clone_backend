import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  listBusesHandler,
  createBusHandler,
  updateBusHandler,
  deleteBusHandler,
} from '../../controllers/admin/bus.admin.controller';

const router = Router();

router.use(authenticate, authorize('admin', 'operator'));

router.get('/', listBusesHandler);
router.post('/', createBusHandler);
router.patch('/:busId', updateBusHandler);
router.delete('/:busId', deleteBusHandler);

export default router;
