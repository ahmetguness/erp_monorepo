import { Hono } from 'hono';
import { DataExchangeController } from '../controllers/data-exchange.controller';

const dataExchangeRoutes = new Hono();

dataExchangeRoutes.get('/quality', DataExchangeController.quality);
dataExchangeRoutes.get('/templates/:entity', DataExchangeController.template);
dataExchangeRoutes.get('/export/:entity', DataExchangeController.export);
dataExchangeRoutes.post('/import/preview/:entity', DataExchangeController.preview);

export { dataExchangeRoutes };
