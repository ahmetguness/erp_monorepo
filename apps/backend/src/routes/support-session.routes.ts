import { Hono } from 'hono';
import { SupportSessionController } from '../modules/platform/http/controllers/index.js';

export const supportSessionRoutes = new Hono();
supportSessionRoutes.get('/', SupportSessionController.list);
supportSessionRoutes.post('/:id/decision', SupportSessionController.decide);
