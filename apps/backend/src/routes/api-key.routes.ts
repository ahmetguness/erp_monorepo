import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { ApiKeyController } from '../controllers/api-key.controller';

const apiKeyRoutes = new Hono();

apiKeyRoutes.use('*', requireAccess(ACCESS_POLICIES.apiKeys));

apiKeyRoutes.get('/manifest', requirePermission('api_keys', 'READ'), ApiKeyController.manifest);
apiKeyRoutes.get('/openapi.json', requirePermission('api_keys', 'READ'), ApiKeyController.openApi);
apiKeyRoutes.get('/', requirePermission('api_keys', 'READ'), ApiKeyController.list);
apiKeyRoutes.get('/:id/activity', requirePermission('api_keys', 'READ'), ApiKeyController.activity);
apiKeyRoutes.post('/', requirePermission('api_keys', 'CREATE'), ApiKeyController.create);
apiKeyRoutes.post('/:id/revoke', requirePermission('api_keys', 'UPDATE'), ApiKeyController.revoke);
apiKeyRoutes.delete('/:id', requirePermission('api_keys', 'DELETE'), ApiKeyController.delete);

export { apiKeyRoutes };
