import type { BackendModule } from '../shared/module.js';
import { agentCommandRoutes } from '../../routes/agent-command.routes.js';
import { automationRuleRoutes } from '../../routes/automation-rule.routes.js';
import { chatRoutes } from '../../routes/chat.routes.js';
import { dataExchangeRoutes } from '../../routes/data-exchange.routes.js';
import { intelligenceRoutes } from '../../routes/intelligence.routes.js';
import { operationsRoutes } from '../../routes/operations.routes.js';

export const automationIntelligenceModule: BackendModule = {
  name: 'automation-intelligence',
  register(app) {
    app.route('/data-exchange', dataExchangeRoutes);
    app.route('/intelligence', intelligenceRoutes);
    app.route('/operations', operationsRoutes);
    app.route('/agent-command', agentCommandRoutes);
    app.route('/automation-rules', automationRuleRoutes);
    app.route('/chat', chatRoutes);
  },
};
