import { Hono } from 'hono';
import { DomainEventController } from '../controllers/domain-event.controller';
import { requirePermission } from '../middleware/requirePermission';

const domainEventRoutes = new Hono();

domainEventRoutes.get('/', requirePermission('audit_logs', 'READ'), DomainEventController.list);
domainEventRoutes.get('/failures', requirePermission('audit_logs', 'READ'), DomainEventController.failures);
domainEventRoutes.get('/coverage', requirePermission('audit_logs', 'READ'), DomainEventController.coverage);
domainEventRoutes.post('/:id/replay', requirePermission('audit_logs', 'UPDATE'), DomainEventController.replay);

export { domainEventRoutes };
