import { Hono } from 'hono';
import { SearchController } from '../modules/platform/http/controllers/index.js';

const searchRoutes = new Hono();

searchRoutes.get('/', SearchController.global);
searchRoutes.post('/unified', SearchController.unified);
searchRoutes.post('/unified/confirm', SearchController.confirmUnified);

export { searchRoutes };
