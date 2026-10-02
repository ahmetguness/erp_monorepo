import { Hono } from "hono";
import { FinancialAutonomyController } from "../modules/finance/http/controllers/index.js";
import { FinanceOperationsController } from "../modules/finance/http/controllers/index.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody } from "../middleware/validateBody.js";
import { executeFinancialAutonomyActionBodySchema } from "../schemas/request-body.schemas.js";

const financialAutonomyRoutes = new Hono();

financialAutonomyRoutes.get(
  "/cash-flow-forecast",
  requirePermission("accounting", "READ"),
  FinancialAutonomyController.getCashFlowForecast,
);
financialAutonomyRoutes.get(
  "/contact-velocity/:contactId",
  requirePermission("accounting", "READ"),
  FinancialAutonomyController.getContactVelocity,
);
financialAutonomyRoutes.post(
  "/collection-settlement/:invoiceId",
  requirePermission("accounting", "UPDATE"),
  FinancialAutonomyController.generateCollectionSettlement,
);
financialAutonomyRoutes.get(
  "/recommendations",
  requirePermission("accounting", "READ"),
  FinancialAutonomyController.getRecommendations,
);
financialAutonomyRoutes.post(
  "/execute-action",
  requirePermission("accounting", "UPDATE"),
  validateBody(executeFinancialAutonomyActionBodySchema),
  FinancialAutonomyController.executeAction,
);
financialAutonomyRoutes.get(
  "/operations",
  requirePermission("accounting", "READ"),
  FinanceOperationsController.workspace,
);
financialAutonomyRoutes.put(
  "/operations/policy",
  requirePermission("accounting", "UPDATE"),
  FinanceOperationsController.updatePolicy,
);
financialAutonomyRoutes.post(
  "/operations/run",
  requirePermission("accounting", "UPDATE"),
  FinanceOperationsController.run,
);

export { financialAutonomyRoutes };
