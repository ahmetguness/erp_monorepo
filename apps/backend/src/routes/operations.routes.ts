import { Hono } from 'hono';
import { OperationsController } from '../services/controllers/operations.controller.service.js';

const operationsRoutes = new Hono();

operationsRoutes.get('/health', OperationsController.getHealth);
operationsRoutes.get('/timeline/:entityType/:entityId', OperationsController.getTimeline);

export { operationsRoutes };
