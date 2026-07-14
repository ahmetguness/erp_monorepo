import { Hono } from 'hono';
import { FeatureController } from '../controllers/feature.controller';

const featureRoutes = new Hono();

featureRoutes.get('/resolved', FeatureController.resolved);

export { featureRoutes };
