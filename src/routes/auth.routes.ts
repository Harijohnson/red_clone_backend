import { Router } from 'express';
import { registerHandler, loginHandler, getMeHandler } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';

const authRouter = Router();

authRouter.post('/register', registerHandler);
authRouter.post('/login', loginHandler);
authRouter.get('/me', authenticate, getMeHandler);

export default authRouter;
