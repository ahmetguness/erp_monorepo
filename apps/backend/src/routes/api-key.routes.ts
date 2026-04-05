import { Hono } from 'hono';
import { FeatureKey } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { ApiKeyController } from '../controllers/api-key.controller';

const apiKeyRoutes = new Hono();

apiKeyRoutes.use('*', requirePlan('PROFESSIONAL'));
apiKeyRoutes.use('*', requireFeature(FeatureKey.API_ACCESS));

apiKeyRoutes.get('/', ApiKeyController.list);
apiKeyRoutes.post('/', ApiKeyController.create);
apiKeyRoutes.post('/:id/revoke', ApiKeyController.revoke);
apiKeyRoutes.delete('/:id', ApiKeyController.delete);

export { apiKeyRoutes };
