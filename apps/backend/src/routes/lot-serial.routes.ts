import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { LotSerialController } from '../controllers/lot-serial.controller';

const lotSerialRoutes = new Hono();

lotSerialRoutes.use('*', requireAccess(ACCESS_POLICIES.lotSerials));

lotSerialRoutes.get('/', requirePermission('inventory', 'READ'), LotSerialController.list);
lotSerialRoutes.post('/', requirePermission('inventory', 'CREATE'), LotSerialController.create);
lotSerialRoutes.post('/:id/assign', requirePermission('inventory', 'UPDATE'), LotSerialController.assignToMovement);

export { lotSerialRoutes };
