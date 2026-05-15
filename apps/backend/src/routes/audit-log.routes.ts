import { Hono } from 'hono';
import { AuditLogController } from '../controllers/audit-log.controller';
import { requirePermission } from '../middleware/requirePermission';

// Audit log tüm planlara açık ama plan bazlı tarih kısıtlaması controller içinde uygulanıyor
const auditLogRoutes = new Hono();

auditLogRoutes.get('/', requirePermission('audit_logs', 'READ'), AuditLogController.list);
auditLogRoutes.get('/export', requirePermission('audit_logs', 'EXPORT'), AuditLogController.exportLogs);
auditLogRoutes.get('/:id', requirePermission('audit_logs', 'READ'), AuditLogController.getById);

export { auditLogRoutes };
