import { Hono } from 'hono';
import { NavigationWorkspaceController } from '../modules/platform/http/controllers/index.js';

const navigationWorkspaceRoutes = new Hono();
navigationWorkspaceRoutes.get('/', NavigationWorkspaceController.get);
navigationWorkspaceRoutes.patch('/preferences', NavigationWorkspaceController.update);
navigationWorkspaceRoutes.post('/activity', NavigationWorkspaceController.activity);
navigationWorkspaceRoutes.put('/profiles/:roleId', NavigationWorkspaceController.distribute);

export { navigationWorkspaceRoutes };
