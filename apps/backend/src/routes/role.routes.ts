import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { RoleController } from '../controllers/role.controller';

const roleRoutes = new Hono();

roleRoutes.use('*', requireAccess(ACCESS_POLICIES.roles));

roleRoutes.get('/', requirePermission('roles', 'READ'), RoleController.list);
roleRoutes.get('/permission-simulator/matrix', requirePermission('roles', 'READ'), RoleController.permissionMatrix);
roleRoutes.post('/permission-simulator/simulate', requirePermission('roles', 'READ'), RoleController.simulatePermission);
roleRoutes.get('/:id', requirePermission('roles', 'READ'), RoleController.getById);
roleRoutes.post('/', requirePermission('roles', 'CREATE'), RoleController.create);
roleRoutes.patch('/:id', requirePermission('roles', 'UPDATE'), RoleController.update);
roleRoutes.delete('/:id', requirePermission('roles', 'DELETE'), RoleController.delete);

// Permissions
roleRoutes.post('/:id/permissions', requirePermission('roles', 'UPDATE'), RoleController.addPermission);
roleRoutes.delete('/:id/permissions/:permissionId', requirePermission('roles', 'UPDATE'), RoleController.removePermission);

export { roleRoutes };
