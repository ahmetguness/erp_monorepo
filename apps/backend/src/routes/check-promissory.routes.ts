import { Hono } from 'hono';
import { requirePlan } from '../middleware/requirePlan';
import { CheckPromissoryController } from '../controllers/check-promissory.controller';

const checkPromissoryRoutes = new Hono();

checkPromissoryRoutes.use('*', requirePlan('PROFESSIONAL'));

checkPromissoryRoutes.get('/', CheckPromissoryController.list);
checkPromissoryRoutes.post('/', CheckPromissoryController.create);
checkPromissoryRoutes.patch('/:id/status', CheckPromissoryController.updateStatus);

export { checkPromissoryRoutes };
