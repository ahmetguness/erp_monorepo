import { Hono } from 'hono';
import { DataExchangeController } from '../controllers/data-exchange.controller';

const dataExchangeRoutes = new Hono();

dataExchangeRoutes.get('/quality', DataExchangeController.quality);
dataExchangeRoutes.post('/quality/:issueKey/task', DataExchangeController.createQualityTask);
dataExchangeRoutes.get('/import/batches', DataExchangeController.batches);
dataExchangeRoutes.post('/import/batches/:batchId/rollback', DataExchangeController.rollbackBatch);
dataExchangeRoutes.get('/templates/:entity', DataExchangeController.template);
dataExchangeRoutes.get('/export/:entity', DataExchangeController.export);
dataExchangeRoutes.post('/import/preview/:entity', DataExchangeController.preview);

export { dataExchangeRoutes };
