import { Hono } from 'hono';
import { PaymentController } from '../controllers/payment.controller';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';

const paymentRoutes = new Hono();

paymentRoutes.use('*', requireModule(MODULE_KEYS.ACCOUNTING));

// Bank Accounts
paymentRoutes.get('/bank-accounts', requirePermission('accounting', 'READ'), PaymentController.listBankAccounts);
paymentRoutes.post('/bank-accounts', requirePermission('accounting', 'CREATE'), PaymentController.createBankAccount);
paymentRoutes.patch('/bank-accounts/:id', requirePermission('accounting', 'UPDATE'), PaymentController.updateBankAccount);
paymentRoutes.delete('/bank-accounts/:id', requirePermission('accounting', 'DELETE'), PaymentController.deleteBankAccount);

// Cash Accounts
paymentRoutes.get('/cash-accounts', requirePermission('accounting', 'READ'), PaymentController.listCashAccounts);
paymentRoutes.post('/cash-accounts', requirePermission('accounting', 'CREATE'), PaymentController.createCashAccount);
paymentRoutes.patch('/cash-accounts/:id', requirePermission('accounting', 'UPDATE'), PaymentController.updateCashAccount);
paymentRoutes.delete('/cash-accounts/:id', requirePermission('accounting', 'DELETE'), PaymentController.deleteCashAccount);

// Payments
paymentRoutes.get('/', requirePermission('accounting', 'READ'), PaymentController.listPayments);
paymentRoutes.get('/:id', requirePermission('accounting', 'READ'), PaymentController.getPaymentById);
paymentRoutes.post('/', requirePermission('accounting', 'CREATE'), PaymentController.createPayment);
paymentRoutes.post('/:id/cancel', requirePermission('accounting', 'UPDATE'), PaymentController.cancelPayment);

export { paymentRoutes };
