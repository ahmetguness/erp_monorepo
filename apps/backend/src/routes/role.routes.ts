import { ACCESS_POLICIES } from "@repo/types/plans";
import { Hono } from "hono";
import { requireAccess } from "../middleware/requireAccess";
import { requirePermission } from "../middleware/requirePermission";
import { validateBody } from "../middleware/validateBody";
import { RoleController } from "../modules/identity/http/controllers/index.js";
import { addRolePermissionBodySchema, createRoleBodySchema, updateRoleBodySchema } from "../schemas/request-body.schemas";

const roleRoutes = new Hono();

roleRoutes.use("*", requireAccess(ACCESS_POLICIES.roles));

roleRoutes.get("/", requirePermission("roles", "READ"), RoleController.list);
roleRoutes.get(
  "/permission-simulator/matrix",
  requirePermission("roles", "READ"),
  RoleController.permissionMatrix,
);
roleRoutes.post(
  "/permission-simulator/simulate",
  requirePermission("roles", "READ"),
  RoleController.simulatePermission,
);
roleRoutes.post(
  "/permission-simulator/screen-preview",
  requirePermission("roles", "READ"),
  RoleController.screenPreview,
);
roleRoutes.get(
  "/:id",
  requirePermission("roles", "READ"),
  RoleController.getById,
);
roleRoutes.post(
  "/",
  requirePermission("roles", "CREATE"),
  validateBody(createRoleBodySchema),
  RoleController.create,
);
roleRoutes.patch(
  "/:id",
  requirePermission("roles", "UPDATE"),
  validateBody(updateRoleBodySchema),
  RoleController.update,
);
roleRoutes.delete(
  "/:id",
  requirePermission("roles", "DELETE"),
  RoleController.delete,
);

// Permissions
roleRoutes.post(
  "/:id/permissions",
  requirePermission("roles", "UPDATE"),
  validateBody(addRolePermissionBodySchema),
  RoleController.addPermission,
);
roleRoutes.delete(
  "/:id/permissions/:permissionId",
  requirePermission("roles", "UPDATE"),
  RoleController.removePermission,
);

export { roleRoutes };
