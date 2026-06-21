import { Hono } from 'hono';
import { FeatureKey, Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';
import { PayrollController } from '../controllers/payroll.controller';

const payrollRoutes = new Hono();

payrollRoutes.use('*', requirePlan(Plan.ENTERPRISE));
payrollRoutes.use('*', requireFeature(FeatureKey.PAYROLL));
payrollRoutes.use('*', requireModule(MODULE_KEYS.PAYROLL));

payrollRoutes.get('/', requirePermission('payroll', 'READ'), PayrollController.list);
payrollRoutes.post('/', requirePermission('payroll', 'CREATE'), PayrollController.create);
payrollRoutes.post('/generate-bulk', requirePermission('payroll', 'CREATE'), PayrollController.generateBulk);
payrollRoutes.get('/:id', requirePermission('payroll', 'READ'), PayrollController.getById);
payrollRoutes.post('/:id/items', requirePermission('payroll', 'UPDATE'), PayrollController.addItem);
payrollRoutes.delete('/:id/items/:itemId', requirePermission('payroll', 'UPDATE'), PayrollController.removeItem);
payrollRoutes.post('/:id/pay', requirePermission('payroll', 'UPDATE'), PayrollController.markPaid);
payrollRoutes.post('/:id/reverse', requirePermission('payroll', 'UPDATE'), PayrollController.reversePayroll);
payrollRoutes.delete('/:id', requirePermission('payroll', 'DELETE'), PayrollController.remove);

export { payrollRoutes };
