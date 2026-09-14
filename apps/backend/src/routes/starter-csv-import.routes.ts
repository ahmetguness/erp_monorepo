import { Hono } from "hono";
import { requireModule } from "../middleware/requireModule.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { StarterCsvImportController } from "../modules/platform/http/controllers/index.js";
import { MODULE_KEYS } from "../types/module.types.js";

const starterCsvImportRoutes = new Hono();

starterCsvImportRoutes.get(
  "/products/template",
  requireModule(MODULE_KEYS.INVENTORY),
  requirePermission("inventory", "READ"),
  StarterCsvImportController.template,
);
starterCsvImportRoutes.post(
  "/products/preview",
  requireModule(MODULE_KEYS.INVENTORY),
  requirePermission("inventory", "CREATE"),
  StarterCsvImportController.preview,
);
starterCsvImportRoutes.post(
  "/products/commit",
  requireModule(MODULE_KEYS.INVENTORY),
  requirePermission("inventory", "CREATE"),
  StarterCsvImportController.commit,
);

starterCsvImportRoutes.get(
  "/contacts/template",
  requireModule(MODULE_KEYS.CONTACTS),
  requirePermission("contacts", "READ"),
  StarterCsvImportController.template,
);
starterCsvImportRoutes.post(
  "/contacts/preview",
  requireModule(MODULE_KEYS.CONTACTS),
  requirePermission("contacts", "CREATE"),
  StarterCsvImportController.preview,
);
starterCsvImportRoutes.post(
  "/contacts/commit",
  requireModule(MODULE_KEYS.CONTACTS),
  requirePermission("contacts", "CREATE"),
  StarterCsvImportController.commit,
);

for (const entity of ["opening-stock", "prices"] as const) {
  starterCsvImportRoutes.get(
    `/${entity}/template`,
    requireModule(MODULE_KEYS.INVENTORY),
    requirePermission("inventory", "READ"),
    StarterCsvImportController.template,
  );
  starterCsvImportRoutes.post(
    `/${entity}/preview`,
    requireModule(MODULE_KEYS.INVENTORY),
    requirePermission("inventory", "CREATE"),
    StarterCsvImportController.preview,
  );
  starterCsvImportRoutes.post(
    `/${entity}/commit`,
    requireModule(MODULE_KEYS.INVENTORY),
    requirePermission("inventory", "CREATE"),
    StarterCsvImportController.commit,
  );
}

export { starterCsvImportRoutes };
