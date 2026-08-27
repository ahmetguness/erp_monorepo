import type { BackendModule } from '../shared/index.js';
import { marketplacePricingRoutes } from '../../routes/marketplace-pricing.routes.js';
import { marketplaceRoutes } from '../../routes/marketplace.routes.js';

export const marketplaceModule: BackendModule = {
  name: 'marketplace',
  register(app) {
    app.route('/marketplace-pricing', marketplacePricingRoutes);
    app.route('/marketplace', marketplaceRoutes);
  },
};
