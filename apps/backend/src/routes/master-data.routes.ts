import { Hono } from 'hono';
import { MasterDataController } from '../controllers/master-data.controller';

// Master data (Unit, Category, TaxRate, Currency) — tüm starter modülleri kullanır
const masterDataRoutes = new Hono();

masterDataRoutes.get('/units', MasterDataController.listUnits);
masterDataRoutes.post('/units', MasterDataController.createUnit);
masterDataRoutes.delete('/units/:id', MasterDataController.deleteUnit);

masterDataRoutes.get('/categories', MasterDataController.listCategories);
masterDataRoutes.post('/categories', MasterDataController.createCategory);
masterDataRoutes.patch('/categories/:id', MasterDataController.updateCategory);
masterDataRoutes.delete('/categories/:id', MasterDataController.deleteCategory);

masterDataRoutes.get('/tax-rates', MasterDataController.listTaxRates);
masterDataRoutes.post('/tax-rates', MasterDataController.createTaxRate);
masterDataRoutes.patch('/tax-rates/:id', MasterDataController.updateTaxRate);

masterDataRoutes.get('/currencies', MasterDataController.listCurrencies);
masterDataRoutes.post('/currencies', MasterDataController.createCurrency);

export { masterDataRoutes };
