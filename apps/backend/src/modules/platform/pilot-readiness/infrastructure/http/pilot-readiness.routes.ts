import { Hono } from 'hono';
import { requirePermission } from '../../../../../middleware/requirePermission.js';
import { PilotReadinessController } from './pilot-readiness.controller.js';

export const pilotReadinessRoutes = new Hono();

pilotReadinessRoutes.get('/', requirePermission('operations', 'READ'), PilotReadinessController.get);
