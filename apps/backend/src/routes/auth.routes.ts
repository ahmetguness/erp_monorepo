import { Hono } from 'hono';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/requireAuth';

const authRoutes = new Hono();

authRoutes.post('/login', AuthController.login);
authRoutes.post('/register', AuthController.register);
authRoutes.get('/me', requireAuth, AuthController.me);

export { authRoutes };
