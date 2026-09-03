import { Hono } from 'hono';
import { requireRecordContextPermission } from '../middleware/requireRecordContextPermission.js';
import { ActivityController } from '../modules/platform/http/controllers/index.js';

const activityRoutes = new Hono();

activityRoutes.get('/', requireRecordContextPermission('READ', 'query'), ActivityController.list);

export { activityRoutes };
