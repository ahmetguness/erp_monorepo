import { Hono } from 'hono';
import { UserController } from '../controllers/user.controller';
import { enforceStarterLimits } from '../middleware/enforceStarterLimits';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';

// ─────────────────────────────────────────────
// User Routes
// ─────────────────────────────────────────────

const userRoutes = new Hono();

// Tüm user endpoint'leri için accounting modülü gerekli
userRoutes.use('*', requireModule(MODULE_KEYS.ACCOUNTING));

userRoutes.get('/', UserController.list);
userRoutes.get('/:id', UserController.getById);

// Yeni kullanıcı eklemeden önce MAX_USERS limiti kontrol edilir
userRoutes.post('/', enforceStarterLimits('user'), UserController.create);

userRoutes.patch('/:id', UserController.update);
userRoutes.delete('/:id', UserController.remove);

export { userRoutes };
