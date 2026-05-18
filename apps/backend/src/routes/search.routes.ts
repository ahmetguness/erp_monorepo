import { Hono } from 'hono';
import { SearchController } from '../controllers/search.controller';

const searchRoutes = new Hono();

searchRoutes.get('/', SearchController.global);

export { searchRoutes };
