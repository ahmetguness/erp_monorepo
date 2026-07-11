import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { PayrollController } from '../controllers/payroll.controller';
import { AdvancedPayrollController } from '../controllers/advanced-payroll.controller';

const payrollRoutes = new Hono();

payrollRoutes.use('*', requireAccess(ACCESS_POLICIES.payroll));

payrollRoutes.get('/', requirePermission('payroll', 'READ'), PayrollController.list);
payrollRoutes.post('/', requirePermission('payroll', 'CREATE'), PayrollController.create);
payrollRoutes.post('/generate-bulk', requirePermission('payroll', 'CREATE'), PayrollController.generateBulk);
payrollRoutes.get('/advanced', requirePermission('payroll', 'READ'), AdvancedPayrollController.get);
payrollRoutes.get('/integration/bank-file', requirePermission('payroll', 'READ'), PayrollController.getBankFile);
payrollRoutes.post('/integration/accounting-voucher', requirePermission('payroll', 'UPDATE'), PayrollController.postAccountingVoucher);
payrollRoutes.get('/integration/closing-checks', requirePermission('payroll', 'READ'), PayrollController.getClosingChecks);
payrollRoutes.get('/:id', requirePermission('payroll', 'READ'), PayrollController.getById);
payrollRoutes.post('/:id/items', requirePermission('payroll', 'UPDATE'), PayrollController.addItem);
payrollRoutes.delete('/:id/items/:itemId', requirePermission('payroll', 'UPDATE'), PayrollController.removeItem);
payrollRoutes.post('/:id/pay', requirePermission('payroll', 'UPDATE'), PayrollController.markPaid);
payrollRoutes.post('/:id/reverse', requirePermission('payroll', 'UPDATE'), PayrollController.reversePayroll);
payrollRoutes.delete('/:id', requirePermission('payroll', 'DELETE'), PayrollController.remove);

export { payrollRoutes };
