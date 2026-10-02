import { ACCESS_POLICIES } from "@repo/types/plans";
import { Hono } from "hono";
import { requireAccess } from "../middleware/requireAccess";
import { requirePermission } from "../middleware/requirePermission";
import { CheckPromissoryController } from "../modules/finance/http/controllers/index.js";
import { validateBody } from "../middleware/validateBody.js";
import { createCheckPromissoryBodySchema, updateCheckPromissoryBodySchema, updateCheckPromissoryStatusBodySchema } from "../schemas/request-body.schemas.js";

const checkPromissoryRoutes = new Hono();

checkPromissoryRoutes.use("*", requireAccess(ACCESS_POLICIES.checkPromissory));

checkPromissoryRoutes.get(
  "/",
  requirePermission("accounting", "READ"),
  CheckPromissoryController.list,
);
checkPromissoryRoutes.post(
  "/",
  requirePermission("accounting", "CREATE"),
  validateBody(createCheckPromissoryBodySchema),
  CheckPromissoryController.create,
);
checkPromissoryRoutes.patch(
  "/:id",
  requirePermission("accounting", "UPDATE"),
  validateBody(updateCheckPromissoryBodySchema),
  CheckPromissoryController.update,
);
checkPromissoryRoutes.patch(
  "/:id/status",
  requirePermission("accounting", "UPDATE"),
  validateBody(updateCheckPromissoryStatusBodySchema),
  CheckPromissoryController.updateStatus,
);
checkPromissoryRoutes.delete(
  "/:id",
  requirePermission("accounting", "DELETE"),
  CheckPromissoryController.remove,
);

export { checkPromissoryRoutes };
