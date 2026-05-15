import { Hono } from 'hono';
import { UserController } from '../controllers/user.controller';
import { enforceStarterLimits } from '../middleware/enforceStarterLimits';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';

// ─────────────────────────────────────────────
// User Routes
// ─────────────────────────────────────────────

const userRoutes = new Hono();

// Tüm user endpoint'leri için accounting modülü gerekli
userRoutes.use('*', requireModule(MODULE_KEYS.ACCOUNTING));

userRoutes.get('/', requirePermission('users', 'READ'), UserController.list);
userRoutes.get('/:id', requirePermission('users', 'READ'), UserController.getById);

// Yeni kullanıcı eklemeden önce MAX_USERS limiti kontrol edilir
userRoutes.post('/', requirePermission('users', 'CREATE'), enforceStarterLimits('user'), UserController.create);

userRoutes.patch('/:id', requirePermission('users', 'UPDATE'), UserController.update);
userRoutes.delete('/:id', requirePermission('users', 'DELETE'), UserController.remove);

export { userRoutes };
