import { Hono } from 'hono';
import { TaskController } from '../modules/platform/http/controllers/index.js';

const taskRoutes = new Hono();

taskRoutes.get('/exceptions', TaskController.exceptionCenter);
taskRoutes.get('/today', TaskController.today);
taskRoutes.get('/', TaskController.listMyTasks);
taskRoutes.post('/', TaskController.create);
taskRoutes.patch('/:id', TaskController.update);

export { taskRoutes };
