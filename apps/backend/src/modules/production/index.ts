import type { BackendModule } from '../shared/module.js';
import { productionAutonomyRoutes } from '../../routes/production-autonomy.routes.js';
import { productionRoutes } from '../../routes/production.routes.js';

export const productionModule: BackendModule = {
  name: 'production',
  register(app) {
    app.route('/production-autonomy', productionAutonomyRoutes);
    app.route('/production', productionRoutes);
  },
};
