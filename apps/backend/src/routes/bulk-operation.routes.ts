import { ACCESS_POLICIES } from '@repo/types/plans';
import { Hono } from 'hono';
import { requireAccess } from '../middleware/requireAccess.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { BulkOperationController } from '../modules/platform/http/controllers/index.js';

const bulkOperationRoutes = new Hono();

bulkOperationRoutes.use('*', requireAccess(ACCESS_POLICIES.bulkOperations));

bulkOperationRoutes.post('/contacts/preview', requirePermission('contacts', 'UPDATE'), BulkOperationController.previewContacts);
bulkOperationRoutes.post('/contacts/execute', requirePermission('contacts', 'UPDATE'), BulkOperationController.executeContacts);
bulkOperationRoutes.post('/products/preview', requirePermission('inventory', 'UPDATE'), BulkOperationController.previewProducts);
bulkOperationRoutes.post('/products/execute', requirePermission('inventory', 'UPDATE'), BulkOperationController.executeProducts);
bulkOperationRoutes.post('/invoices/preview', requirePermission('invoicing', 'UPDATE'), BulkOperationController.previewInvoices);
bulkOperationRoutes.post('/invoices/execute', requirePermission('invoicing', 'UPDATE'), BulkOperationController.executeInvoices);
bulkOperationRoutes.post('/imports/analyze', requirePermission('settings', 'CREATE'), BulkOperationController.analyzeImport);
bulkOperationRoutes.get('/imports/profiles', requirePermission('settings', 'READ'), BulkOperationController.listMappingProfiles);
bulkOperationRoutes.post('/imports/profiles', requirePermission('settings', 'CREATE'), BulkOperationController.saveMappingProfile);

export { bulkOperationRoutes };
