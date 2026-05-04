import { Hono } from 'hono';
import { AuditLogController } from '../controllers/audit-log.controller';

// Audit log tüm planlara açık ama plan bazlı tarih kısıtlaması controller içinde uygulanıyor
const auditLogRoutes = new Hono();

auditLogRoutes.get('/', AuditLogController.list);
auditLogRoutes.get('/export', AuditLogController.exportLogs);
auditLogRoutes.get('/:id', AuditLogController.getById);

export { auditLogRoutes };
