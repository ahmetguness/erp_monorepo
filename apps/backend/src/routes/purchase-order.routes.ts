import { ACCESS_POLICIES } from "@repo/types/plans";
import { Hono } from "hono";
import { requireAccess } from "../middleware/requireAccess";
import { requirePermission } from "../middleware/requirePermission";
import { PurchaseOrderController } from "../modules/procurement/http/controllers/index.js";

const purchaseOrderRoutes = new Hono();

purchaseOrderRoutes.use("*", requireAccess(ACCESS_POLICIES.purchasing));

purchaseOrderRoutes.post(
  "/automation/reorder",
  requirePermission("purchasing", "CREATE"),
  PurchaseOrderController.runReorderAutomation,
);

purchaseOrderRoutes.get(
  "/requests",
  requirePermission("purchasing", "READ"),
  PurchaseOrderController.listRequests,
);
purchaseOrderRoutes.post(
  "/requests",
  requirePermission("purchasing", "CREATE"),
  PurchaseOrderController.createRequest,
);
purchaseOrderRoutes.patch(
  "/requests/:id",
  requirePermission("purchasing", "UPDATE"),
  PurchaseOrderController.updateRequest,
);
purchaseOrderRoutes.get(
  "/requests/:id/history",
  requirePermission("purchasing", "READ"),
  PurchaseOrderController.getRequestHistory,
);
purchaseOrderRoutes.post(
  "/requests/:id/submit",
  requirePermission("purchasing", "UPDATE"),
  PurchaseOrderController.submitRequest,
);
purchaseOrderRoutes.post(
  "/requests/:id/approve",
  requirePermission("purchasing", "UPDATE"),
  PurchaseOrderController.approveRequest,
);
purchaseOrderRoutes.post(
  "/requests/:id/reject",
  requirePermission("purchasing", "UPDATE"),
  PurchaseOrderController.rejectRequest,
);
purchaseOrderRoutes.post(
  "/requests/:id/cancel",
  requirePermission("purchasing", "UPDATE"),
  PurchaseOrderController.cancelRequest,
);
purchaseOrderRoutes.post(
  "/requests/:id/convert",
  requirePermission("purchasing", "CREATE"),
  PurchaseOrderController.convertRequestToOrder,
);

purchaseOrderRoutes.get(
  "/",
  requirePermission("purchasing", "READ"),
  PurchaseOrderController.listOrders,
);
purchaseOrderRoutes.get(
  "/:id/three-way-match",
  requirePermission("purchasing", "READ"),
  PurchaseOrderController.getThreeWayMatch,
);
purchaseOrderRoutes.get(
  "/:id",
  requirePermission("purchasing", "READ"),
  PurchaseOrderController.getOrderById,
);
purchaseOrderRoutes.get(
  "/:id/history",
  requirePermission("purchasing", "READ"),
  PurchaseOrderController.getOrderHistory,
);
purchaseOrderRoutes.post(
  "/",
  requirePermission("purchasing", "CREATE"),
  PurchaseOrderController.createOrder,
);
purchaseOrderRoutes.post(
  "/:id/send",
  requirePermission("purchasing", "UPDATE"),
  PurchaseOrderController.sendOrder,
);
purchaseOrderRoutes.post(
  "/:id/receive",
  requirePermission("purchasing", "UPDATE"),
  PurchaseOrderController.receiveOrder,
);
purchaseOrderRoutes.post(
  "/:id/cancel",
  requirePermission("purchasing", "UPDATE"),
  PurchaseOrderController.cancelOrder,
);

export { purchaseOrderRoutes };
