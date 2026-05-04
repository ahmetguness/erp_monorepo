import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { CheckPromissoryController } from '../controllers/check-promissory.controller';

const checkPromissoryRoutes = new Hono();

checkPromissoryRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

checkPromissoryRoutes.get('/', CheckPromissoryController.list);
checkPromissoryRoutes.post('/', CheckPromissoryController.create);
checkPromissoryRoutes.patch('/:id', CheckPromissoryController.update);
checkPromissoryRoutes.patch('/:id/status', CheckPromissoryController.updateStatus);
checkPromissoryRoutes.delete('/:id', CheckPromissoryController.remove);

export { checkPromissoryRoutes };
