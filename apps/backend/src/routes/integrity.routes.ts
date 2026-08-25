import { Hono } from 'hono';
import { IntegrityController } from '../modules/finance/http/controllers/index.js';

const integrityRoutes = new Hono();

integrityRoutes.post('/scan', IntegrityController.runScan);
integrityRoutes.post('/exceptions/:id/resolve', IntegrityController.resolveException);

export { integrityRoutes };
