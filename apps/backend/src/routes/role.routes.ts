import { Hono } from 'hono';
import { FeatureKey, Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { requirePermission } from '../middleware/requirePermission';
import { RoleController } from '../controllers/role.controller';

const roleRoutes = new Hono();

roleRoutes.use('*', requirePlan(Plan.PROFESSIONAL));
roleRoutes.use('*', requireFeature(FeatureKey.ROLE_MANAGEMENT));

roleRoutes.get('/', requirePermission('roles', 'READ'), RoleController.list);
roleRoutes.get('/:id', requirePermission('roles', 'READ'), RoleController.getById);
roleRoutes.post('/', requirePermission('roles', 'CREATE'), RoleController.create);
roleRoutes.patch('/:id', requirePermission('roles', 'UPDATE'), RoleController.update);
roleRoutes.delete('/:id', requirePermission('roles', 'DELETE'), RoleController.delete);

// Permissions
roleRoutes.post('/:id/permissions', requirePermission('roles', 'UPDATE'), RoleController.addPermission);
roleRoutes.delete('/:id/permissions/:permissionId', requirePermission('roles', 'UPDATE'), RoleController.removePermission);

export { roleRoutes };
