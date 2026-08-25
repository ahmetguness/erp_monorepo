import type { BackendModule } from '../shared/module.js';
import { procurementAutonomyRoutes } from '../../routes/procurement-autonomy.routes.js';
import { purchaseOrderRoutes } from '../../routes/purchase-order.routes.js';

export const procurementModule: BackendModule = {
  name: 'procurement',
  register(app) {
    app.route('/purchase-orders', purchaseOrderRoutes);
    app.route('/procurement-autonomy', procurementAutonomyRoutes);
  },
};
