import { Hono } from 'hono';
import { PaymentController } from '../controllers/payment.controller';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';

const paymentRoutes = new Hono();

paymentRoutes.use('*', requireModule(MODULE_KEYS.ACCOUNTING));

// Bank Accounts
paymentRoutes.get('/bank-accounts', PaymentController.listBankAccounts);
paymentRoutes.post('/bank-accounts', PaymentController.createBankAccount);

// Cash Accounts
paymentRoutes.get('/cash-accounts', PaymentController.listCashAccounts);
paymentRoutes.post('/cash-accounts', PaymentController.createCashAccount);

// Payments
paymentRoutes.get('/', PaymentController.listPayments);
paymentRoutes.get('/:id', PaymentController.getPaymentById);
paymentRoutes.post('/', PaymentController.createPayment);

export { paymentRoutes };
