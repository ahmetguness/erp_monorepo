import { Hono } from "hono";
import { requireModule } from "../middleware/requireModule";
import { requirePermission } from "../middleware/requirePermission";
import { validateBody } from "../middleware/validateBody";
import { SalesOrderController } from "../modules/sales/http/controllers/index.js";
import { fulfillSalesOrderBodySchema } from "../schemas/request-body.schemas";
import {
  createSalesOrderBodySchema,
  createSalesQuoteBodySchema,
  updateSalesOrderBodySchema,
  updateSalesQuoteBodySchema,
  updateSalesQuoteStatusBodySchema,
} from "../schemas/request-body.schemas";
import { MODULE_KEYS } from "../types/module.types";

const salesOrderRoutes = new Hono();

salesOrderRoutes.use("*", requireModule(MODULE_KEYS.INVOICING));

salesOrderRoutes.get(
  "/quotes",
  requirePermission("invoicing", "READ"),
  SalesOrderController.listQuotes,
);
salesOrderRoutes.get(
  "/quotes/:id",
  requirePermission("invoicing", "READ"),
  SalesOrderController.getQuoteById,
);
salesOrderRoutes.post(
  "/quotes",
  requirePermission("invoicing", "CREATE"),
  validateBody(createSalesQuoteBodySchema),
  SalesOrderController.createQuote,
);
salesOrderRoutes.patch(
  "/quotes/:id",
  requirePermission("invoicing", "UPDATE"),
  validateBody(updateSalesQuoteBodySchema),
  SalesOrderController.updateQuote,
);
salesOrderRoutes.patch(
  "/quotes/:id/status",
  requirePermission("invoicing", "UPDATE"),
  validateBody(updateSalesQuoteStatusBodySchema),
  SalesOrderController.updateQuoteStatus,
);
salesOrderRoutes.delete(
  "/quotes/:id",
  requirePermission("invoicing", "DELETE"),
  SalesOrderController.deleteQuote,
);
salesOrderRoutes.post(
  "/quotes/:id/convert",
  requirePermission("invoicing", "CREATE"),
  SalesOrderController.convertQuoteToOrder,
);

salesOrderRoutes.get(
  "/",
  requirePermission("invoicing", "READ"),
  SalesOrderController.listOrders,
);
salesOrderRoutes.get(
  "/:id/process-workspace",
  requirePermission("invoicing", "READ"),
  SalesOrderController.getProcessWorkspace,
);
salesOrderRoutes.get(
  "/:id",
  requirePermission("invoicing", "READ"),
  SalesOrderController.getOrderById,
);
salesOrderRoutes.get(
  "/:id/history",
  requirePermission("invoicing", "READ"),
  SalesOrderController.getOrderHistory,
);
salesOrderRoutes.post(
  "/",
  requirePermission("invoicing", "CREATE"),
  validateBody(createSalesOrderBodySchema),
  SalesOrderController.createOrder,
);
salesOrderRoutes.patch(
  "/:id",
  requirePermission("invoicing", "UPDATE"),
  validateBody(updateSalesOrderBodySchema),
  SalesOrderController.updateOrder,
);
salesOrderRoutes.post(
  "/:id/fulfill",
  requirePermission("invoicing", "UPDATE"),
  validateBody(fulfillSalesOrderBodySchema),
  SalesOrderController.fulfillOrder,
);
salesOrderRoutes.post(
  "/:id/cancel",
  requirePermission("invoicing", "UPDATE"),
  SalesOrderController.cancelOrder,
);

export { salesOrderRoutes };
