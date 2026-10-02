import { ACCESS_POLICIES } from "@repo/types/plans";
import { Hono } from "hono";
import { requireAccess } from "../middleware/requireAccess";
import { requirePermission } from "../middleware/requirePermission";
import { validateBody } from "../middleware/validateBody";
import { BankTransactionController } from "../modules/finance/http/controllers/index.js";
import { autoProcessBankTransactionMatchesBodySchema, bankTransactionMatchBodySchema, bulkApproveBankTransactionMatchesBodySchema, createBankTransactionBodySchema } from "../schemas/request-body.schemas";

const bankTransactionRoutes = new Hono();

bankTransactionRoutes.use("*", requireAccess(ACCESS_POLICIES.bankTransactions));

bankTransactionRoutes.get(
  "/",
  requirePermission("accounting", "READ"),
  BankTransactionController.list,
);
bankTransactionRoutes.post(
  "/",
  requirePermission("accounting", "CREATE"),
  validateBody(createBankTransactionBodySchema),
  BankTransactionController.create,
);
bankTransactionRoutes.get(
  "/matching-workbench",
  requirePermission("accounting", "READ"),
  BankTransactionController.matchingWorkbench,
);
bankTransactionRoutes.post(
  "/bulk-approve-matches",
  requirePermission("accounting", "UPDATE"),
  validateBody(bulkApproveBankTransactionMatchesBodySchema),
  BankTransactionController.bulkApproveMatches,
);
bankTransactionRoutes.post(
  "/auto-process-matches",
  requirePermission("accounting", "UPDATE"),
  validateBody(autoProcessBankTransactionMatchesBodySchema),
  BankTransactionController.autoProcessMatches,
);
bankTransactionRoutes.get(
  "/:id/match-suggestions",
  requirePermission("accounting", "READ"),
  BankTransactionController.suggestions,
);
bankTransactionRoutes.post(
  "/:id/approve-match",
  requirePermission("accounting", "UPDATE"),
  validateBody(bankTransactionMatchBodySchema),
  BankTransactionController.approveMatch,
);
bankTransactionRoutes.post(
  "/:id/match",
  requirePermission("accounting", "UPDATE"),
  validateBody(bankTransactionMatchBodySchema),
  BankTransactionController.matchPayment,
);

export { bankTransactionRoutes };
