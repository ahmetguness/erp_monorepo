import { ACCESS_POLICIES } from "@repo/types/plans";
import { Hono } from "hono";
import { requireAccess } from "../middleware/requireAccess";
import { requirePermission } from "../middleware/requirePermission";
import { validateBody } from "../middleware/validateBody.js";
import { bulkPayrollBodySchema, createPayrollBodySchema, emptyBodySchema, payrollItemBodySchema } from "../schemas/request-body.schemas.js";
import {
  AdvancedPayrollController,
  PayrollController,
} from "../modules/workforce-service/http/controllers/index.js";

const payrollRoutes = new Hono();

payrollRoutes.use("*", requireAccess(ACCESS_POLICIES.payroll));

payrollRoutes.get(
  "/",
  requirePermission("payroll", "READ"),
  PayrollController.list,
);
payrollRoutes.post(
  "/",
  requirePermission("payroll", "CREATE"),
  validateBody(createPayrollBodySchema),
  PayrollController.create,
);
payrollRoutes.post(
  "/generate-bulk",
  requirePermission("payroll", "CREATE"),
  validateBody(bulkPayrollBodySchema),
  PayrollController.generateBulk,
);
payrollRoutes.get(
  "/advanced",
  requirePermission("payroll", "READ"),
  AdvancedPayrollController.get,
);
payrollRoutes.get(
  "/integration/bank-file",
  requirePermission("payroll", "EXPORT"),
  PayrollController.getBankFile,
);
payrollRoutes.post(
  "/integration/accounting-voucher",
  requirePermission("payroll", "UPDATE"),
  PayrollController.postAccountingVoucher,
);
payrollRoutes.get(
  "/integration/closing-checks",
  requirePermission("payroll", "READ"),
  PayrollController.getClosingChecks,
);
payrollRoutes.get(
  "/:id",
  requirePermission("payroll", "READ"),
  PayrollController.getById,
);
payrollRoutes.post(
  "/:id/items",
  requirePermission("payroll", "UPDATE"),
  validateBody(payrollItemBodySchema),
  PayrollController.addItem,
);
payrollRoutes.delete(
  "/:id/items/:itemId",
  requirePermission("payroll", "UPDATE"),
  PayrollController.removeItem,
);
payrollRoutes.post(
  "/:id/pay",
  requirePermission("payroll", "UPDATE"),
  validateBody(emptyBodySchema),
  PayrollController.markPaid,
);
payrollRoutes.post(
  "/:id/reverse",
  requirePermission("payroll", "UPDATE"),
  PayrollController.reversePayroll,
);
payrollRoutes.delete(
  "/:id",
  requirePermission("payroll", "DELETE"),
  PayrollController.remove,
);

export { payrollRoutes };
