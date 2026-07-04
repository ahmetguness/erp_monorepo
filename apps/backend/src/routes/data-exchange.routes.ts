import { Hono } from 'hono';
import { PermissionAction } from '@prisma/client';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { DataExchangeController } from '../controllers/data-exchange.controller';
import { EdiB2BController } from '../controllers/edi-b2b.controller';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';

const dataExchangeRoutes = new Hono();

dataExchangeRoutes.get('/b2b', requireAccess(ACCESS_POLICIES.b2bIntegrations), requirePermission('marketplace', PermissionAction.READ), EdiB2BController.hub);
dataExchangeRoutes.get('/quality', DataExchangeController.quality);
dataExchangeRoutes.post('/quality/:issueKey/task', DataExchangeController.createQualityTask);
dataExchangeRoutes.get('/import/batches', DataExchangeController.batches);
dataExchangeRoutes.post('/import/batches/:batchId/rollback', DataExchangeController.rollbackBatch);
dataExchangeRoutes.get('/templates/:entity', DataExchangeController.template);
dataExchangeRoutes.get('/export/:entity', DataExchangeController.export);
dataExchangeRoutes.post('/import/preview/:entity', DataExchangeController.preview);

export { dataExchangeRoutes };
