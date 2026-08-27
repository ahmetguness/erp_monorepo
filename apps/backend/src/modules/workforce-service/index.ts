import type { BackendModule } from '../shared/index.js';
import { hrRoutes } from '../../routes/hr.routes.js';
import { payrollRoutes } from '../../routes/payroll.routes.js';
import { serviceRoutes } from '../../routes/service.routes.js';

export const workforceServiceModule: BackendModule = {
  name: 'workforce-service',
  register(app) {
    app.route('/hr', hrRoutes);
    app.route('/payroll', payrollRoutes);
    app.route('/service', serviceRoutes);
  },
};
