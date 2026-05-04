import { Hono } from 'hono';
import { NotificationController } from '../controllers/notification.controller';

const notificationRoutes = new Hono();

notificationRoutes.get('/', NotificationController.list);
notificationRoutes.post('/read-all', NotificationController.markAllAsRead);
notificationRoutes.post('/:id/read', NotificationController.markAsRead);
notificationRoutes.post('/:id/archive', NotificationController.archive);
notificationRoutes.delete('/:id', NotificationController.delete);

export { notificationRoutes };
