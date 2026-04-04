import { Hono } from 'hono';
import { AuthController } from '../controllers/auth.controller';

const authRoutes = new Hono();

authRoutes.post('/login', AuthController.login);
authRoutes.post('/register', AuthController.register);
authRoutes.get('/me', AuthController.me);

export { authRoutes };
