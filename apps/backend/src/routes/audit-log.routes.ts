import { Hono } from 'hono';
import { AuditLogController } from '../controllers/audit-log.controller';

const auditLogRoutes = new Hono();

auditLogRoutes.get('/', AuditLogController.list);
auditLogRoutes.get('/:id', AuditLogController.getById);

export { auditLogRoutes };
