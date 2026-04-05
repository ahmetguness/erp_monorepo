import { Hono } from 'hono';
import { requirePlan } from '../middleware/requirePlan';
import { ApiKeyController } from '../controllers/api-key.controller';

const apiKeyRoutes = new Hono();

apiKeyRoutes.use('*', requirePlan('PROFESSIONAL'));

apiKeyRoutes.get('/', ApiKeyController.list);
apiKeyRoutes.post('/', ApiKeyController.create);
apiKeyRoutes.post('/:id/revoke', ApiKeyController.revoke);
apiKeyRoutes.delete('/:id', ApiKeyController.delete);

export { apiKeyRoutes };
