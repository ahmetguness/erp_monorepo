import { Hono } from 'hono';
import { MasterDataController } from '../controllers/master-data.controller';
import { requirePermission } from '../middleware/requirePermission';

// Master data (Unit, Category, TaxRate, Currency) — tüm starter modülleri kullanır
const masterDataRoutes = new Hono();

masterDataRoutes.get('/units', requirePermission('settings', 'READ'), MasterDataController.listUnits);
masterDataRoutes.post('/units', requirePermission('settings', 'CREATE'), MasterDataController.createUnit);
masterDataRoutes.delete('/units/:id', requirePermission('settings', 'DELETE'), MasterDataController.deleteUnit);

masterDataRoutes.get('/categories', requirePermission('settings', 'READ'), MasterDataController.listCategories);
masterDataRoutes.post('/categories', requirePermission('settings', 'CREATE'), MasterDataController.createCategory);
masterDataRoutes.patch('/categories/:id', requirePermission('settings', 'UPDATE'), MasterDataController.updateCategory);
masterDataRoutes.delete('/categories/:id', requirePermission('settings', 'DELETE'), MasterDataController.deleteCategory);

masterDataRoutes.get('/tax-rates', requirePermission('settings', 'READ'), MasterDataController.listTaxRates);
masterDataRoutes.post('/tax-rates', requirePermission('settings', 'CREATE'), MasterDataController.createTaxRate);
masterDataRoutes.patch('/tax-rates/:id', requirePermission('settings', 'UPDATE'), MasterDataController.updateTaxRate);

masterDataRoutes.get('/currencies', requirePermission('settings', 'READ'), MasterDataController.listCurrencies);
masterDataRoutes.post('/currencies', requirePermission('settings', 'CREATE'), MasterDataController.createCurrency);

export { masterDataRoutes };
