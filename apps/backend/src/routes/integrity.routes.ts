import { Hono } from 'hono';
import { IntegrityController } from '../services/controllers/integrity.controller.service.js';

const integrityRoutes = new Hono();

integrityRoutes.post('/scan', IntegrityController.runScan);
integrityRoutes.post('/exceptions/:id/resolve', IntegrityController.resolveException);

export { integrityRoutes };
