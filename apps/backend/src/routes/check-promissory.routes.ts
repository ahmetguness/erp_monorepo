import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { CheckPromissoryController } from '../controllers/check-promissory.controller';

const checkPromissoryRoutes = new Hono();

checkPromissoryRoutes.use('*', requireAccess(ACCESS_POLICIES.checkPromissory));

checkPromissoryRoutes.get('/', requirePermission('accounting', 'READ'), CheckPromissoryController.list);
checkPromissoryRoutes.post('/', requirePermission('accounting', 'CREATE'), CheckPromissoryController.create);
checkPromissoryRoutes.patch('/:id', requirePermission('accounting', 'UPDATE'), CheckPromissoryController.update);
checkPromissoryRoutes.patch('/:id/status', requirePermission('accounting', 'UPDATE'), CheckPromissoryController.updateStatus);
checkPromissoryRoutes.delete('/:id', requirePermission('accounting', 'DELETE'), CheckPromissoryController.remove);

export { checkPromissoryRoutes };
