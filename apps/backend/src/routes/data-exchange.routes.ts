import { PermissionAction } from '@prisma/client';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { Hono } from 'hono';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { DataExchangeController,EdiB2BController } from '../modules/automation-intelligence/http/controllers/index.js';
import { DataDeduplicationController } from '../modules/platform/http/controllers/index.js';

const dataExchangeRoutes = new Hono();

dataExchangeRoutes.get('/b2b', requireAccess(ACCESS_POLICIES.b2bIntegrations), requirePermission('marketplace', PermissionAction.READ), EdiB2BController.hub);
dataExchangeRoutes.post('/b2b/retry', requireAccess(ACCESS_POLICIES.b2bIntegrations), requirePermission('marketplace', PermissionAction.UPDATE), EdiB2BController.retry);
dataExchangeRoutes.get('/quality', DataExchangeController.quality);
dataExchangeRoutes.post('/quality/:issueKey/task', DataExchangeController.createQualityTask);
dataExchangeRoutes.get('/quality/duplicates/contacts', requirePermission('contacts', PermissionAction.READ), DataDeduplicationController.scanContacts);
dataExchangeRoutes.get('/quality/duplicates/products', requirePermission('inventory', PermissionAction.READ), DataDeduplicationController.scanProducts);
dataExchangeRoutes.get('/quality/duplicates/invoices', requirePermission('invoicing', PermissionAction.READ), DataDeduplicationController.scanInvoices);
dataExchangeRoutes.post('/quality/duplicates/contacts/preview', requirePermission('contacts', PermissionAction.UPDATE), DataDeduplicationController.previewContactMerge);
dataExchangeRoutes.post('/quality/duplicates/contacts/merge', requirePermission('contacts', PermissionAction.UPDATE), DataDeduplicationController.mergeContacts);
dataExchangeRoutes.post('/quality/duplicates/contacts/rollback/:auditLogId', requirePermission('contacts', PermissionAction.UPDATE), DataDeduplicationController.rollbackContactMerge);
dataExchangeRoutes.get('/import/batches', DataExchangeController.batches);
dataExchangeRoutes.post('/import/batches/:batchId/rollback', DataExchangeController.rollbackBatch);
dataExchangeRoutes.get('/templates/:entity', DataExchangeController.template);
dataExchangeRoutes.get('/export/:entity', DataExchangeController.export);
dataExchangeRoutes.post('/import/preview/:entity', DataExchangeController.preview);

export { dataExchangeRoutes };
