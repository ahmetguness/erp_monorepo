import { Hono } from 'hono';
import { AutomationRuleController } from '../controllers/automation-rule.controller';
import { requirePermission } from '../middleware/requirePermission';

const automationRuleRoutes = new Hono();

automationRuleRoutes.get('/', requirePermission('settings', 'READ'), AutomationRuleController.list);
automationRuleRoutes.post('/', requirePermission('settings', 'CREATE'), AutomationRuleController.create);
automationRuleRoutes.post('/run-active', requirePermission('settings', 'UPDATE'), AutomationRuleController.runActive);
automationRuleRoutes.patch('/:id', requirePermission('settings', 'UPDATE'), AutomationRuleController.update);
automationRuleRoutes.post('/:id/run', requirePermission('settings', 'UPDATE'), AutomationRuleController.run);
automationRuleRoutes.delete('/:id', requirePermission('settings', 'DELETE'), AutomationRuleController.remove);

export { automationRuleRoutes };
