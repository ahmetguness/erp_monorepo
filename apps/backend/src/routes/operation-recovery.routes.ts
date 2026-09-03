import { Hono } from 'hono';
import { requireRecordContextPermission } from '../middleware/requireRecordContextPermission.js';
import { OperationRecoveryController } from '../modules/recovery/http/controllers/index.js';

export const operationRecoveryRoutes = new Hono();
operationRecoveryRoutes.get('/:entityType/:entityId', requireRecordContextPermission('READ'), OperationRecoveryController.list);
operationRecoveryRoutes.post('/:entityType/:entityId/:auditLogId/undo', requireRecordContextPermission('UPDATE'), OperationRecoveryController.undo);
