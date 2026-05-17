import { Hono } from 'hono';
import { TaskController } from '../controllers/task.controller';

const taskRoutes = new Hono();

taskRoutes.get('/', TaskController.listMyTasks);
taskRoutes.post('/', TaskController.create);
taskRoutes.patch('/:id', TaskController.update);

export { taskRoutes };
