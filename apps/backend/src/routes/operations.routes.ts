import { Hono } from 'hono';
import { OperationsController } from '../modules/automation-intelligence/http/controllers/index.js';

const operationsRoutes = new Hono();

operationsRoutes.get('/health', OperationsController.getHealth);
operationsRoutes.get('/timeline/:entityType/:entityId', OperationsController.getTimeline);

export { operationsRoutes };
