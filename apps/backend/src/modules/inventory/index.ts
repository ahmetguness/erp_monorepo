import type { BackendModule } from '../shared/index.js';
import { attachmentRoutes } from '../../routes/attachment.routes.js';
import { inventoryReservationRoutes } from '../../routes/inventory-reservation.routes.js';
import { lotSerialRoutes } from '../../routes/lot-serial.routes.js';
import { masterDataRoutes } from '../../routes/master-data.routes.js';
import { productBatchRoutes } from '../../routes/product-batch.routes.js';
import { productRoutes } from '../../routes/product.routes.js';
import { stockRoutes } from '../../routes/stock.routes.js';
import { warehouseRoutes } from '../../routes/warehouse.routes.js';

export const inventoryModule: BackendModule = {
  name: 'inventory',
  register(app) {
    app.route('/products', productRoutes);
    app.route('/warehouses', warehouseRoutes);
    app.route('/stock', stockRoutes);
    app.route('/master', masterDataRoutes);
    app.route('/inventory-reservations', inventoryReservationRoutes);
    app.route('/product-batches', productBatchRoutes);
    app.route('/lot-serials', lotSerialRoutes);
    app.route('/attachments', attachmentRoutes);
  },
};
