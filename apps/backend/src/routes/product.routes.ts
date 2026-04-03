import { Hono } from 'hono';
import { ProductController } from '../controllers/product.controller';
import { enforceStarterLimits } from '../middleware/enforceStarterLimits';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';

// ─────────────────────────────────────────────
// Product Routes
// ─────────────────────────────────────────────

const productRoutes = new Hono();

// Tüm product endpoint'leri için inventory modülü gerekli
productRoutes.use('*', requireModule(MODULE_KEYS.INVENTORY));

productRoutes.get('/', ProductController.list);
productRoutes.get('/:id', ProductController.getById);

// Yeni ürün eklemeden önce MAX_PRODUCTS limiti kontrol edilir
productRoutes.post('/', enforceStarterLimits('product'), ProductController.create);

productRoutes.patch('/:id', ProductController.update);
productRoutes.delete('/:id', ProductController.remove);

export { productRoutes };
