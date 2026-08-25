import { Hono } from 'hono';
import { SearchController } from '../modules/platform/http/controllers/index.js';

const searchRoutes = new Hono();

searchRoutes.get('/', SearchController.global);

export { searchRoutes };
