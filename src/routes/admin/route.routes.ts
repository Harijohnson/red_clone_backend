import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  listRoutesHandler,
  createRouteHandler,
  deleteRouteHandler,
} from '../../controllers/admin/route.admin.controller';

const router = Router();

router.use(authenticate, authorize('admin', 'operator'));

router.get('/', listRoutesHandler);
router.post('/', createRouteHandler);
router.delete('/:routeId', deleteRouteHandler);

export default router;
