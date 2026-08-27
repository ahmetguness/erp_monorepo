import type { BackendModule } from '../shared/index.js';
import { accountingRoutes } from '../../routes/accounting.routes.js';
import { bankTransactionRoutes } from '../../routes/bank-transaction.routes.js';
import { checkPromissoryRoutes } from '../../routes/check-promissory.routes.js';
import { financialAutonomyRoutes } from '../../routes/financial-autonomy.routes.js';
import { integrityRoutes } from '../../routes/integrity.routes.js';
import { paymentRoutes } from '../../routes/payment.routes.js';
import { reconciliationRoutes } from '../../routes/reconciliation.routes.js';
import { stockValuationRoutes } from '../../routes/stock-valuation.routes.js';

export const financeModule: BackendModule = {
  name: 'finance',
  register(app) {
    app.route('/accounting', accountingRoutes);
    app.route('/payments', paymentRoutes);
    app.route('/financial-autonomy', financialAutonomyRoutes);
    app.route('/integrity', integrityRoutes);
    app.route('/bank-transactions', bankTransactionRoutes);
    app.route('/check-promissory', checkPromissoryRoutes);
    app.route('/reconciliations', reconciliationRoutes);
    app.route('/stock-valuations', stockValuationRoutes);
  },
};
