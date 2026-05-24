import { Hono } from 'hono';
import { DomainEventController } from '../controllers/domain-event.controller';
import { requirePermission } from '../middleware/requirePermission';

const domainEventRoutes = new Hono();

domainEventRoutes.get('/', requirePermission('audit_logs', 'READ'), DomainEventController.list);

export { domainEventRoutes };
