import { Hono } from 'hono';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validateBody.js';
import { bankAccountMasterDataEnrichmentSchema, contactMasterDataEnrichmentSchema, MasterDataEnrichmentController, productMasterDataEnrichmentSchema } from '../modules/platform/http/controllers/index.js';

const masterDataEnrichmentRoutes = new Hono();

masterDataEnrichmentRoutes.post('/contact/preview', requirePermission('contacts', 'READ'), validateBody(contactMasterDataEnrichmentSchema), MasterDataEnrichmentController.preview);
masterDataEnrichmentRoutes.post('/product/preview', requirePermission('inventory', 'READ'), validateBody(productMasterDataEnrichmentSchema), MasterDataEnrichmentController.preview);
masterDataEnrichmentRoutes.post('/bankAccount/preview', requirePermission('accounting', 'READ'), validateBody(bankAccountMasterDataEnrichmentSchema), MasterDataEnrichmentController.preview);

export { masterDataEnrichmentRoutes };
