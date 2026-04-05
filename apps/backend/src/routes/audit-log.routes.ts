import { Hono } from 'hono';
import { AuditLogController } from '../controllers/audit-log.controller';

const auditLogRoutes = new Hono();

auditLogRoutes.get('/', AuditLogController.list);
auditLogRoutes.get('/export', AuditLogController.exportLogs);
auditLogRoutes.get('/:id', AuditLogController.getById);

export { auditLogRoutes };
