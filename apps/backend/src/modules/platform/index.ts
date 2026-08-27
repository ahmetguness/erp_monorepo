import type { BackendModule } from '../shared/index.js';
import { activityRoutes } from '../../routes/activity.routes.js';
import { approvalRoutes } from '../../routes/approval.routes.js';
import { auditLogRoutes } from '../../routes/audit-log.routes.js';
import { bulkOperationRoutes } from '../../routes/bulk-operation.routes.js';
import { domainEventRoutes } from '../../routes/domain-event.routes.js';
import { enterpriseRoutes } from '../../routes/enterprise.routes.js';
import { featureRoutes } from '../../routes/feature.routes.js';
import { mailRoutes } from '../../routes/mail.routes.js';
import { notificationRoutes } from '../../routes/notification.routes.js';
import { planUsageRoutes } from '../../routes/plan-usage.routes.js';
import { reportingRoutes } from '../../routes/reporting.routes.js';
import { savedViewRoutes } from '../../routes/saved-view.routes.js';
import { searchRoutes } from '../../routes/search.routes.js';
import { settingsRoutes } from '../../routes/settings.routes.js';
import { starterCsvImportRoutes } from '../../routes/starter-csv-import.routes.js';
import { starterHealthRoutes } from '../../routes/starter-health.routes.js';
import { taskRoutes } from '../../routes/task.routes.js';
import { currencyRatesRoutes } from './http/currency-rates.routes.js';

export const platformModule: BackendModule = {
  name: 'platform',
  register(app) {
    app.route('/reports', reportingRoutes);
    app.route('/settings', settingsRoutes);
    app.route('/starter-health', starterHealthRoutes);
    app.route('/starter-import', starterCsvImportRoutes);
    app.route('/plan-usage', planUsageRoutes);
    app.route('/features', featureRoutes);
    app.route('/notifications', notificationRoutes);
    app.route('/tasks', taskRoutes);
    app.route('/search', searchRoutes);
    app.route('/audit-logs', auditLogRoutes);
    app.route('/activity', activityRoutes);
    app.route('/saved-views', savedViewRoutes);
    app.route('/domain-events', domainEventRoutes);
    app.route('/approvals', approvalRoutes);
    app.route('/bulk-operations', bulkOperationRoutes);
    app.route('/enterprise', enterpriseRoutes);
    app.route('/mail', mailRoutes);
    app.route('/currency-rates', currencyRatesRoutes);
  },
};
