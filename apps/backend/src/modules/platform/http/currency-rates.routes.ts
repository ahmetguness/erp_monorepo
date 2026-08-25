import { Hono } from 'hono';
import { CurrencyRatesController } from './controllers/index.js';
import { requirePermission } from '../../../middleware/requirePermission.js';

export const currencyRatesRoutes = new Hono();

currencyRatesRoutes.get('/tcmb', requirePermission('settings', 'READ'), CurrencyRatesController.getTcmbRates);
currencyRatesRoutes.get('/', requirePermission('settings', 'READ'), CurrencyRatesController.listRates);
currencyRatesRoutes.post('/', requirePermission('settings', 'UPDATE'), CurrencyRatesController.createRate);
