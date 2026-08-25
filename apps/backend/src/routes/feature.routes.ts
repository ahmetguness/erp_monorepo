import { Hono } from 'hono';
import { FeatureController } from '../modules/platform/http/controllers/index.js';

const featureRoutes = new Hono();

featureRoutes.get('/resolved', FeatureController.resolved);

export { featureRoutes };
