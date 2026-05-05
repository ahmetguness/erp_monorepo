import { Hono } from 'hono';
import { NotificationController } from '../controllers/notification.controller';

// Notifications tüm planlara açık — requireAuth zaten tenantApi seviyesinde uygulanıyor
const notificationRoutes = new Hono();

notificationRoutes.get('/', NotificationController.list);
notificationRoutes.post('/read-all', NotificationController.markAllAsRead);
notificationRoutes.post('/:id/read', NotificationController.markAsRead);
notificationRoutes.post('/:id/archive', NotificationController.archive);
notificationRoutes.delete('/all', NotificationController.deleteAll);
notificationRoutes.delete('/:id', NotificationController.delete);

export { notificationRoutes };
