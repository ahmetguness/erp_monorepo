import { Hono } from 'hono';
import { NotificationController } from '../controllers/notification.controller';
import { requirePermission } from '../middleware/requirePermission';

// Notifications tüm planlara açık — requireAuth zaten tenantApi seviyesinde uygulanıyor
const notificationRoutes = new Hono();

notificationRoutes.get('/smart', requirePermission('notifications', 'READ'), NotificationController.smart);
notificationRoutes.post('/smart/:id/action', requirePermission('notifications', 'UPDATE'), NotificationController.smartAction);
notificationRoutes.get('/', requirePermission('notifications', 'READ'), NotificationController.list);
notificationRoutes.post('/read-all', requirePermission('notifications', 'UPDATE'), NotificationController.markAllAsRead);
notificationRoutes.post('/:id/read', requirePermission('notifications', 'UPDATE'), NotificationController.markAsRead);
notificationRoutes.post('/:id/archive', requirePermission('notifications', 'UPDATE'), NotificationController.archive);
notificationRoutes.delete('/all', requirePermission('notifications', 'DELETE'), NotificationController.deleteAll);
notificationRoutes.delete('/:id', requirePermission('notifications', 'DELETE'), NotificationController.delete);

export { notificationRoutes };
