import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requirePermission } from '../middleware/requirePermission';
import { CheckPromissoryController } from '../controllers/check-promissory.controller';

const checkPromissoryRoutes = new Hono();

checkPromissoryRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

checkPromissoryRoutes.get('/', requirePermission('accounting', 'READ'), CheckPromissoryController.list);
checkPromissoryRoutes.post('/', requirePermission('accounting', 'CREATE'), CheckPromissoryController.create);
checkPromissoryRoutes.patch('/:id', requirePermission('accounting', 'UPDATE'), CheckPromissoryController.update);
checkPromissoryRoutes.patch('/:id/status', requirePermission('accounting', 'UPDATE'), CheckPromissoryController.updateStatus);
checkPromissoryRoutes.delete('/:id', requirePermission('accounting', 'DELETE'), CheckPromissoryController.remove);

export { checkPromissoryRoutes };
