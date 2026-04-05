import { Hono } from 'hono';
import { requirePlan } from '../middleware/requirePlan';
import { RoleController } from '../controllers/role.controller';

const roleRoutes = new Hono();

roleRoutes.use('*', requirePlan('PROFESSIONAL'));

roleRoutes.get('/', RoleController.list);
roleRoutes.get('/:id', RoleController.getById);
roleRoutes.post('/', RoleController.create);
roleRoutes.patch('/:id', RoleController.update);
roleRoutes.delete('/:id', RoleController.delete);

// Permissions
roleRoutes.post('/:id/permissions', RoleController.addPermission);
roleRoutes.delete('/:id/permissions/:permissionId', RoleController.removePermission);

export { roleRoutes };
