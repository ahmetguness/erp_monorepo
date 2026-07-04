import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { AuditLogController } from '../controllers/audit-log.controller';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';

// Audit log tüm planlara açık ama plan bazlı tarih kısıtlaması controller içinde uygulanıyor
const auditLogRoutes = new Hono();

auditLogRoutes.get('/', requirePermission('audit_logs', 'READ'), AuditLogController.list);
auditLogRoutes.get('/export', requireAccess(ACCESS_POLICIES.auditLogExport), requirePermission('audit_logs', 'EXPORT'), AuditLogController.exportLogs);
auditLogRoutes.get('/:id', requirePermission('audit_logs', 'READ'), AuditLogController.getById);

export { auditLogRoutes };
