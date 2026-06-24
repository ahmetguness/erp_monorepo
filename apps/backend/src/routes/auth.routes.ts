import { Hono } from 'hono';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/requireAuth';
import { validateBody } from '../middleware/validateBody';
import { loginBodySchema, registerBodySchema } from '../schemas/request-body.schemas';

const authRoutes = new Hono();

authRoutes.post('/login', validateBody(loginBodySchema), AuthController.login);
authRoutes.post('/register', validateBody(registerBodySchema), AuthController.register);
authRoutes.post('/logout', AuthController.logout);
authRoutes.get('/me', requireAuth, AuthController.me);
authRoutes.patch('/me/preferences', requireAuth, AuthController.updatePreferences);

export { authRoutes };
