import type { BackendModule } from './shared/module.js';
import { automationIntelligenceModule } from './automation-intelligence/index.js';
import { financeModule } from './finance/index.js';
import { identityModule } from './identity/index.js';
import { inventoryModule } from './inventory/index.js';
import { marketplaceModule } from './marketplace/index.js';
import { platformModule } from './platform/index.js';
import { procurementModule } from './procurement/index.js';
import { productionModule } from './production/index.js';
import { salesModule } from './sales/index.js';
import { workforceServiceModule } from './workforce-service/index.js';

export const tenantModules: readonly BackendModule[] = Object.freeze([
  identityModule,
  inventoryModule,
  salesModule,
  financeModule,
  procurementModule,
  productionModule,
  workforceServiceModule,
  marketplaceModule,
  automationIntelligenceModule,
  platformModule,
]);
