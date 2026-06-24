import { Hono } from 'hono';
import { UserController } from '../controllers/user.controller';
import { enforceStarterLimits } from '../middleware/enforceStarterLimits';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validateBody';
import { createUserBodySchema, updateUserBodySchema } from '../schemas/request-body.schemas';

// ─────────────────────────────────────────────
// User Routes
// ─────────────────────────────────────────────

const userRoutes = new Hono();

userRoutes.get('/', requirePermission('users', 'READ'), UserController.list);
userRoutes.get('/:id', requirePermission('users', 'READ'), UserController.getById);

// Yeni kullanıcı eklemeden önce MAX_USERS limiti kontrol edilir
userRoutes.post('/', requirePermission('users', 'CREATE'), validateBody(createUserBodySchema), enforceStarterLimits('user'), UserController.create);

userRoutes.patch('/:id', requirePermission('users', 'UPDATE'), validateBody(updateUserBodySchema), UserController.update);
userRoutes.delete('/:id', requirePermission('users', 'DELETE'), UserController.remove);

export { userRoutes };
