import { ACCESS_POLICIES } from "@repo/types/plans";
import { Hono } from "hono";
import { requireAccess } from "../middleware/requireAccess";
import { requirePermission } from "../middleware/requirePermission";
import { DeliveryNoteController } from "../modules/sales/http/controllers/index.js";
import { validateBody } from "../middleware/validateBody";
import { createDeliveryNoteBodySchema, updateDeliveryNoteStatusBodySchema } from "../schemas/request-body.schemas";

const deliveryNoteRoutes = new Hono();

deliveryNoteRoutes.use("*", requireAccess(ACCESS_POLICIES.deliveryNotes));

deliveryNoteRoutes.get(
  "/",
  requirePermission("invoicing", "READ"),
  DeliveryNoteController.list,
);
deliveryNoteRoutes.get(
  "/:id",
  requirePermission("invoicing", "READ"),
  DeliveryNoteController.getById,
);
deliveryNoteRoutes.post(
  "/",
  requirePermission("invoicing", "CREATE"),
  validateBody(createDeliveryNoteBodySchema),
  DeliveryNoteController.create,
);
deliveryNoteRoutes.patch(
  "/:id/status",
  requirePermission("invoicing", "UPDATE"),
  validateBody(updateDeliveryNoteStatusBodySchema),
  DeliveryNoteController.updateStatus,
);
deliveryNoteRoutes.delete(
  "/:id",
  requirePermission("invoicing", "DELETE"),
  DeliveryNoteController.remove,
);

export { deliveryNoteRoutes };
