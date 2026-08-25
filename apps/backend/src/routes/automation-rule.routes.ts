import { ACCESS_POLICIES } from '@repo/types/plans';
import { Hono } from 'hono';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { AutomationRuleController } from '../modules/automation-intelligence/http/controllers/index.js';

const automationRuleRoutes = new Hono();

automationRuleRoutes.use('*', requireAccess(ACCESS_POLICIES.workflowAutomation));

automationRuleRoutes.get('/scheduler/jobs', requirePermission('settings', 'READ'), AutomationRuleController.listSchedulerJobs);
automationRuleRoutes.get('/scheduler/runs', requirePermission('settings', 'READ'), AutomationRuleController.listSchedulerRuns);
automationRuleRoutes.post('/scheduler/run', requirePermission('settings', 'UPDATE'), AutomationRuleController.runScheduler);
automationRuleRoutes.get('/', requirePermission('settings', 'READ'), AutomationRuleController.list);
automationRuleRoutes.get('/executions', requirePermission('settings', 'READ'), AutomationRuleController.listExecutions);
automationRuleRoutes.post('/', requirePermission('settings', 'CREATE'), AutomationRuleController.create);
automationRuleRoutes.post('/run-active', requirePermission('settings', 'UPDATE'), AutomationRuleController.runActive);
automationRuleRoutes.patch('/:id', requirePermission('settings', 'UPDATE'), AutomationRuleController.update);
automationRuleRoutes.post('/:id/run', requirePermission('settings', 'UPDATE'), AutomationRuleController.run);
automationRuleRoutes.delete('/:id', requirePermission('settings', 'DELETE'), AutomationRuleController.remove);

export { automationRuleRoutes };
