import { Hono } from 'hono';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validateBody';
import { SalesTargetController } from '../modules/sales/http/controllers/index.js';
import { salesTargetBodySchema } from '../schemas/request-body.schemas';
import { MODULE_KEYS } from '../types/module.types';

const salesTargetRoutes = new Hono();

salesTargetRoutes.use('*', requireModule(MODULE_KEYS.INVOICING));

salesTargetRoutes.get('/monthly', requirePermission('invoicing', 'READ'), SalesTargetController.getMonthly);
salesTargetRoutes.put('/monthly', requirePermission('invoicing', 'UPDATE'), validateBody(salesTargetBodySchema), SalesTargetController.upsertMonthly);

export { salesTargetRoutes };
