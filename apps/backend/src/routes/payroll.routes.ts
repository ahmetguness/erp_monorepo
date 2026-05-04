import { Hono } from 'hono';
import { FeatureKey, Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';
import { PayrollController } from '../controllers/payroll.controller';

const payrollRoutes = new Hono();

payrollRoutes.use('*', requirePlan(Plan.ENTERPRISE));
payrollRoutes.use('*', requireFeature(FeatureKey.PAYROLL));
payrollRoutes.use('*', requireModule(MODULE_KEYS.PAYROLL));

payrollRoutes.get('/', PayrollController.list);
payrollRoutes.post('/', PayrollController.create);
payrollRoutes.post('/generate-bulk', PayrollController.generateBulk);
payrollRoutes.get('/:id', PayrollController.getById);
payrollRoutes.post('/:id/items', PayrollController.addItem);
payrollRoutes.delete('/:id/items/:itemId', PayrollController.removeItem);
payrollRoutes.post('/:id/pay', PayrollController.markPaid);
payrollRoutes.delete('/:id', PayrollController.remove);

export { payrollRoutes };
